from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
from PIL import Image

from _common import (
    binary_metrics,
    build_all_hold_mask,
    build_parser,
    component_recall,
    load_manifest,
    percentile,
    read_jsonl,
    rasterize_polygons,
    write_jsonl,
)
from combo_utils import (
    instances_from_scored_rows,
    mask_iou,
    rows_by_split,
    selected_route_from_scored_rows,
)


def parse_args():
    parser = build_parser("Evaluate SAM+Crux combo route-mask heads against manual manifest labels.")
    parser.add_argument("--proposal-rows", default=".data/vision/heidelberg-sam3-combo-proposals/proposals.jsonl")
    parser.add_argument("--manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--model-card", default=None)
    parser.add_argument("--crux-heads", default=".models/vision/crux-combo-heads-v1/onnx/combo-heads.onnx")
    parser.add_argument("--split", default="val", choices=["train", "val", "test", "all"])
    parser.add_argument("--out", default="scripts/output/vision-ml/eval-combo-route")
    parser.add_argument("--hold-threshold", type=float, default=None)
    return parser.parse_args()


def load_card(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def score_with_onnx(onnx_path: Path, features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    try:
        import onnxruntime as ort
    except ImportError as error:
        raise SystemExit("Missing onnxruntime. Install scripts/vision-ml/requirements.txt.") from error
    session = ort.InferenceSession(str(onnx_path), providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    scores, embedding = session.run(None, {"features": features.astype(np.float32)})
    return scores, embedding


def route_masks_for_entry(entry, size: tuple[int, int]):
    hold_masks = [rasterize_polygons(size[0], size[1], [hold.polygon]) for hold in entry.holds]
    all_holds = build_all_hold_mask(hold_masks, size)
    route_masks = []
    for route in entry.routes:
        masks = [hold_masks[hold_id] for hold_id in route.hold_ids if hold_id < len(hold_masks)]
        route_masks.append(build_all_hold_mask(masks, size))
    return hold_masks, all_holds, route_masks


def run() -> None:
    args = parse_args()
    out = Path(args.out).resolve()
    masks_out = out / "masks"
    masks_out.mkdir(parents=True, exist_ok=True)
    card = None
    if args.model_card:
        card_path = Path(args.model_card).resolve()
        card = load_card(card_path)
        onnx_path = (card_path.parent / card["files"]["cruxHeads"]["path"]).resolve()
    else:
        onnx_path = Path(args.crux_heads).resolve()
    hold_threshold = float(args.hold_threshold or (card or {}).get("thresholds", {}).get("hold", 0.5))
    entries = {entry.id: entry for entry in load_manifest(Path(args.manifest).resolve())}
    rows = rows_by_split(read_jsonl(Path(args.proposal_rows).resolve()), args.split)
    rows_by_image: dict[str, list[dict]] = {}
    for row in rows:
        rows_by_image.setdefault(str(row["imageId"]), []).append(row)

    metric_rows = []
    runtime_values: list[float] = []
    all_hold_recalls: list[float] = []
    all_hold_f1s: list[float] = []
    best_route_ious: list[float] = []
    selected_route_ious: list[float] = []
    hold_true = hold_false = hold_fp = hold_fn = 0

    for image_id, image_rows in rows_by_image.items():
        entry = entries.get(image_id)
        if entry is None:
            continue
        image = Image.open(entry.image_path).convert("RGB")
        features = np.asarray([row["features"] for row in image_rows], dtype=np.float32)
        start = time.perf_counter()
        scores, embeddings = score_with_onnx(onnx_path, features) if len(image_rows) else (np.zeros((0, 3)), np.zeros((0, 8)))
        scored_rows = []
        for index, row in enumerate(image_rows):
            predicted_hold = float(scores[index][0]) >= hold_threshold
            truth_hold = int(row.get("isHold", 0)) == 1
            hold_true += int(predicted_hold and truth_hold)
            hold_false += int((not predicted_hold) and (not truth_hold))
            hold_fp += int(predicted_hold and not truth_hold)
            hold_fn += int((not predicted_hold) and truth_hold)
            scored_rows.append(
                {
                    **row,
                    "embedding": embeddings[index].tolist(),
                    "scores": {
                        "isHold": float(scores[index][0]),
                        "routeRelevance": float(scores[index][1]),
                        "quality": float(scores[index][2]),
                    },
                }
            )
        selected_mask, instances, selected_group = selected_route_from_scored_rows(image, scored_rows, hold_threshold)
        runtime_ms = (time.perf_counter() - start) * 1000
        accepted_mask = build_all_hold_mask([instance.mask for instance in instances], image.size)
        hold_masks, all_holds, route_masks = route_masks_for_entry(entry, image.size)
        all_metrics = binary_metrics(accepted_mask, all_holds)
        route_ious = [mask_iou(selected_mask, route_mask) for route_mask in route_masks]
        selected_route_iou = max(route_ious) if route_ious else 0.0
        best_route_iou = 0.0
        for instance in instances:
            for route_mask in route_masks:
                best_route_iou = max(best_route_iou, mask_iou(instance.mask, route_mask))
        selected_path = masks_out / f"{image_id}-selected.png"
        selected_mask.save(selected_path)
        runtime_values.append(runtime_ms)
        all_hold_recalls.append(float(all_metrics["recall"]))
        all_hold_f1s.append(float(all_metrics["f1"]))
        best_route_ious.append(best_route_iou)
        selected_route_ious.append(selected_route_iou)
        metric_rows.append(
            {
                "id": image_id,
                "runtimeMs": runtime_ms,
                "proposalCount": len(image_rows),
                "acceptedHoldCount": len(instances),
                "selectedRouteCandidateId": selected_group.id if selected_group is not None else None,
                "selectedMaskPath": str(selected_path.relative_to(out)),
                "allHold": all_metrics,
                "componentRecall": component_recall(accepted_mask, hold_masks),
                "bestRouteGroupIou": best_route_iou,
                "autoRouteIou": selected_route_iou,
            }
        )

    precision = 0.0 if hold_true + hold_fp == 0 else hold_true / (hold_true + hold_fp)
    recall = 0.0 if hold_true + hold_fn == 0 else hold_true / (hold_true + hold_fn)
    f1 = 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)
    summary = {
        "imageCount": len(metric_rows),
        "split": args.split,
        "holdThreshold": hold_threshold,
        "holdProposal": {"precision": precision, "recall": recall, "f1": f1},
        "allHold": {"recall": average(all_hold_recalls), "f1": average(all_hold_f1s)},
        "bestRouteGroupIou": average(best_route_ious),
        "autoRouteIou": average(selected_route_ious),
        "runtimeMs": {"p50": percentile(runtime_values, 50), "p90": percentile(runtime_values, 90)},
        "gates": {
            "proposalRecall": recall >= 0.9,
            "holdProposalF1": f1 >= 0.82,
            "bestRouteGroupIou": average(best_route_ious) >= 0.75,
            "autoRouteIou": average(selected_route_ious) >= 0.65,
            "p90RuntimeMs": percentile(runtime_values, 90) <= 1500,
        },
    }
    write_jsonl(out / "metrics.jsonl", metric_rows)
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

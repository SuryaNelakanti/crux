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
    group_instances_by_color,
    load_manifest,
    make_predicted_instances,
    percentile,
    rasterize_polygons,
    select_route_group,
    write_jsonl,
)


def parse_args():
    parser = build_parser("Evaluate a YOLO hold segmentation model against the Crux vision manifest.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--manifest", default=".data/vision/heidelberg-yolo/crux-manifest.jsonl")
    parser.add_argument("--split", default="val", choices=["train", "val", "test", "all"])
    parser.add_argument("--out", default="scripts/output/vision-ml/eval")
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.6)
    parser.add_argument("--device", default=None)
    parser.add_argument("--retina-masks", action="store_true")
    return parser.parse_args()


def resize_polygon(polygon: list[dict[str, float]], scale_x: float, scale_y: float) -> list[dict[str, float]]:
    return [{"x": float(point["x"]) * scale_x, "y": float(point["y"]) * scale_y} for point in polygon]


def build_ground_truth(entry, size: tuple[int, int]):
    scale_x = size[0] / max(1, entry.width)
    scale_y = size[1] / max(1, entry.height)
    hold_masks = [
        rasterize_polygons(size[0], size[1], [resize_polygon(hold.polygon, scale_x, scale_y)])
        for hold in entry.holds
    ]
    all_holds = build_all_hold_mask(hold_masks, size)
    route_masks = []
    for route in entry.routes:
        masks = [hold_masks[hold_id] for hold_id in route.hold_ids if hold_id < len(hold_masks)]
        route_masks.append({"route": route, "mask": build_all_hold_mask(masks, size)})
    return hold_masks, all_holds, route_masks


def predict_masks(
    model,
    image_path: Path,
    imgsz: int,
    conf: float,
    iou: float,
    device: str | None,
    retina_masks: bool,
):
    start = time.perf_counter()
    results = model.predict(
        source=str(image_path),
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        device=device,
        retina_masks=retina_masks,
        verbose=False,
    )
    runtime_ms = (time.perf_counter() - start) * 1000
    result = results[0]
    image = Image.open(image_path).convert("RGB")
    if result.masks is None:
        return image, [], [], runtime_ms

    mask_arrays = result.masks.data.detach().cpu().numpy()
    confidences = (
        result.boxes.conf.detach().cpu().numpy().tolist()
        if result.boxes is not None and result.boxes.conf is not None
        else [1.0] * len(mask_arrays)
    )
    masks = []
    for mask_array in mask_arrays:
        mask = Image.fromarray((mask_array > 0.5).astype(np.uint8) * 255)
        if mask.size != image.size:
            mask = mask.resize(image.size, Image.Resampling.NEAREST)
        masks.append(mask.convert("L"))
    return image, masks, confidences, runtime_ms


def average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def mask_array(mask: Image.Image) -> np.ndarray:
    return np.asarray(mask.convert("L")) > 0


def mask_iou(predicted: np.ndarray, ground_truth: np.ndarray) -> float:
    true_positive = int(np.count_nonzero(predicted & ground_truth))
    false_positive = int(np.count_nonzero(predicted & ~ground_truth))
    false_negative = int(np.count_nonzero(~predicted & ground_truth))
    denominator = true_positive + false_positive + false_negative
    return 0.0 if denominator == 0 else true_positive / denominator


def run() -> None:
    args = parse_args()
    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise SystemExit(
            "Missing Python ML dependencies. Run: python -m pip install -r scripts/vision-ml/requirements.txt"
        ) from error

    out = Path(args.out).resolve()
    masks_out = out / "masks"
    masks_out.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(Path(args.model).resolve()), task="segment")
    entries = load_manifest(Path(args.manifest).resolve())
    rows = [entry for entry in entries if args.split == "all" or getattr(entry, "split", args.split) == args.split]
    if not rows:
        raw_rows = []
        with Path(args.manifest).resolve().open("r", encoding="utf-8") as handle:
            raw_rows = [json.loads(line) for line in handle if line.strip()]
        ids = {row["id"] for row in raw_rows if args.split == "all" or row.get("split") == args.split}
        rows = [entry for entry in entries if entry.id in ids]

    metric_rows = []
    runtime_values: list[float] = []
    all_hold_iou: list[float] = []
    all_hold_precision: list[float] = []
    all_hold_recall: list[float] = []
    all_hold_f1: list[float] = []
    component_recalls: list[float] = []
    best_route_group_ious: list[float] = []
    auto_route_ious: list[float] = []

    for entry in rows:
        image, predicted_masks, confidences, runtime_ms = predict_masks(
            model, entry.image_path, args.imgsz, args.conf, args.iou, args.device, args.retina_masks
        )
        runtime_values.append(runtime_ms)
        hold_masks, all_hold_gt, route_masks = build_ground_truth(entry, image.size)
        instances = make_predicted_instances(image, predicted_masks, confidences)
        groups = group_instances_by_color(instances)
        selected_group = select_route_group(groups, instances)
        predicted_all = build_all_hold_mask([instance.mask for instance in instances], image.size)

        all_metrics = binary_metrics(predicted_all, all_hold_gt)
        comp_recall = component_recall(predicted_all, hold_masks)
        route_arrays = [mask_array(route["mask"]) for route in route_masks]
        group_arrays = [mask_array(group.mask) for group in groups]
        best_route_iou = 0.0
        for group_array in group_arrays:
            for route_array in route_arrays:
                best_route_iou = max(best_route_iou, mask_iou(group_array, route_array))
        auto_route_iou = 0.0
        if selected_group is not None:
            selected_array = mask_array(selected_group.mask)
            for route_array in route_arrays:
                auto_route_iou = max(auto_route_iou, mask_iou(selected_array, route_array))

        selected_mask = selected_group.mask if selected_group is not None else Image.new("L", image.size, 0)
        selected_path = masks_out / f"{entry.id}-selected.png"
        holds_path = masks_out / f"{entry.id}-predicted-holds.png"
        selected_mask.save(selected_path)
        predicted_all.save(holds_path)

        all_hold_iou.append(float(all_metrics["iou"]))
        all_hold_precision.append(float(all_metrics["precision"]))
        all_hold_recall.append(float(all_metrics["recall"]))
        all_hold_f1.append(float(all_metrics["f1"]))
        component_recalls.append(comp_recall)
        best_route_group_ious.append(best_route_iou)
        auto_route_ious.append(auto_route_iou)

        metric_rows.append(
            {
                "id": entry.id,
                "imagePath": str(entry.image_path),
                "width": image.width,
                "height": image.height,
                "runtimeMs": runtime_ms,
                "instanceCount": len(instances),
                "groupCount": len(groups),
                "selectedGroupId": selected_group.id if selected_group is not None else None,
                "selectedMaskPath": str(selected_path.relative_to(out)),
                "predictedHoldsMaskPath": str(holds_path.relative_to(out)),
                "allHold": all_metrics,
                "componentRecall": comp_recall,
                "bestRouteGroupIou": best_route_iou,
                "autoRouteIou": auto_route_iou,
            }
        )

    write_jsonl(out / "metrics.jsonl", metric_rows)
    summary = {
        "imageCount": len(metric_rows),
        "model": str(Path(args.model).resolve()),
        "imgsz": args.imgsz,
        "conf": args.conf,
        "iou": args.iou,
        "split": args.split,
        "allHold": {
            "iou": average(all_hold_iou),
            "precision": average(all_hold_precision),
            "recall": average(all_hold_recall),
            "f1": average(all_hold_f1),
        },
        "componentRecall": average(component_recalls),
        "bestRouteGroupIou": average(best_route_group_ious),
        "autoRouteIou": average(auto_route_ious),
        "runtimeMs": {"p50": percentile(runtime_values, 50), "p90": percentile(runtime_values, 90)},
        "gates": {
            "allHoldRecall": average(all_hold_recall) >= 0.9,
            "bestRouteGroupIou": average(best_route_group_ious) >= 0.75,
            "autoRouteIou": average(auto_route_ious) >= 0.65,
            "p90RuntimeMs": percentile(runtime_values, 90) <= 1500,
        },
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

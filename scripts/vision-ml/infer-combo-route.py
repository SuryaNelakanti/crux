from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
from PIL import Image

from _common import build_all_hold_mask, build_parser
from combo_utils import (
    draw_overlay,
    instances_from_scored_rows,
    load_combo_proposals,
    proposal_features,
    proposal_rows_from_json,
    selected_route_from_scored_rows,
)


def parse_args():
    parser = build_parser("Run local SAM+Crux combo route-mask inference for one image.")
    parser.add_argument("--image", required=True)
    parser.add_argument("--model-card", default=".models/vision/crux-route-mask-combo-v1/model-card.json")
    parser.add_argument("--sam-proposals", required=True, help="proposals.json from propose-sam3-labels.py for this image.")
    parser.add_argument("--image-id", default=None)
    parser.add_argument("--out", default="scripts/output/vision-ml/infer-combo")
    parser.add_argument("--hold-threshold", type=float, default=None)
    return parser.parse_args()


def load_model_card(path: Path) -> dict:
    card = json.loads(path.read_text(encoding="utf-8"))
    if card.get("schemaVersion") != 2 or card.get("method") != "ml-combo-v1":
        raise ValueError("Combo inference requires a schemaVersion 2 ml-combo-v1 model card")
    return card


def proposal_row_for_image(proposal_path: Path, image_path: Path, image_id: str | None) -> dict:
    rows = proposal_rows_from_json(proposal_path)
    candidates = []
    for row in rows:
        row_id = str(row.get("id", ""))
        relative = str(row.get("relativePath", ""))
        if image_id and row_id == image_id:
            candidates.append(row)
        elif relative and Path(relative).name == image_path.name:
            candidates.append(row)
        elif row_id and row_id in {image_path.stem, image_path.name}:
            candidates.append(row)
    if not candidates and len(rows) == 1:
        return rows[0]
    if not candidates:
        raise ValueError(f"No proposal row matched image {image_path}")
    return candidates[0]


def score_with_onnx(onnx_path: Path, features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    try:
        import onnxruntime as ort
    except ImportError as error:
        raise SystemExit("Missing onnxruntime. Install scripts/vision-ml/requirements.txt.") from error
    session = ort.InferenceSession(str(onnx_path), providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    scores, embedding = session.run(None, {"features": features.astype(np.float32)})
    return scores, embedding


def run() -> None:
    args = parse_args()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    image_path = Path(args.image).resolve()
    image = Image.open(image_path).convert("RGB")
    card_path = Path(args.model_card).resolve()
    card = load_model_card(card_path)
    onnx_path = (card_path.parent / card["files"]["cruxHeads"]["path"]).resolve()
    hold_threshold = float(args.hold_threshold or card.get("thresholds", {}).get("hold", 0.5))

    proposal_start = time.perf_counter()
    raw_row = proposal_row_for_image(Path(args.sam_proposals).resolve(), image_path, args.image_id)
    proposals = load_combo_proposals(raw_row, image)
    feature_matrix = np.asarray([proposal_features(proposal, image.size) for proposal in proposals], dtype=np.float32)
    proposal_ms = (time.perf_counter() - proposal_start) * 1000

    scoring_start = time.perf_counter()
    if len(proposals) == 0:
        scores = np.zeros((0, 3), dtype=np.float32)
        embedding = np.zeros((0, 8), dtype=np.float32)
    else:
        scores, embedding = score_with_onnx(onnx_path, feature_matrix)
    scoring_ms = (time.perf_counter() - scoring_start) * 1000

    scored_rows = []
    for index, proposal in enumerate(proposals):
        scored_rows.append(
            {
                "proposalId": proposal.id,
                "polygon": proposal.polygon,
                "features": feature_matrix[index].tolist(),
                "embedding": embedding[index].tolist(),
                "scores": {
                    "isHold": float(scores[index][0]),
                    "routeRelevance": float(scores[index][1]),
                    "quality": float(scores[index][2]),
                },
            }
        )

    selection_start = time.perf_counter()
    selected_mask, instances, selected_group = selected_route_from_scored_rows(image, scored_rows, hold_threshold)
    accepted_mask = build_all_hold_mask([instance.mask for instance in instances], image.size)
    selection_ms = (time.perf_counter() - selection_start) * 1000
    selected_path = out / "selected-route-mask.png"
    accepted_path = out / "accepted-holds-mask.png"
    selected_mask.save(selected_path)
    accepted_mask.save(accepted_path)
    draw_overlay(image, selected_mask, out / "selected-route-overlay.jpg")
    draw_overlay(image, accepted_mask, out / "accepted-holds-overlay.jpg")
    report = {
        "method": "ml-combo-v1",
        "modelCard": str(card_path),
        "image": str(image_path),
        "proposalCount": len(proposals),
        "acceptedHoldCount": len(instances),
        "selectedRouteCandidateId": selected_group.id if selected_group is not None else None,
        "selectedMaskPath": str(selected_path),
        "acceptedHoldsMaskPath": str(accepted_path),
        "holdThreshold": hold_threshold,
        "runtimeMs": {
            "proposal": proposal_ms,
            "scoring": scoring_ms,
            "selection": selection_ms,
            "total": proposal_ms + scoring_ms + selection_ms,
        },
        "scoredProposals": scored_rows,
    }
    (out / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()


from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image

from _common import build_parser, load_manifest, median_color_hsl, rasterize_polygons
from combo_utils import ComboProposal, PROPOSAL_FEATURE_NAMES, proposal_features, write_proposal_dataset


def parse_args():
    parser = build_parser("Build bootstrap combo proposals from manual holds plus deterministic background negatives.")
    parser.add_argument("--manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--out", default="scripts/output/vision-ml/oracle-combo-proposals/proposals.json")
    parser.add_argument("--dataset-out", default=None, help="Optional combo proposal dataset directory to write directly.")
    parser.add_argument("--negative-per-image", type=int, default=48)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def bbox_polygon(left: float, top: float, right: float, bottom: float) -> list[dict[str, float]]:
    return [
        {"x": left, "y": top},
        {"x": right, "y": top},
        {"x": right, "y": bottom},
        {"x": left, "y": bottom},
    ]


def jitter_polygon(polygon: list[dict[str, float]], width: int, height: int, rng: random.Random) -> list[dict[str, float]]:
    jittered = []
    for point in polygon:
        jittered.append(
            {
                "x": clamp(float(point["x"]) + rng.uniform(-2.0, 2.0), 0, width - 1),
                "y": clamp(float(point["y"]) + rng.uniform(-2.0, 2.0), 0, height - 1),
            }
        )
    return jittered


def negative_polygon(width: int, height: int, rng: random.Random) -> list[dict[str, float]]:
    box_w = rng.uniform(width * 0.015, width * 0.09)
    box_h = rng.uniform(height * 0.015, height * 0.09)
    left = rng.uniform(0, max(1, width - box_w - 1))
    top = rng.uniform(0, max(1, height - box_h - 1))
    return bbox_polygon(left, top, min(width - 1, left + box_w), min(height - 1, top + box_h))


def build_rows(manifest: Path, negative_per_image: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for entry in load_manifest(manifest):
        proposals = []
        for hold in entry.holds:
            proposals.append(
                {
                    "confidence": 0.96,
                    "edgeConfidence": 0.9,
                    "holdId": hold.id,
                    "isHold": True,
                    "polygon": jitter_polygon(hold.polygon, entry.width, entry.height, rng),
                    "routeId": hold.route_id,
                    "source": "manual-oracle-positive",
                }
            )
        for _ in range(negative_per_image):
            proposals.append(
                {
                    "confidence": 0.18,
                    "edgeConfidence": 0.25,
                    "isHold": False,
                    "polygon": negative_polygon(entry.width, entry.height, rng),
                    "source": "manual-oracle-negative",
                }
            )
        rows.append(
            {
                "id": entry.id,
                "imagePath": str(entry.image_path),
                "width": entry.width,
                "height": entry.height,
                "proposalCount": len(proposals),
                "proposals": proposals,
                "source": "manual-oracle-bootstrap",
            }
        )
    return rows


def build_dataset_rows(manifest: Path, proposal_rows: list[dict]) -> tuple[list[dict], dict]:
    entries = {entry.id: entry for entry in load_manifest(manifest)}
    rows = []
    for raw_row in proposal_rows:
        entry = entries[str(raw_row["id"])]
        image = Image.open(entry.image_path).convert("RGB")
        for proposal_id, proposal in enumerate(raw_row["proposals"]):
            polygon = proposal["polygon"]
            mask = rasterize_polygons(image.width, image.height, [polygon])
            bbox = mask.getbbox()
            if bbox is None:
                continue
            combo_proposal = ComboProposal(
                id=proposal_id,
                mask=mask,
                confidence=float(proposal.get("confidence", 1.0)),
                polygon=polygon,
                bbox=bbox,
                color=median_color_hsl(image, mask, bbox),
                edge_confidence=float(proposal.get("edgeConfidence", proposal.get("confidence", 1.0))),
            )
            is_hold = bool(proposal.get("isHold", False))
            rows.append(
                {
                    "id": f"{entry.id}:{proposal_id}",
                    "imageId": entry.id,
                    "imagePath": str(entry.image_path),
                    "width": image.width,
                    "height": image.height,
                    "split": getattr(entry, "split", "all"),
                    "proposalId": proposal_id,
                    "polygon": polygon,
                    "bbox": list(bbox),
                    "features": proposal_features(combo_proposal, image.size),
                    "featureNames": PROPOSAL_FEATURE_NAMES,
                    "label": "hold" if is_hold else "non_hold",
                    "isHold": 1 if is_hold else 0,
                    "trainWeight": 1.0,
                    "matchedHoldId": proposal.get("holdId"),
                    "matchedRouteId": proposal.get("routeId"),
                    "matchedIou": 1.0 if is_hold else 0.0,
                    "labelSource": "manual-oracle-bootstrap",
                }
            )
    split_counts = {}
    label_counts = {}
    for row in rows:
        split_counts[row["split"]] = split_counts.get(row["split"], 0) + 1
        label_counts[row["label"]] = label_counts.get(row["label"], 0) + 1
    return rows, {
        "proposalCount": len(rows),
        "splitCounts": split_counts,
        "labelCounts": label_counts,
        "featureNames": PROPOSAL_FEATURE_NAMES,
        "proposalRecall": 1.0,
        "source": "manual-oracle-bootstrap",
    }


def run() -> None:
    args = parse_args()
    manifest = Path(args.manifest).resolve()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = build_rows(manifest, args.negative_per_image, args.seed)
    out.write_text(json.dumps(rows, indent=2, sort_keys=True), encoding="utf-8")
    summary = {
        "out": str(out),
        "manifest": str(manifest),
        "imageCount": len(rows),
        "proposalCount": sum(int(row["proposalCount"]) for row in rows),
        "negativePerImage": args.negative_per_image,
        "source": "manual-oracle-bootstrap",
    }
    (out.parent / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    if args.dataset_out:
        dataset_rows, dataset_summary = build_dataset_rows(manifest, rows)
        write_proposal_dataset(Path(args.dataset_out).resolve(), dataset_rows, dataset_summary)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

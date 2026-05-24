from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from _common import build_parser, load_manifest, stable_split, write_jsonl


def parse_args():
    parser = build_parser("Merge reviewed SAM3 proposal polygons into a train-only augmented manifest.")
    parser.add_argument("--base-manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--reviewed", required=True, help="Reviewed proposals JSON or VIA JSON.")
    parser.add_argument("--out", default=".data/vision/heidelberg-sam3-train/manifest.jsonl")
    parser.add_argument("--min-polygons", type=int, default=1)
    parser.add_argument("--train", type=float, default=0.8)
    parser.add_argument("--val", type=float, default=0.1)
    parser.add_argument(
        "--preserve-base-splits",
        action="store_true",
        help="Keep existing base manifest splits instead of assigning stable train/val/test splits.",
    )
    return parser.parse_args()


def is_record(value) -> bool:
    return isinstance(value, dict)


def polygon_from_shape(shape: dict) -> list[dict[str, float]] | None:
    xs = shape.get("all_points_x")
    ys = shape.get("all_points_y")
    if not isinstance(xs, list) or not isinstance(ys, list) or len(xs) != len(ys) or len(xs) < 3:
        return None
    return [{"x": float(x), "y": float(ys[index])} for index, x in enumerate(xs)]


def load_reviewed_rows(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return [row for row in raw if is_record(row)]
    if not is_record(raw):
        raise ValueError(f"Unsupported reviewed proposal format: {path}")
    if isinstance(raw.get("images"), list):
        return [row for row in raw["images"] if is_record(row)]
    if isinstance(raw.get("_via_img_metadata"), dict):
        rows = []
        for entry in raw["_via_img_metadata"].values():
            if not is_record(entry):
                continue
            proposals = []
            regions = entry.get("regions")
            if isinstance(regions, dict):
                regions_iter = regions.values()
            elif isinstance(regions, list):
                regions_iter = regions
            else:
                regions_iter = []
            for region in regions_iter:
                if not is_record(region) or not is_record(region.get("shape_attributes")):
                    continue
                polygon = polygon_from_shape(region["shape_attributes"])
                if polygon is not None:
                    proposals.append({"polygon": polygon, "source": "reviewed-sam3"})
            rows.append(
                {
                    "id": str(entry.get("id") or Path(str(entry.get("filename", ""))).stem),
                    "relativePath": str(entry.get("filename", "")),
                    "imagePath": str(entry.get("imagePath", "")),
                    "proposals": proposals,
                }
            )
        return rows
    return [raw]


def clamp_polygon(polygon: list[dict[str, float]], width: int, height: int) -> list[dict[str, float]]:
    return [
        {
            "x": min(width - 1, max(0.0, float(point["x"]))),
            "y": min(height - 1, max(0.0, float(point["y"]))),
        }
        for point in polygon
    ]


def resolve_image(row: dict, base_root: Path) -> Path | None:
    for key in ["imagePath", "path"]:
        value = row.get(key)
        if isinstance(value, str) and value:
            path = Path(value)
            if not path.is_absolute():
                path = (base_root / path).resolve()
            if path.exists():
                return path
    relative = row.get("relativePath")
    if isinstance(relative, str) and relative:
        path = (base_root / relative).resolve()
        if path.exists():
            return path
    return None


def manual_row(entry, split: str | None = None) -> dict:
    return {
        "id": entry.id,
        "split": split or entry.split,
        "imagePath": str(entry.image_path),
        "width": entry.width,
        "height": entry.height,
        "labelSource": "manual",
        "holds": [
            {
                "id": hold.id,
                "polygon": hold.polygon,
                "routeId": hold.route_id,
                "routeLabel": hold.route_label,
            }
            for hold in entry.holds
        ],
        "routes": [
            {
                "id": route.id,
                "label": route.label,
                "holdIds": route.hold_ids,
            }
            for route in entry.routes
        ],
    }


def proposal_row(row: dict, image_path: Path, index: int) -> dict | None:
    proposals = row.get("proposals")
    if not isinstance(proposals, list):
        return None
    with Image.open(image_path) as image:
        width = image.width
        height = image.height
    holds = []
    for proposal in proposals:
        if not is_record(proposal) or not isinstance(proposal.get("polygon"), list):
            continue
        polygon = clamp_polygon(proposal["polygon"], width, height)
        if len(polygon) < 3:
            continue
        holds.append(
            {
                "id": len(holds),
                "polygon": polygon,
                "routeId": "sam3_pseudo",
                "routeLabel": "sam3_pseudo",
                "labelSource": str(proposal.get("source", "reviewed-sam3")),
            }
        )
    if not holds:
        return None
    source_id = str(row.get("id") or image_path.stem)
    hold_ids = [hold["id"] for hold in holds]
    return {
        "id": f"sam3_{source_id}_{index}",
        "split": "train",
        "imagePath": str(image_path),
        "width": width,
        "height": height,
        "labelSource": "reviewed-sam3",
        "holds": holds,
        "routes": [{"id": "sam3_pseudo", "label": "sam3_pseudo", "holdIds": hold_ids}],
    }


def run() -> None:
    args = parse_args()
    base_manifest = Path(args.base_manifest).resolve()
    reviewed_path = Path(args.reviewed).resolve()
    out = Path(args.out).resolve()
    base_root = base_manifest.parent

    base_entries = load_manifest(base_manifest)
    rows = []
    base_split_counts = {"train": 0, "val": 0, "test": 0, "all": 0}
    if args.preserve_base_splits:
        for entry in base_entries:
            rows.append(manual_row(entry))
            base_split_counts[entry.split] = base_split_counts.get(entry.split, 0) + 1
    else:
        split_entries = stable_split(base_entries, train=args.train, val=args.val)
        for split_name, entries in split_entries.items():
            base_split_counts[split_name] = len(entries)
            rows.extend(manual_row(entry, split_name) for entry in entries)
    reviewed_rows = load_reviewed_rows(reviewed_path)
    added = 0
    skipped = 0
    for index, row in enumerate(reviewed_rows):
        image_path = resolve_image(row, base_root)
        if image_path is None:
            skipped += 1
            continue
        merged = proposal_row(row, image_path, index)
        if merged is None or len(merged["holds"]) < args.min_polygons:
            skipped += 1
            continue
        rows.append(merged)
        added += 1

    write_jsonl(out, rows)
    split_counts = {"train": 0, "val": 0, "test": 0, "all": 0}
    for row in rows:
        split_counts[row.get("split", "all")] = split_counts.get(row.get("split", "all"), 0) + 1
    summary = {
        "baseManifest": str(base_manifest),
        "reviewed": str(reviewed_path),
        "out": str(out),
        "baseImages": len(base_entries),
        "pseudoTrainImagesAdded": added,
        "reviewedRowsSkipped": skipped,
        "baseSplitCounts": base_split_counts,
        "splitCounts": split_counts,
        "labelPolicy": "manual base rows use stable or preserved splits; reviewed SAM3 proposals train-only",
    }
    (out.parent / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

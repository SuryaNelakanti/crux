from __future__ import annotations

import json
import sys
from pathlib import Path

from _common import build_parser, load_manifest


def parse_args():
    parser = build_parser("Validate a Crux/YOLO manifest before training or evaluation.")
    parser.add_argument("--manifest", default=".data/vision/heidelberg-yolo/crux-manifest.jsonl")
    parser.add_argument("--out", default=None)
    parser.add_argument("--min-images", type=int, default=1)
    parser.add_argument("--min-holds", type=int, default=1)
    parser.add_argument("--min-routes", type=int, default=1)
    parser.add_argument("--require-splits", action="store_true")
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def polygon_area(points: list[dict[str, float]]) -> float:
    if len(points) < 3:
        return 0.0
    area = 0.0
    for index, point in enumerate(points):
        other = points[(index + 1) % len(points)]
        area += float(point["x"]) * float(other["y"]) - float(other["x"]) * float(point["y"])
    return abs(area) / 2


def validate_manifest(manifest: Path, min_images: int, min_holds: int, min_routes: int, require_splits: bool) -> dict:
    issues: list[str] = []
    warnings: list[str] = []
    entries = load_manifest(manifest)
    split_counts = {"train": 0, "val": 0, "test": 0, "all": 0}
    hold_count = 0
    route_count = 0
    route_labeled_holds = 0

    for entry in entries:
        if entry.split in split_counts:
            split_counts[entry.split] += 1
        else:
            warnings.append(f"{entry.id}: unknown split '{entry.split}'")

        if not entry.image_path.exists():
            issues.append(f"{entry.id}: image not found: {entry.image_path}")
        if entry.width <= 0 or entry.height <= 0:
            issues.append(f"{entry.id}: invalid image dimensions {entry.width}x{entry.height}")
        if not entry.holds:
            issues.append(f"{entry.id}: no hold annotations")

        hold_ids = {hold.id for hold in entry.holds}
        for hold in entry.holds:
            hold_count += 1
            if hold.route_label:
                route_labeled_holds += 1
            if len(hold.polygon) < 3:
                issues.append(f"{entry.id}/hold-{hold.id}: polygon has fewer than 3 points")
                continue
            if polygon_area(hold.polygon) <= 0:
                issues.append(f"{entry.id}/hold-{hold.id}: polygon area is zero")
            for point in hold.polygon:
                x = float(point["x"])
                y = float(point["y"])
                if x < -1 or y < -1 or x > entry.width + 1 or y > entry.height + 1:
                    issues.append(f"{entry.id}/hold-{hold.id}: point outside image bounds ({x}, {y})")

        route_count += len(entry.routes)
        for route in entry.routes:
            if not route.hold_ids:
                warnings.append(f"{entry.id}/route-{route.id}: no hold ids")
            for hold_id in route.hold_ids:
                if hold_id not in hold_ids:
                    issues.append(f"{entry.id}/route-{route.id}: unknown hold id {hold_id}")

    if len(entries) < min_images:
        issues.append(f"dataset has {len(entries)} images, expected at least {min_images}")
    if hold_count < min_holds:
        issues.append(f"dataset has {hold_count} holds, expected at least {min_holds}")
    if route_count < min_routes:
        issues.append(f"dataset has {route_count} route groups, expected at least {min_routes}")
    if require_splits:
        for split in ["train", "val", "test"]:
            if split_counts[split] == 0:
                issues.append(f"split '{split}' has no images")

    return {
        "valid": len(issues) == 0,
        "manifest": str(manifest),
        "imageCount": len(entries),
        "holdCount": hold_count,
        "routeCount": route_count,
        "routeLabeledHoldCount": route_labeled_holds,
        "splitCounts": split_counts,
        "issues": issues,
        "warnings": warnings,
    }


def run() -> None:
    args = parse_args()
    result = validate_manifest(
        Path(args.manifest).resolve(),
        min_images=args.min_images,
        min_holds=args.min_holds,
        min_routes=args.min_routes,
        require_splits=args.require_splits,
    )
    if args.out:
        out = Path(args.out).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    if args.strict and not result["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    run()

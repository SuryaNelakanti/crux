from __future__ import annotations

import json
import sys
from pathlib import Path

from _common import build_parser, read_jsonl


PSEUDO_SOURCES = {
    "reviewed-sam",
    "reviewed-sam2",
    "reviewed-sam3",
    "sam2-bbox-refine",
    "sam2-proposal",
    "sam2_pseudo",
    "sam3-proposal",
    "sam3_pseudo",
}


def parse_args():
    parser = build_parser("Validate train-only boundaries for SAM-family augmented manifests.")
    parser.add_argument("--manifest", default=".data/vision/heidelberg-sam3-train/manifest.jsonl")
    parser.add_argument("--out", default=None)
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def is_pseudo_row(row: dict) -> bool:
    label_source = str(row.get("labelSource", ""))
    if label_source in PSEUDO_SOURCES or label_source.startswith("reviewed-") or label_source.endswith("-pseudo"):
        return True
    if str(row.get("id", "")).startswith(("sam_", "sam2_", "sam3_")):
        return True
    for hold in row.get("holds", []):
        if not isinstance(hold, dict):
            continue
        hold_source = str(hold.get("labelSource", ""))
        if hold_source in PSEUDO_SOURCES or hold_source.startswith("reviewed-") or hold_source.endswith("-pseudo"):
            return True
        if str(hold.get("routeId", "")) in {"sam_pseudo", "sam2_pseudo", "sam3_pseudo"}:
            return True
    return False


def validate(manifest: Path) -> dict:
    issues: list[str] = []
    warnings: list[str] = []
    rows = read_jsonl(manifest)
    pseudo_counts = {"train": 0, "val": 0, "test": 0, "all": 0, "other": 0}
    manual_counts = {"train": 0, "val": 0, "test": 0, "all": 0, "other": 0}

    for row in rows:
        split = str(row.get("split", "all"))
        bucket = split if split in pseudo_counts else "other"
        if is_pseudo_row(row):
            pseudo_counts[bucket] += 1
            if split != "train":
                issues.append(f"{row.get('id', '<missing-id>')}: pseudo label row is in split '{split}', expected train")
        else:
            manual_counts[bucket] += 1

    if pseudo_counts["train"] == 0:
        warnings.append("manifest contains no train pseudo-label rows")

    return {
        "valid": len(issues) == 0,
        "manifest": str(manifest),
        "imageCount": len(rows),
        "pseudoCounts": pseudo_counts,
        "manualCounts": manual_counts,
        "issues": issues,
        "warnings": warnings,
    }


def run() -> None:
    args = parse_args()
    result = validate(Path(args.manifest).resolve())
    if args.out:
        out = Path(args.out).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    if args.strict and not result["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    run()

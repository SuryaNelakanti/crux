from __future__ import annotations

import json
from pathlib import Path

from _common import ManifestEntry, build_parser, copy_image, load_manifest, polygon_to_yolo_line, safe_stem, stable_split, write_jsonl


def parse_args():
    parser = build_parser("Convert the Crux vision manifest into a YOLO segmentation dataset.")
    parser.add_argument("--manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--out", default=".data/vision/heidelberg-yolo")
    parser.add_argument("--train", type=float, default=0.8)
    parser.add_argument("--val", type=float, default=0.1)
    parser.add_argument("--preserve-splits", action="store_true", help="Use manifest split fields instead of re-splitting.")
    return parser.parse_args()


def write_data_yaml(out: Path) -> None:
    data_yaml = "\n".join(
        [
            f"path: {out.as_posix()}",
            "train: images/train",
            "val: images/val",
            "test: images/test",
            "names:",
            "  0: hold",
            "",
        ]
    )
    (out / "data.yaml").write_text(data_yaml, encoding="utf-8")


def split_entries(
    entries: list[ManifestEntry], train: float, val: float, preserve: bool
) -> dict[str, list[ManifestEntry]]:
    if not preserve:
        return stable_split(entries, train=train, val=val)

    split: dict[str, list[ManifestEntry]] = {"train": [], "val": [], "test": []}
    for entry in entries:
        if entry.split not in split:
            raise ValueError(f"{entry.id}: cannot preserve unknown split '{entry.split}'")
        split[entry.split].append(entry)
    return split


def run() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest).resolve()
    out = Path(args.out).resolve()
    entries = load_manifest(manifest_path)
    split = split_entries(entries, train=args.train, val=args.val, preserve=args.preserve_splits)
    output_rows: list[dict] = []

    out.mkdir(parents=True, exist_ok=True)
    for split_name, entries_for_split in split.items():
        (out / "images" / split_name).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split_name).mkdir(parents=True, exist_ok=True)

        for index, entry in enumerate(entries_for_split):
            if not entry.image_path.exists():
                raise FileNotFoundError(f"Image not found for {entry.id}: {entry.image_path}")
            image_name = f"{safe_stem(entry.id)}-{index}{entry.image_path.suffix.lower()}"
            image_out = out / "images" / split_name / image_name
            label_out = out / "labels" / split_name / f"{Path(image_name).stem}.txt"
            copy_image(entry.image_path, image_out)

            labels = [
                line
                for hold in entry.holds
                if (line := polygon_to_yolo_line(hold.polygon, entry.width, entry.height)) is not None
            ]
            label_out.write_text("\n".join(labels) + ("\n" if labels else ""), encoding="utf-8")
            output_rows.append(
                {
                    "id": entry.id,
                    "split": split_name,
                    "imagePath": str(image_out),
                    "originalImagePath": str(entry.image_path),
                    "width": entry.width,
                    "height": entry.height,
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
            )

    write_data_yaml(out)
    write_jsonl(out / "crux-manifest.jsonl", output_rows)
    summary = {
        "sourceManifest": str(manifest_path),
        "datasetYaml": str(out / "data.yaml"),
        "images": len(output_rows),
        "splits": {name: len(items) for name, items in split.items()},
        "classes": ["hold"],
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

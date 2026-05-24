from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from _common import ManifestEntry, build_parser, load_manifest, polygon_to_yolo_line, safe_stem, stable_split, write_jsonl


Point = dict[str, float]


def parse_args():
    parser = build_parser("Convert the Crux vision manifest into overlapping YOLO segmentation tiles.")
    parser.add_argument("--manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--out", default=".data/vision/heidelberg-yolo-tiles")
    parser.add_argument("--tile-size", type=int, default=1024)
    parser.add_argument("--overlap", type=int, default=256)
    parser.add_argument("--train", type=float, default=0.8)
    parser.add_argument("--val", type=float, default=0.1)
    parser.add_argument("--include-empty", action="store_true")
    parser.add_argument("--min-area", type=float, default=12.0)
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


def tile_offsets(length: int, tile_size: int, overlap: int) -> list[int]:
    if length <= tile_size:
        return [0]
    stride = tile_size - overlap
    if stride <= 0:
        raise ValueError("--overlap must be smaller than --tile-size")
    offsets = list(range(0, max(1, length - tile_size + 1), stride))
    last = length - tile_size
    if offsets[-1] != last:
        offsets.append(last)
    return offsets


def clip_polygon_to_rect(polygon: list[Point], x0: float, y0: float, x1: float, y1: float) -> list[Point]:
    def clip(
        points: list[Point],
        inside,
        intersect,
    ) -> list[Point]:
        if not points:
            return []
        output: list[Point] = []
        previous = points[-1]
        previous_inside = inside(previous)
        for current in points:
            current_inside = inside(current)
            if current_inside:
                if not previous_inside:
                    output.append(intersect(previous, current))
                output.append(current)
            elif previous_inside:
                output.append(intersect(previous, current))
            previous = current
            previous_inside = current_inside
        return output

    def lerp(a: Point, b: Point, t: float) -> Point:
        return {"x": a["x"] + (b["x"] - a["x"]) * t, "y": a["y"] + (b["y"] - a["y"]) * t}

    clipped = list(polygon)
    clipped = clip(
        clipped,
        lambda p: p["x"] >= x0,
        lambda a, b: lerp(a, b, (x0 - a["x"]) / (b["x"] - a["x"] or 1e-9)),
    )
    clipped = clip(
        clipped,
        lambda p: p["x"] <= x1,
        lambda a, b: lerp(a, b, (x1 - a["x"]) / (b["x"] - a["x"] or 1e-9)),
    )
    clipped = clip(
        clipped,
        lambda p: p["y"] >= y0,
        lambda a, b: lerp(a, b, (y0 - a["y"]) / (b["y"] - a["y"] or 1e-9)),
    )
    clipped = clip(
        clipped,
        lambda p: p["y"] <= y1,
        lambda a, b: lerp(a, b, (y1 - a["y"]) / (b["y"] - a["y"] or 1e-9)),
    )
    return [
        {"x": min(x1, max(x0, point["x"])) - x0, "y": min(y1, max(y0, point["y"])) - y0}
        for point in clipped
    ]


def polygon_area(polygon: list[Point]) -> float:
    if len(polygon) < 3:
        return 0.0
    area = 0.0
    for index, point in enumerate(polygon):
        previous = polygon[index - 1]
        area += previous["x"] * point["y"] - point["x"] * previous["y"]
    return abs(area) / 2


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

        for entry in entries_for_split:
            if not entry.image_path.exists():
                raise FileNotFoundError(f"Image not found for {entry.id}: {entry.image_path}")
            image = Image.open(entry.image_path).convert("RGB")
            x_offsets = tile_offsets(image.width, args.tile_size, args.overlap)
            y_offsets = tile_offsets(image.height, args.tile_size, args.overlap)
            for tile_y in y_offsets:
                for tile_x in x_offsets:
                    tile_w = min(args.tile_size, image.width - tile_x)
                    tile_h = min(args.tile_size, image.height - tile_y)
                    labels: list[str] = []
                    tile_holds = []
                    for hold in entry.holds:
                        clipped = clip_polygon_to_rect(
                            hold.polygon,
                            float(tile_x),
                            float(tile_y),
                            float(tile_x + tile_w - 1),
                            float(tile_y + tile_h - 1),
                        )
                        if polygon_area(clipped) < args.min_area:
                            continue
                        line = polygon_to_yolo_line(clipped, tile_w, tile_h)
                        if line is None:
                            continue
                        labels.append(line)
                        tile_holds.append(
                            {
                                "id": hold.id,
                                "polygon": clipped,
                                "routeId": hold.route_id,
                                "routeLabel": hold.route_label,
                            }
                        )
                    if not labels and not args.include_empty:
                        continue

                    tile_id = f"{entry.id}_x{tile_x}_y{tile_y}"
                    image_name = f"{safe_stem(tile_id)}.jpg"
                    image_out = out / "images" / split_name / image_name
                    label_out = out / "labels" / split_name / f"{Path(image_name).stem}.txt"
                    image.crop((tile_x, tile_y, tile_x + tile_w, tile_y + tile_h)).save(image_out, quality=95)
                    label_out.write_text("\n".join(labels) + ("\n" if labels else ""), encoding="utf-8")
                    tile_hold_ids = {hold["id"] for hold in tile_holds}
                    tile_routes = [
                        {
                            "id": route.id,
                            "label": route.label,
                            "holdIds": [hold_id for hold_id in route.hold_ids if hold_id in tile_hold_ids],
                        }
                        for route in entry.routes
                    ]
                    tile_routes = [route for route in tile_routes if route["holdIds"]]
                    output_rows.append(
                        {
                            "id": tile_id,
                            "split": split_name,
                            "imagePath": str(image_out),
                            "originalImagePath": str(entry.image_path),
                            "sourceId": entry.id,
                            "tile": {"x": tile_x, "y": tile_y, "width": tile_w, "height": tile_h},
                            "width": tile_w,
                            "height": tile_h,
                            "holds": tile_holds,
                            "routes": [
                                route
                                for route in tile_routes
                            ],
                        }
                    )

    write_data_yaml(out)
    write_jsonl(out / "crux-manifest.jsonl", output_rows)
    split_counts = {name: sum(1 for row in output_rows if row["split"] == name) for name in split}
    summary = {
        "sourceManifest": str(manifest_path),
        "datasetYaml": str(out / "data.yaml"),
        "images": len(output_rows),
        "sourceImages": len(entries),
        "tileSize": args.tile_size,
        "overlap": args.overlap,
        "splits": split_counts,
        "classes": ["hold"],
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

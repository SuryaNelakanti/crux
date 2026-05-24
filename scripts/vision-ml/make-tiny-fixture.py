from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

from _common import build_parser


def parse_args():
    parser = build_parser("Create a tiny synthetic climbing-wall manifest for ML pipeline smoke tests.")
    parser.add_argument("--out", default="scripts/output/vision-ml/tiny-fixture")
    return parser.parse_args()


def create_image(path: Path, color: tuple[int, int, int], hold_color: tuple[int, int, int]) -> dict:
    image = Image.new("RGB", (96, 96), color)
    draw = ImageDraw.Draw(image)
    polygons = [
        [{"x": 18, "y": 18}, {"x": 34, "y": 18}, {"x": 34, "y": 34}, {"x": 18, "y": 34}],
        [{"x": 58, "y": 18}, {"x": 74, "y": 18}, {"x": 74, "y": 34}, {"x": 58, "y": 34}],
        [{"x": 38, "y": 58}, {"x": 54, "y": 58}, {"x": 54, "y": 74}, {"x": 38, "y": 74}],
    ]
    for polygon in polygons:
        draw.polygon([(point["x"], point["y"]) for point in polygon], fill=hold_color)
    image.save(path)
    return {
        "id": path.stem,
        "imagePath": str(path.resolve()),
        "width": image.width,
        "height": image.height,
        "allHoldMaskPath": "",
        "holds": [
            {
                "id": index,
                "polygon": polygon,
                "routeId": f"{path.stem}-route",
                "routeLabel": "synthetic",
                "color": {"h": 0, "s": 80, "l": 50},
                "area": 256,
            }
            for index, polygon in enumerate(polygons)
        ],
        "routes": [
            {
                "id": f"{path.stem}-route",
                "label": "synthetic",
                "holdIds": [0, 1, 2],
                "color": {"h": 0, "s": 80, "l": 50},
                "maskPath": "",
            }
        ],
    }


def run() -> None:
    args = parse_args()
    out = Path(args.out).resolve()
    images = out / "images"
    images.mkdir(parents=True, exist_ok=True)
    entries = [
        create_image(images / "wall-a.png", (96, 104, 100), (220, 36, 54)),
        create_image(images / "wall-b.png", (108, 104, 98), (36, 96, 220)),
        create_image(images / "wall-c.png", (98, 106, 112), (240, 198, 44)),
    ]
    manifest = out / "manifest.jsonl"
    manifest.write_text("\n".join(json.dumps(entry, sort_keys=True) for entry in entries) + "\n", encoding="utf-8")
    summary = {"manifest": str(manifest), "images": len(entries)}
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

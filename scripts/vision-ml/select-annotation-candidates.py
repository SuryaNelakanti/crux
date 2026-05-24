from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from _common import build_parser, load_manifest


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def parse_args():
    parser = build_parser("Rank unlabeled Heidelberg photos for the next manual annotation batch.")
    parser.add_argument("--raw-source", default=".data/raw/heidelberg")
    parser.add_argument("--manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--out", default="scripts/output/vision-ml/annotation-candidates")
    parser.add_argument("--limit", type=int, default=60)
    parser.add_argument("--thumb-size", type=int, default=160)
    return parser.parse_args()


def raw_image_id(path: Path, raw_source: Path) -> str:
    relative = path.relative_to(raw_source)
    return f"{relative.parent.as_posix().replace('/', '_')}_{path.stem}"


def image_stats(path: Path) -> dict:
    image = Image.open(path).convert("RGB")
    thumb = image.resize((96, 96))
    array = np.asarray(thumb).astype(np.float32) / 255.0
    maxc = array.max(axis=2)
    minc = array.min(axis=2)
    saturation = np.where(maxc == 0, 0, (maxc - minc) / maxc)
    brightness = array.mean(axis=2)
    hist, _ = np.histogramdd(
        array.reshape(-1, 3),
        bins=(4, 4, 4),
        range=((0, 1), (0, 1), (0, 1)),
    )
    vector = hist.flatten().astype(np.float32)
    vector = vector / max(1.0, float(vector.sum()))
    entropy = -float(np.sum(vector[vector > 0] * np.log2(vector[vector > 0])))
    gray = brightness
    edge = float(np.mean(np.abs(np.diff(gray, axis=0))) + np.mean(np.abs(np.diff(gray, axis=1))))
    score = entropy * 0.45 + float(saturation.mean()) * 2.5 + edge * 6.0
    return {
        "width": image.width,
        "height": image.height,
        "entropy": entropy,
        "meanSaturation": float(saturation.mean()),
        "meanBrightness": float(brightness.mean()),
        "edgeEnergy": edge,
        "score": score,
        "histogram": vector.tolist(),
    }


def l2(a: list[float], b: list[float]) -> float:
    av = np.asarray(a, dtype=np.float32)
    bv = np.asarray(b, dtype=np.float32)
    return float(np.linalg.norm(av - bv))


def select_diverse(rows: list[dict], limit: int) -> list[dict]:
    by_group: dict[str, list[dict]] = {}
    for row in rows:
        by_group.setdefault(row["group"], []).append(row)
    for group_rows in by_group.values():
        group_rows.sort(key=lambda row: row["score"], reverse=True)

    selected: list[dict] = []
    groups = sorted(by_group)
    while len(selected) < limit and any(by_group.values()):
        for group in groups:
            if not by_group[group] or len(selected) >= limit:
                continue
            if not selected:
                selected.append(by_group[group].pop(0))
                continue
            best_index = max(
                range(len(by_group[group])),
                key=lambda index: by_group[group][index]["score"]
                + min(l2(by_group[group][index]["histogram"], chosen["histogram"]) for chosen in selected) * 4.0,
            )
            selected.append(by_group[group].pop(best_index))
    return selected


def write_contact_sheet(rows: list[dict], out: Path, thumb_size: int) -> None:
    if not rows:
        return
    columns = 5
    label_height = 42
    cell_w = thumb_size
    cell_h = thumb_size + label_height
    sheet = Image.new("RGB", (columns * cell_w, math.ceil(len(rows) / columns) * cell_h), (245, 245, 245))
    draw = ImageDraw.Draw(sheet)
    for index, row in enumerate(rows):
        x = (index % columns) * cell_w
        y = (index // columns) * cell_h
        image = Image.open(row["path"]).convert("RGB")
        image.thumbnail((thumb_size, thumb_size))
        sheet.paste(image, (x + (thumb_size - image.width) // 2, y))
        draw.text((x + 4, y + thumb_size + 4), f"{index + 1}. {row['id']}", fill=(20, 20, 20))
        draw.text((x + 4, y + thumb_size + 20), f"score {row['score']:.2f}", fill=(80, 80, 80))
    sheet.save(out)


def run() -> None:
    args = parse_args()
    raw_source = Path(args.raw_source).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    annotated_ids = {entry.id for entry in load_manifest(Path(args.manifest).resolve())}

    rows: list[dict] = []
    for path in sorted(raw_source.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        image_id = raw_image_id(path, raw_source)
        if image_id in annotated_ids:
            continue
        stats = image_stats(path)
        rows.append(
            {
                "id": image_id,
                "group": path.relative_to(raw_source).parts[0],
                "path": str(path),
                **stats,
            }
        )

    selected = select_diverse(rows, args.limit)
    serializable = [{key: value for key, value in row.items() if key != "histogram"} for row in selected]
    (out / "candidates.json").write_text(json.dumps(serializable, indent=2, sort_keys=True), encoding="utf-8")
    with (out / "candidates.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(serializable[0].keys()) if serializable else ["id"])
        writer.writeheader()
        writer.writerows(serializable)
    write_contact_sheet(selected, out / "contact-sheet.jpg", args.thumb_size)

    print(
        json.dumps(
            {
                "rawImageCount": len(rows) + len(annotated_ids),
                "annotatedImageCount": len(annotated_ids),
                "unlabeledImageCount": len(rows),
                "selectedCount": len(selected),
                "out": str(out),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    run()

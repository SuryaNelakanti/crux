from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
from PIL import Image, ImageDraw

from _common import build_parser, load_manifest, median_color_hsl, safe_stem


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def parse_args():
    parser = build_parser("Generate reviewable SAM3 pseudo-label proposals for Heidelberg hold segmentation.")
    parser.add_argument("--raw-source", default=".data/raw/heidelberg")
    parser.add_argument("--manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--out", default="scripts/output/vision-ml/sam3-proposals")
    parser.add_argument("--model", default=".models/vision/teachers/sam3.pt")
    parser.add_argument("--text", default="climbing hold")
    parser.add_argument("--device", default=None)
    parser.add_argument("--limit", type=int, default=80)
    parser.add_argument("--include-annotated", action="store_true")
    parser.add_argument("--min-area-ratio", type=float, default=0.00015)
    parser.add_argument("--max-area-ratio", type=float, default=0.08)
    parser.add_argument("--min-saturation", type=float, default=18.0)
    parser.add_argument("--max-proposals-per-image", type=int, default=160)
    parser.add_argument("--preview", action="store_true")
    return parser.parse_args()


def raw_image_id(path: Path, raw_source: Path) -> str:
    relative = path.relative_to(raw_source)
    return f"{relative.parent.as_posix().replace('/', '_')}_{path.stem}"


def iter_raw_images(raw_source: Path) -> Iterable[Path]:
    for path in sorted(raw_source.rglob("*")):
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            yield path


def annotated_ids(manifest_path: Path) -> set[str]:
    if not manifest_path.exists():
        return set()
    return {entry.id for entry in load_manifest(manifest_path)}


def mask_area(mask: Image.Image) -> int:
    return int(np.count_nonzero(np.asarray(mask.convert("L")) > 0))


def mask_bbox(mask: Image.Image) -> tuple[int, int, int, int] | None:
    return mask.convert("L").getbbox()


def bbox_polygon(box: tuple[int, int, int, int]) -> list[dict[str, float]]:
    left, top, right, bottom = box
    return [
        {"x": float(left), "y": float(top)},
        {"x": float(right), "y": float(top)},
        {"x": float(right), "y": float(bottom)},
        {"x": float(left), "y": float(bottom)},
    ]


def contour_polygon(mask: Image.Image, max_points: int = 64) -> list[dict[str, float]] | None:
    array = (np.asarray(mask.convert("L")) > 0).astype(np.uint8) * 255
    try:
        import cv2  # type: ignore
    except ImportError:
        box = mask_bbox(mask)
        return bbox_polygon(box) if box else None

    contours, _ = cv2.findContours(array, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) <= 0:
        return None

    epsilon = max(1.0, 0.006 * cv2.arcLength(contour, True))
    approx = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
    if len(approx) > max_points:
        step = max(1, len(approx) // max_points)
        approx = approx[::step][:max_points]
    if len(approx) < 3:
        box = mask_bbox(mask)
        return bbox_polygon(box) if box else None
    return [{"x": float(x), "y": float(y)} for x, y in approx]


def mask_to_pil(mask_array: np.ndarray, size: tuple[int, int]) -> Image.Image:
    mask = Image.fromarray((mask_array > 0.5).astype(np.uint8) * 255).convert("L")
    if mask.size != size:
        mask = mask.resize(size, Image.Resampling.NEAREST)
    return mask


def load_sam3_predictor(model_path: Path):
    if not model_path.exists():
        raise SystemExit(
            f"SAM3 checkpoint not found: {model_path}. "
            "Download it locally first; this script does not fetch model weights."
        )
    try:
        from ultralytics.models.sam import SAM3SemanticPredictor
    except ImportError as error:
        raise SystemExit(
            "Ultralytics SAM3SemanticPredictor is unavailable. "
            "Upgrade/install ML deps in .venv-vision-ml, then rerun."
        ) from error
    return SAM3SemanticPredictor(overrides={"model": str(model_path)})


def extract_result_masks(result) -> tuple[list[np.ndarray], list[float]]:
    if result is None or getattr(result, "masks", None) is None:
        return [], []
    masks = result.masks.data.detach().cpu().numpy()
    if getattr(result, "boxes", None) is not None and result.boxes.conf is not None:
        confidences = [float(value) for value in result.boxes.conf.detach().cpu().numpy().tolist()]
    else:
        confidences = [1.0] * len(masks)
    return list(masks), confidences


def propose_for_image(predictor, image_path: Path, args) -> dict:
    image = Image.open(image_path).convert("RGB")
    predictor.set_image(str(image_path))
    results = predictor(text=args.text, device=args.device)
    result = results[0] if isinstance(results, list) and results else results
    masks, confidences = extract_result_masks(result)

    proposals = []
    image_area = max(1, image.width * image.height)
    for index, mask_array in enumerate(masks):
        mask = mask_to_pil(mask_array, image.size)
        area = mask_area(mask)
        ratio = area / image_area
        if ratio < args.min_area_ratio or ratio > args.max_area_ratio:
            continue
        color = median_color_hsl(image, mask)
        if color.s < args.min_saturation:
            continue
        polygon = contour_polygon(mask)
        box = mask_bbox(mask)
        if polygon is None or box is None:
            continue
        confidence = confidences[index] if index < len(confidences) else 1.0
        score = float(confidence) * max(0.1, color.s / 100) * (ratio ** 0.25)
        proposals.append(
            {
                "area": area,
                "areaRatio": ratio,
                "bbox": {"x": box[0], "y": box[1], "width": box[2] - box[0], "height": box[3] - box[1]},
                "color": {"h": color.h, "s": color.s, "l": color.l},
                "confidence": float(confidence),
                "polygon": polygon,
                "score": score,
            }
        )

    proposals.sort(key=lambda item: item["score"], reverse=True)
    return {
        "width": image.width,
        "height": image.height,
        "prompt": args.text,
        "proposalCount": min(len(proposals), args.max_proposals_per_image),
        "proposals": proposals[: args.max_proposals_per_image],
    }


def write_preview(image_path: Path, proposals: Sequence[dict], out_path: Path) -> None:
    image = Image.open(image_path).convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for proposal in proposals:
        points = [(point["x"], point["y"]) for point in proposal["polygon"]]
        if len(points) >= 3:
            draw.polygon(points, fill=(0, 210, 255, 50), outline=(0, 210, 255, 220))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.alpha_composite(image, overlay).convert("RGB").save(out_path, quality=90)


def via_payload(rows: Sequence[dict]) -> dict:
    metadata = {}
    for row in rows:
        regions = []
        for proposal in row["proposals"]:
            polygon = proposal["polygon"]
            regions.append(
                {
                    "shape_attributes": {
                        "name": "polygon",
                        "all_points_x": [round(point["x"]) for point in polygon],
                        "all_points_y": [round(point["y"]) for point in polygon],
                    },
                    "region_attributes": {
                        "source": "sam3-proposal",
                        "prompt": row["prompt"],
                        "confidence": f"{proposal['confidence']:.4f}",
                    },
                }
            )
        metadata[f"{row['relativePath']}{len(regions)}"] = {
            "filename": row["relativePath"],
            "size": -1,
            "regions": regions,
            "file_attributes": {"source": "sam3-proposal"},
        }
    return {"_via_img_metadata": metadata}


def run() -> None:
    args = parse_args()
    raw_source = Path(args.raw_source).resolve()
    manifest = Path(args.manifest).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    trusted_ids = annotated_ids(manifest)
    image_paths = []
    for path in iter_raw_images(raw_source):
        image_id = raw_image_id(path, raw_source)
        if args.include_annotated or image_id not in trusted_ids:
            image_paths.append(path)
        if args.limit > 0 and len(image_paths) >= args.limit:
            break

    predictor = load_sam3_predictor(Path(args.model).resolve())
    rows = []
    candidates = []
    for rank, image_path in enumerate(image_paths, start=1):
        relative = image_path.relative_to(raw_source).as_posix()
        image_id = raw_image_id(image_path, raw_source)
        proposed = propose_for_image(predictor, image_path, args)
        row = {
            "id": image_id,
            "relativePath": relative,
            "imagePath": str(image_path),
            **proposed,
        }
        rows.append(row)
        score = sum(item["score"] for item in row["proposals"][:20])
        candidates.append(
            {
                "id": image_id,
                "rank": rank,
                "group": relative.split("/", 1)[0],
                "imagePath": str(image_path),
                "relativePath": relative,
                "proposalCount": row["proposalCount"],
                "score": score,
                "source": "sam3-proposal",
            }
        )
        if args.preview and row["proposals"]:
            write_preview(image_path, row["proposals"], out / "previews" / f"{safe_stem(image_id)}.jpg")

    candidates.sort(key=lambda item: (item["proposalCount"] == 0, -item["score"], item["id"]))
    for index, candidate in enumerate(candidates, start=1):
        candidate["rank"] = index

    (out / "proposals.json").write_text(json.dumps(rows, indent=2, sort_keys=True), encoding="utf-8")
    (out / "candidates.json").write_text(json.dumps(candidates, indent=2, sort_keys=True), encoding="utf-8")
    (out / "sam3-proposals.via.json").write_text(json.dumps(via_payload(rows), indent=2, sort_keys=True), encoding="utf-8")
    summary = {
        "candidateCount": len(candidates),
        "imageCount": len(rows),
        "model": str(Path(args.model).resolve()),
        "prompt": args.text,
        "proposalCount": sum(row["proposalCount"] for row in rows),
        "trustedAnnotatedImagesSkipped": 0 if args.include_annotated else len(trusted_ids),
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

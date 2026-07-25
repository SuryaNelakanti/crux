from __future__ import annotations

import json
from pathlib import Path
from typing import Sequence

import numpy as np
from PIL import Image, ImageDraw

from _common import build_parser, load_manifest, mask_area, median_color_hsl, rasterize_polygons, safe_stem


def parse_args():
    parser = build_parser("Generate SAM2-refined hold labels from existing Heidelberg annotations.")
    parser.add_argument("--manifest", default=".data/vision/heidelberg-yolo/crux-manifest.jsonl")
    parser.add_argument("--out", default="scripts/output/vision-ml/sam2-proposals")
    parser.add_argument("--model", default=".models/vision/teachers/sam2.1_t.pt")
    parser.add_argument("--device", default=None)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--splits", default="train", help="Comma-separated manifest splits to annotate, or 'all'.")
    parser.add_argument("--bbox-pad", type=float, default=0.12, help="Padding fraction around each manual hold bbox.")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--max-holds-per-image", type=int, default=0)
    parser.add_argument("--min-area-ratio", type=float, default=0.00001)
    parser.add_argument("--max-area-ratio", type=float, default=0.04)
    parser.add_argument("--min-manual-iou", type=float, default=0.0)
    parser.add_argument("--max-manual-area-ratio", type=float, default=0.0)
    parser.add_argument("--preview", action="store_true")
    return parser.parse_args()


def clean_splits(value: str) -> set[str] | None:
    splits = {part.strip() for part in value.split(",") if part.strip()}
    return None if not splits or "all" in splits else splits


def hold_bbox(hold, width: int, height: int, pad_fraction: float) -> list[float]:
    xs = [float(point["x"]) for point in hold.polygon]
    ys = [float(point["y"]) for point in hold.polygon]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    pad_x = max(2.0, (max_x - min_x) * pad_fraction)
    pad_y = max(2.0, (max_y - min_y) * pad_fraction)
    return [
        max(0.0, min_x - pad_x),
        max(0.0, min_y - pad_y),
        min(float(width - 1), max_x + pad_x),
        min(float(height - 1), max_y + pad_y),
    ]


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


def extract_result_masks(result) -> tuple[list[np.ndarray], list[float]]:
    if result is None or getattr(result, "masks", None) is None:
        return [], []
    masks = result.masks.data.detach().cpu().numpy()
    if getattr(result, "boxes", None) is not None and result.boxes.conf is not None:
        confidences = [float(value) for value in result.boxes.conf.detach().cpu().numpy().tolist()]
    else:
        confidences = [1.0] * len(masks)
    return list(masks), confidences


def binary_iou(a: Image.Image, b: Image.Image) -> float:
    b_l = b.convert("L")
    if b_l.size != a.size:
        b_l = b_l.resize(a.size, Image.Resampling.NEAREST)
    a_l = a.convert("L")
    a_box = a_l.getbbox()
    b_box = b_l.getbbox()
    if a_box is None and b_box is None:
        return 0.0
    if a_box is None:
        a_box = b_box
    if b_box is None:
        b_box = a_box
    assert a_box is not None and b_box is not None
    box = (
        min(a_box[0], b_box[0]),
        min(a_box[1], b_box[1]),
        max(a_box[2], b_box[2]),
        max(a_box[3], b_box[3]),
    )
    a_array = np.asarray(a_l.crop(box)) > 0
    b_array = np.asarray(b_l.crop(box)) > 0
    intersection = int(np.count_nonzero(a_array & b_array))
    union = int(np.count_nonzero(a_array | b_array))
    return 0.0 if union == 0 else intersection / union


def predict_masks(model, image_path: Path, boxes: Sequence[list[float]], args) -> tuple[list[np.ndarray], list[float]]:
    masks: list[np.ndarray] = []
    confidences: list[float] = []
    for start in range(0, len(boxes), args.batch_size):
        chunk = boxes[start : start + args.batch_size]
        results = model.predict(source=str(image_path), bboxes=chunk, device=args.device, verbose=False)
        result = results[0] if isinstance(results, list) and results else results
        chunk_masks, chunk_confidences = extract_result_masks(result)
        masks.extend(chunk_masks)
        confidences.extend(chunk_confidences)
    return masks, confidences


def proposals_for_entry(model, entry, args) -> dict:
    image = Image.open(entry.image_path).convert("RGB")
    holds = entry.holds[: args.max_holds_per_image or None]
    boxes = [hold_bbox(hold, image.width, image.height, args.bbox_pad) for hold in holds]
    masks, confidences = predict_masks(model, entry.image_path, boxes, args) if boxes else ([], [])
    image_area = max(1, image.width * image.height)

    proposals = []
    for index, hold in enumerate(holds):
        if index >= len(masks):
            continue
        mask = mask_to_pil(masks[index], image.size)
        area = mask_area(mask)
        area_ratio = area / image_area
        if area_ratio < args.min_area_ratio or area_ratio > args.max_area_ratio:
            continue
        box = mask_bbox(mask)
        polygon = contour_polygon(mask)
        if box is None or polygon is None:
            continue
        manual_mask = rasterize_polygons(image.width, image.height, [hold.polygon])
        manual_area = mask_area(manual_mask)
        manual_iou = binary_iou(mask, manual_mask)
        manual_area_ratio = area / max(1, manual_area)
        if args.min_manual_iou > 0 and manual_iou < args.min_manual_iou:
            continue
        if args.max_manual_area_ratio > 0 and manual_area_ratio > args.max_manual_area_ratio:
            continue
        color = median_color_hsl(image, mask, box)
        confidence = confidences[index] if index < len(confidences) else 1.0
        proposals.append(
            {
                "area": area,
                "areaRatio": area_ratio,
                "bbox": {"x": box[0], "y": box[1], "width": box[2] - box[0], "height": box[3] - box[1]},
                "color": {"h": color.h, "s": color.s, "l": color.l},
                "confidence": float(confidence),
                "edgeConfidence": float(confidence),
                "manualHoldId": hold.id,
                "manualAreaRatio": manual_area_ratio,
                "manualIou": manual_iou,
                "manualPromptBbox": boxes[index],
                "polygon": polygon,
                "routeId": hold.route_id,
                "routeLabel": hold.route_label,
                "score": float(confidence),
                "source": "sam2-bbox-refine",
            }
        )

    return {
        "height": image.height,
        "imagePath": str(entry.image_path),
        "id": entry.id,
        "proposalCount": len(proposals),
        "proposals": proposals,
        "split": entry.split,
        "width": image.width,
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
                        "confidence": f"{proposal['confidence']:.4f}",
                        "manualHoldId": str(proposal["manualHoldId"]),
                        "routeId": proposal["routeId"],
                        "source": "sam2-bbox-refine",
                    },
                }
            )
        metadata[f"{Path(row['imagePath']).name}{len(regions)}"] = {
            "filename": Path(row["imagePath"]).name,
            "imagePath": row["imagePath"],
            "regions": regions,
            "size": -1,
            "file_attributes": {"source": "sam2-bbox-refine", "split": row["split"]},
        }
    return {"_via_img_metadata": metadata}


def run() -> None:
    args = parse_args()
    model_path = Path(args.model).resolve()
    if not model_path.exists():
        raise FileNotFoundError(f"SAM2 checkpoint not found: {model_path}")

    try:
        from ultralytics import SAM
    except ImportError as error:
        raise SystemExit("Missing Ultralytics. Install ML deps in .venv-vision-ml first.") from error

    split_filter = clean_splits(args.splits)
    entries = [
        entry
        for entry in load_manifest(Path(args.manifest).resolve())
        if split_filter is None or entry.split in split_filter
    ]
    if args.limit > 0:
        entries = entries[: args.limit]

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    model = SAM(str(model_path))

    rows = []
    for entry in entries:
        row = proposals_for_entry(model, entry, args)
        rows.append(row)
        if args.preview and row["proposals"]:
            write_preview(entry.image_path, row["proposals"], out / "previews" / f"{safe_stem(entry.id)}.jpg")
        print(json.dumps({"id": entry.id, "proposals": row["proposalCount"], "split": entry.split}))

    candidates = [
        {
            "id": row["id"],
            "imagePath": row["imagePath"],
            "proposalCount": row["proposalCount"],
            "rank": index + 1,
            "score": sum(float(item.get("score", 0.0)) for item in row["proposals"]),
            "source": "sam2-bbox-refine",
            "split": row["split"],
        }
        for index, row in enumerate(rows)
    ]
    summary = {
        "imageCount": len(rows),
        "manifest": str(Path(args.manifest).resolve()),
        "model": str(model_path),
        "proposalCount": sum(row["proposalCount"] for row in rows),
        "source": "sam2-bbox-refine",
        "splits": args.splits,
    }
    (out / "proposals.json").write_text(json.dumps(rows, indent=2, sort_keys=True), encoding="utf-8")
    (out / "candidates.json").write_text(json.dumps(candidates, indent=2, sort_keys=True), encoding="utf-8")
    (out / "sam2-proposals.via.json").write_text(json.dumps(via_payload(rows), indent=2, sort_keys=True), encoding="utf-8")
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

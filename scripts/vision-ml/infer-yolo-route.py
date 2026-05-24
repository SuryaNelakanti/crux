from __future__ import annotations

import json
import time
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import numpy as np
from PIL import Image

from _common import (
    build_all_hold_mask,
    build_parser,
    group_instances_by_color,
    make_predicted_instances,
    select_route_group,
)


def parse_args():
    parser = build_parser("Run local YOLO route mask inference on one climbing photo.")
    parser.add_argument("--model", default=None)
    parser.add_argument("--model-card", default=None)
    parser.add_argument("--image", required=True)
    parser.add_argument("--out", default="scripts/output/vision-ml/infer")
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.6)
    parser.add_argument("--device", default=None)
    parser.add_argument("--tiled", action="store_true")
    parser.add_argument("--tile-size", type=int, default=1536)
    parser.add_argument("--overlap", type=int, default=256)
    parser.add_argument("--batch", type=int, default=1, help="Tile inference batch size for --tiled mode.")
    parser.add_argument("--half", action="store_true", help="Use FP16 inference on supported CUDA devices.")
    parser.add_argument("--max-det", type=int, default=300, help="Maximum detections per image or tile.")
    parser.add_argument("--serial-tiles", action="store_true", help="Run each tile as a separate prediction call.")
    parser.add_argument("--seed-x", type=int, default=None)
    parser.add_argument("--seed-y", type=int, default=None)
    parser.add_argument("--top-groups", type=int, default=5, help="Write masks and overlays for the top route groups.")
    parser.add_argument("--source-max-width", type=int, default=None, help="Resize the source photo for local debug inference.")
    return parser.parse_args()


def model_from_card(model_card_path: Path) -> tuple[Path, dict]:
    import importlib.util

    validator_path = Path(__file__).with_name("validate-model-card.py")
    spec = importlib.util.spec_from_file_location("validate_model_card", validator_path)
    if not spec or not spec.loader:
        raise RuntimeError("Unable to load model-card validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    result = module.validate(model_card_path)
    if not result["valid"]:
        raise ValueError(f"Invalid model card: {result['issues']}")

    card = json.loads(model_card_path.read_text(encoding="utf-8"))
    model_path = (model_card_path.parent / card["files"]["model"]["path"]).resolve()
    return model_path, card


def resolve_model(args) -> tuple[Path, Path | None, dict | None]:
    if args.model_card:
        card_path = Path(args.model_card).resolve()
        model_path, card = model_from_card(card_path)
        if args.model and Path(args.model).resolve() != model_path:
            raise ValueError("--model does not match files.model.path in --model-card")
        return model_path, card_path, card
    if args.model:
        return Path(args.model).resolve(), None, None
    raise ValueError("Provide --model or --model-card")


def prepare_source_image(image_path: Path, out: Path, max_width: int | None) -> Path:
    if max_width is None or max_width <= 0:
        return image_path
    image = Image.open(image_path).convert("RGB")
    if image.width <= max_width:
        return image_path
    scale = max_width / image.width
    resized = image.resize((max_width, max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    resized_path = out / "source-resized.jpg"
    resized.save(resized_path, quality=95)
    return resized_path


def load_tile_offsets():
    module_path = Path(__file__).with_name("prepare-yolo-tiles.py")
    spec = spec_from_file_location("prepare_yolo_tiles", module_path)
    if spec is None or spec.loader is None:
        raise ImportError("Unable to load tiled inference helpers")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.tile_offsets


def predict_masks(
    model,
    image_path: Path,
    imgsz: int,
    conf: float,
    iou: float,
    device: str | None,
    half: bool,
    max_det: int,
):
    start = time.perf_counter()
    results = model.predict(
        source=str(image_path),
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        device=device,
        half=half,
        max_det=max_det,
        retina_masks=True,
        verbose=False,
    )
    runtime_ms = (time.perf_counter() - start) * 1000
    result = results[0]
    image = Image.open(image_path).convert("RGB")
    if result.masks is None:
        return image, [], [], runtime_ms

    mask_arrays = result.masks.data.detach().cpu().numpy()
    confidences = (
        result.boxes.conf.detach().cpu().numpy().tolist()
        if result.boxes is not None and result.boxes.conf is not None
        else [1.0] * len(mask_arrays)
    )
    masks = []
    for mask_array in mask_arrays:
        binary_mask = (mask_array > 0.5).astype(np.uint8)
        binary_mask *= 255
        mask = Image.fromarray(binary_mask)
        if mask.size != image.size:
            mask = mask.resize(image.size, Image.Resampling.NEAREST)
        masks.append(mask.convert("L"))
    return image, masks, confidences, runtime_ms


def predict_tiled_masks(
    model,
    image_path: Path,
    imgsz: int,
    conf: float,
    iou: float,
    device: str | None,
    tile_size: int,
    overlap: int,
    batch: int,
    half: bool,
    max_det: int,
    serial_tiles: bool,
):
    tile_offsets = load_tile_offsets()
    source = Image.open(image_path).convert("RGB")
    x_offsets = tile_offsets(source.width, tile_size, overlap)
    y_offsets = tile_offsets(source.height, tile_size, overlap)
    tiles: list[tuple[int, int, Image.Image]] = []
    for tile_y in y_offsets:
        for tile_x in x_offsets:
            tile_w = min(tile_size, source.width - tile_x)
            tile_h = min(tile_size, source.height - tile_y)
            tile = source.crop((tile_x, tile_y, tile_x + tile_w, tile_y + tile_h))
            tiles.append((tile_x, tile_y, tile))

    start = time.perf_counter()
    if serial_tiles:
        results = []
        for _, _, tile in tiles:
            results.extend(
                model.predict(
                    source=tile,
                    imgsz=imgsz,
                    conf=conf,
                    iou=iou,
                    device=device,
                    batch=1,
                    half=half,
                    max_det=max_det,
                    verbose=False,
                )
            )
    else:
        results = model.predict(
            source=[tile for _, _, tile in tiles],
            imgsz=imgsz,
            conf=conf,
            iou=iou,
            device=device,
            batch=batch,
            half=half,
            max_det=max_det,
            verbose=False,
        )
    runtime_ms = (time.perf_counter() - start) * 1000

    detections: list[tuple[float, int, int, Image.Image]] = []
    for (tile_x, tile_y, tile), result in zip(tiles, results, strict=True):
        if result.masks is None:
            continue
        mask_arrays = result.masks.data.detach().cpu().numpy()
        tile_confidences = (
            result.boxes.conf.detach().cpu().numpy().tolist()
            if result.boxes is not None and result.boxes.conf is not None
            else [1.0] * len(mask_arrays)
        )
        for mask_array, confidence in zip(mask_arrays, tile_confidences, strict=False):
            if mask_array.sum() == 0:
                continue
            binary_mask = (mask_array > 0.5).astype(np.uint8)
            binary_mask *= 255
            tile_mask = Image.fromarray(binary_mask).convert("L")
            if tile_mask.size != tile.size:
                tile_mask = tile_mask.resize(tile.size, Image.Resampling.NEAREST)
            detections.append((float(confidence), tile_x, tile_y, tile_mask))

    masks: list[Image.Image] = []
    confidences: list[float] = []
    for confidence, tile_x, tile_y, tile_mask in sorted(detections, key=lambda item: item[0], reverse=True)[:max_det]:
        full_mask = Image.new("L", source.size, 0)
        full_mask.paste(tile_mask, (tile_x, tile_y))
        masks.append(full_mask)
        confidences.append(confidence)
    return source, masks, confidences, runtime_ms, len(tiles)


def overlay_mask(image: Image.Image, mask: Image.Image, color: tuple[int, int, int], alpha: int) -> Image.Image:
    base = image.convert("RGBA")
    color_layer = Image.new("RGBA", base.size, (*color, alpha))
    empty = Image.new("RGBA", base.size, (0, 0, 0, 0))
    tint = Image.composite(color_layer, empty, mask.convert("L"))
    return Image.alpha_composite(base, tint)


def run() -> None:
    args = parse_args()
    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise SystemExit(
            "Missing Python ML dependencies. Run: python -m pip install -r scripts/vision-ml/requirements.txt"
        ) from error

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    model_path, model_card_path, model_card = resolve_model(args)
    original_image_path = Path(args.image).resolve()
    inference_image_path = prepare_source_image(original_image_path, out, args.source_max_width)
    model = YOLO(str(model_path), task="segment")
    tile_count = None
    if args.tiled:
        image, masks, confidences, runtime_ms, tile_count = predict_tiled_masks(
            model,
            inference_image_path,
            args.imgsz,
            args.conf,
            args.iou,
            args.device,
            args.tile_size,
            args.overlap,
            args.batch,
            args.half,
            args.max_det,
            args.serial_tiles,
        )
    else:
        image, masks, confidences, runtime_ms = predict_masks(
            model,
            inference_image_path,
            args.imgsz,
            args.conf,
            args.iou,
            args.device,
            args.half,
            args.max_det,
        )
    instances = make_predicted_instances(image, masks, confidences)
    groups = group_instances_by_color(instances)
    seed = (args.seed_x, args.seed_y) if args.seed_x is not None and args.seed_y is not None else None
    selected_group = select_route_group(groups, instances, seed=seed)
    all_holds = build_all_hold_mask([instance.mask for instance in instances], image.size)
    selected_mask = selected_group.mask if selected_group is not None else Image.new("L", image.size, 0)

    all_holds_path = out / "all-holds-mask.png"
    selected_path = out / "selected-route-mask.png"
    overlay_path = out / "selected-overlay.png"
    all_overlay_path = out / "all-holds-overlay.png"
    groups_out = out / "groups"
    all_holds.save(all_holds_path)
    selected_mask.save(selected_path)
    overlay_mask(image, selected_mask, (255, 51, 102), 128).save(overlay_path)
    overlay_mask(image, all_holds, (0, 210, 255), 90).save(all_overlay_path)
    top_group_outputs = []
    palette = [(255, 51, 102), (47, 191, 156), (255, 184, 77), (114, 137, 255), (178, 96, 255)]
    if args.top_groups > 0:
        groups_out.mkdir(parents=True, exist_ok=True)
    for rank, group in enumerate(groups[: max(0, args.top_groups)]):
        color = palette[rank % len(palette)]
        mask_path = groups_out / f"group-{rank:02d}-mask.png"
        group_overlay_path = groups_out / f"group-{rank:02d}-overlay.png"
        group.mask.save(mask_path)
        overlay_mask(image, group.mask, color, 145).save(group_overlay_path)
        top_group_outputs.append(
            {
                "rank": rank,
                "groupId": group.id,
                "mask": str(mask_path),
                "overlay": str(group_overlay_path),
                "area": group.area,
                "instanceCount": group.instance_count,
                "score": group.score,
                "selection": group.selection,
                "color": {"h": group.color.h, "s": group.color.s, "l": group.color.l},
            }
        )

    report = {
        "image": str(original_image_path),
        "inferenceImage": str(inference_image_path),
        "sourceMaxWidth": args.source_max_width,
        "model": str(model_path),
        "modelCard": str(model_card_path) if model_card_path else None,
        "modelMethod": model_card.get("method") if model_card else None,
        "modelHash": model_card.get("files", {}).get("model", {}).get("sha256") if model_card else None,
        "runtimeMs": runtime_ms,
        "inferenceMode": "tiled" if args.tiled else "full-frame",
        "tileSize": args.tile_size if args.tiled else None,
        "overlap": args.overlap if args.tiled else None,
        "batch": args.batch if args.tiled else None,
        "half": args.half,
        "maxDet": args.max_det,
        "serialTiles": args.serial_tiles if args.tiled else None,
        "tileCount": tile_count,
        "instanceCount": len(instances),
        "groupCount": len(groups),
        "selectedGroupId": selected_group.id if selected_group is not None else None,
        "seed": {"x": args.seed_x, "y": args.seed_y} if seed is not None else None,
        "outputs": {
            "allHoldsMask": str(all_holds_path),
            "selectedRouteMask": str(selected_path),
            "selectedOverlay": str(overlay_path),
            "allHoldsOverlay": str(all_overlay_path),
            "topGroups": top_group_outputs,
        },
        "groups": [
            {
                "id": group.id,
                "instanceIds": group.instance_ids,
                "area": group.area,
                "score": group.score,
                "bbox": {
                    "minX": group.bbox[0],
                    "minY": group.bbox[1],
                    "maxX": group.bbox[2],
                    "maxY": group.bbox[3],
                },
                "instanceCount": group.instance_count,
                "selection": group.selection,
                "color": {"h": group.color.h, "s": group.color.s, "l": group.color.l},
            }
            for group in groups
        ],
    }
    (out / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

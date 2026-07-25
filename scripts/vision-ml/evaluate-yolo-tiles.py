from __future__ import annotations

import json
import time
from dataclasses import dataclass
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import numpy as np
from PIL import Image

from _common import (
    HslColor,
    PredictedGroup,
    binary_metrics,
    build_all_hold_mask,
    build_parser,
    component_recall,
    hsl_distance,
    group_instances_by_color,
    load_manifest,
    make_predicted_instances,
    median_color_hsl,
    percentile,
    rasterize_polygons,
    route_group_selection_score,
    select_route_group,
    weighted_average_hsl,
    write_jsonl,
)


def load_script_module(name: str, filename: str):
    spec = spec_from_file_location(name, Path(__file__).with_name(filename))
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load {filename}")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_evaluate = load_script_module("evaluate_yolo_seg", "evaluate-yolo-seg.py")
_tiles = load_script_module("prepare_yolo_tiles", "prepare-yolo-tiles.py")
average = _evaluate.average
build_ground_truth = _evaluate.build_ground_truth
mask_array = _evaluate.mask_array
mask_iou = _evaluate.mask_iou
tile_offsets = _tiles.tile_offsets


@dataclass(frozen=True)
class TiledInstance:
    id: int
    tile_x: int
    tile_y: int
    mask: Image.Image
    confidence: float
    color: HslColor
    area: int


def parse_args():
    parser = build_parser("Evaluate a YOLO hold segmentation model with overlapping tiled inference.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--manifest", default=".data/vision/heidelberg-yolo/crux-manifest.jsonl")
    parser.add_argument("--split", default="val", choices=["train", "val", "test", "all"])
    parser.add_argument("--out", default="scripts/output/vision-ml/eval-tiles")
    parser.add_argument("--tile-size", type=int, default=1024)
    parser.add_argument("--overlap", type=int, default=384)
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--conf", type=float, default=0.15)
    parser.add_argument("--iou", type=float, default=0.75)
    parser.add_argument("--device", default=None)
    parser.add_argument("--batch", type=int, default=1, help="Tile inference batch size.")
    parser.add_argument("--half", action="store_true", help="Use FP16 inference on supported CUDA devices.")
    parser.add_argument("--max-det", type=int, default=300, help="Maximum detections per tile.")
    parser.add_argument("--serial-tiles", action="store_true", help="Run each tile as a separate prediction call.")
    parser.add_argument(
        "--legacy-postprocess",
        action="store_true",
        help="Materialize one full-size mask per instance before grouping. Kept only for benchmark comparison.",
    )
    return parser.parse_args()


def full_mask_from_tile(instance: TiledInstance, size: tuple[int, int]) -> Image.Image:
    full_mask = Image.new("L", size, 0)
    full_mask.paste(instance.mask, (instance.tile_x, instance.tile_y))
    return full_mask


def union_tiled_masks(instances: list[TiledInstance], size: tuple[int, int]) -> Image.Image:
    output = Image.new("L", size, 0)
    for instance in instances:
        patch = output.crop(
            (
                instance.tile_x,
                instance.tile_y,
                instance.tile_x + instance.mask.width,
                instance.tile_y + instance.mask.height,
            )
        )
        patch = Image.composite(Image.new("L", instance.mask.size, 255), patch, instance.mask)
        output.paste(patch, (instance.tile_x, instance.tile_y))
    return output


def group_tiled_instances_by_color(instances: list[TiledInstance], size: tuple[int, int]) -> list[PredictedGroup]:
    grouped: list[dict] = []
    sorted_instances = sorted(instances, key=lambda item: item.area * item.confidence, reverse=True)
    for instance in sorted_instances:
        threshold = 0.12 if instance.color.s < 28 else 0.18
        best_index = -1
        best_distance = float("inf")
        for index, group in enumerate(grouped):
            distance = hsl_distance(instance.color, group["color"])
            if distance < best_distance:
                best_distance = distance
                best_index = index
        if best_index >= 0 and best_distance <= threshold:
            grouped[best_index]["instances"].append(instance)
            grouped[best_index]["color"] = weighted_average_hsl(grouped[best_index]["instances"])
        else:
            grouped.append({"instances": [instance], "color": instance.color})

    groups: list[PredictedGroup] = []
    for group in grouped:
        group_instances = list(group["instances"])
        area = sum(instance.area for instance in group_instances)
        score = sum(instance.confidence * np.sqrt(max(1, instance.area)) for instance in group_instances)
        mask = union_tiled_masks(group_instances, size)
        bbox = mask.getbbox() or (0, 0, 1, 1)
        selection = route_group_selection_score(area, len(group_instances), group["color"], bbox, size, float(score))
        groups.append(
            PredictedGroup(
                id=len(groups),
                instance_ids=sorted(instance.id for instance in group_instances),
                color=group["color"],
                area=area,
                score=float(score),
                mask=mask,
                bbox=bbox,
                instance_count=len(group_instances),
                selection=selection,
            )
        )

    sorted_groups = sorted(groups, key=lambda group: group.score, reverse=True)
    return [
        PredictedGroup(
            id=index,
            instance_ids=group.instance_ids,
            color=group.color,
            area=group.area,
            score=group.score,
            mask=group.mask,
            bbox=group.bbox,
            instance_count=group.instance_count,
            selection=group.selection,
        )
        for index, group in enumerate(sorted_groups)
    ]


def predict_tiled_masks_legacy(model, image_path: Path, args):
    source = Image.open(image_path).convert("RGB")
    x_offsets = tile_offsets(source.width, args.tile_size, args.overlap)
    y_offsets = tile_offsets(source.height, args.tile_size, args.overlap)
    tiles: list[tuple[int, int, Image.Image]] = []
    masks: list[Image.Image] = []
    confidences: list[float] = []

    for tile_y in y_offsets:
        for tile_x in x_offsets:
            tile_w = min(args.tile_size, source.width - tile_x)
            tile_h = min(args.tile_size, source.height - tile_y)
            tile = source.crop((tile_x, tile_y, tile_x + tile_w, tile_y + tile_h))
            tiles.append((tile_x, tile_y, tile))

    start = time.perf_counter()
    if args.serial_tiles:
        results = []
        for _, _, tile in tiles:
            results.extend(
                model.predict(
                    source=tile,
                    imgsz=args.imgsz,
                    conf=args.conf,
                    iou=args.iou,
                    device=args.device,
                    batch=1,
                    half=args.half,
                    max_det=args.max_det,
                    verbose=False,
                )
            )
    else:
        results = model.predict(
            source=[tile for _, _, tile in tiles],
            imgsz=args.imgsz,
            conf=args.conf,
            iou=args.iou,
            device=args.device,
            batch=args.batch,
            half=args.half,
            max_det=args.max_det,
            verbose=False,
        )
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
            tile_mask = Image.fromarray((mask_array > 0.5).astype(np.uint8) * 255).convert("L")
            if tile_mask.size != tile.size:
                tile_mask = tile_mask.resize(tile.size, Image.Resampling.NEAREST)
            if mask_array.sum() == 0:
                continue
            full_mask = Image.new("L", source.size, 0)
            full_mask.paste(tile_mask, (tile_x, tile_y))
            masks.append(full_mask)
            confidences.append(float(confidence))

    runtime_ms = (time.perf_counter() - start) * 1000
    return source, masks, confidences, runtime_ms, len(x_offsets) * len(y_offsets)


def predict_tiled_instances(model, image_path: Path, args):
    source = Image.open(image_path).convert("RGB")
    x_offsets = tile_offsets(source.width, args.tile_size, args.overlap)
    y_offsets = tile_offsets(source.height, args.tile_size, args.overlap)
    tiles: list[tuple[int, int, Image.Image]] = []
    instances: list[TiledInstance] = []

    for tile_y in y_offsets:
        for tile_x in x_offsets:
            tile_w = min(args.tile_size, source.width - tile_x)
            tile_h = min(args.tile_size, source.height - tile_y)
            tile = source.crop((tile_x, tile_y, tile_x + tile_w, tile_y + tile_h))
            tiles.append((tile_x, tile_y, tile))

    start = time.perf_counter()
    if args.serial_tiles:
        results = []
        for _, _, tile in tiles:
            results.extend(
                model.predict(
                    source=tile,
                    imgsz=args.imgsz,
                    conf=args.conf,
                    iou=args.iou,
                    device=args.device,
                    batch=1,
                    half=args.half,
                    max_det=args.max_det,
                    verbose=False,
                )
            )
    else:
        results = model.predict(
            source=[tile for _, _, tile in tiles],
            imgsz=args.imgsz,
            conf=args.conf,
            iou=args.iou,
            device=args.device,
            batch=args.batch,
            half=args.half,
            max_det=args.max_det,
            verbose=False,
        )
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
            tile_mask = Image.fromarray((mask_array > 0.5).astype(np.uint8) * 255).convert("L")
            if tile_mask.size != tile.size:
                tile_mask = tile_mask.resize(tile.size, Image.Resampling.NEAREST)
            area = int(np.count_nonzero(np.asarray(tile_mask) > 0))
            if area == 0:
                continue
            instances.append(
                TiledInstance(
                    id=len(instances),
                    tile_x=tile_x,
                    tile_y=tile_y,
                    mask=tile_mask,
                    confidence=float(confidence),
                    color=HslColor(h=0.0, s=0.0, l=0.0),
                    area=area,
                )
            )

    runtime_ms = (time.perf_counter() - start) * 1000
    return source, instances, runtime_ms, len(x_offsets) * len(y_offsets)


def run() -> None:
    args = parse_args()
    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise SystemExit(
            "Missing Python ML dependencies. Run: python -m pip install -r scripts/vision-ml/requirements.txt"
        ) from error

    out = Path(args.out).resolve()
    masks_out = out / "masks"
    masks_out.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(Path(args.model).resolve()), task="segment")
    warmup = Image.new("RGB", (args.imgsz, args.imgsz), (0, 0, 0))
    model.predict(
        source=warmup,
        imgsz=args.imgsz,
        conf=args.conf,
        iou=args.iou,
        device=args.device,
        half=args.half,
        verbose=False,
    )
    entries = load_manifest(Path(args.manifest).resolve())
    rows = [entry for entry in entries if args.split == "all" or getattr(entry, "split", args.split) == args.split]

    metric_rows = []
    runtime_values: list[float] = []
    postprocess_values: list[float] = []
    end_to_end_values: list[float] = []
    all_hold_iou: list[float] = []
    all_hold_precision: list[float] = []
    all_hold_recall: list[float] = []
    all_hold_f1: list[float] = []
    component_recalls: list[float] = []
    best_route_group_ious: list[float] = []
    auto_route_ious: list[float] = []

    for entry in rows:
        if args.legacy_postprocess:
            image, predicted_masks, confidences, runtime_ms, tile_count = predict_tiled_masks_legacy(
                model, entry.image_path, args
            )
            postprocess_start = time.perf_counter()
            instances = make_predicted_instances(image, predicted_masks, confidences)
            groups = group_instances_by_color(instances)
            predicted_all = build_all_hold_mask([instance.mask for instance in instances], image.size)
        else:
            image, tiled_instances, runtime_ms, tile_count = predict_tiled_instances(model, entry.image_path, args)
            postprocess_start = time.perf_counter()
            instances = []
            colorized_instances = []
            for instance in tiled_instances:
                tile = image.crop(
                    (
                        instance.tile_x,
                        instance.tile_y,
                        instance.tile_x + instance.mask.width,
                        instance.tile_y + instance.mask.height,
                    )
                )
                colorized_instances.append(
                    TiledInstance(
                        id=instance.id,
                        tile_x=instance.tile_x,
                        tile_y=instance.tile_y,
                        mask=instance.mask,
                        confidence=instance.confidence,
                        color=median_color_hsl(tile, instance.mask),
                        area=instance.area,
                    )
                )
            groups = group_tiled_instances_by_color(colorized_instances, image.size)
            predicted_all = union_tiled_masks(colorized_instances, image.size)
        selected_group = select_route_group(groups, instances)
        postprocess_ms = (time.perf_counter() - postprocess_start) * 1000
        runtime_values.append(runtime_ms)
        postprocess_values.append(postprocess_ms)
        end_to_end_values.append(runtime_ms + postprocess_ms)
        hold_masks, all_hold_gt, route_masks = build_ground_truth(entry, image.size)

        all_metrics = binary_metrics(predicted_all, all_hold_gt)
        comp_recall = component_recall(predicted_all, hold_masks)
        route_arrays = [mask_array(route["mask"]) for route in route_masks]
        group_arrays = [mask_array(group.mask) for group in groups]
        best_route_iou = 0.0
        for group_array in group_arrays:
            for route_array in route_arrays:
                best_route_iou = max(best_route_iou, mask_iou(group_array, route_array))
        auto_route_iou = 0.0
        if selected_group is not None:
            selected_array = mask_array(selected_group.mask)
            for route_array in route_arrays:
                auto_route_iou = max(auto_route_iou, mask_iou(selected_array, route_array))

        selected_mask = selected_group.mask if selected_group is not None else Image.new("L", image.size, 0)
        selected_path = masks_out / f"{entry.id}-selected.png"
        holds_path = masks_out / f"{entry.id}-predicted-holds.png"
        selected_mask.save(selected_path)
        predicted_all.save(holds_path)

        all_hold_iou.append(float(all_metrics["iou"]))
        all_hold_precision.append(float(all_metrics["precision"]))
        all_hold_recall.append(float(all_metrics["recall"]))
        all_hold_f1.append(float(all_metrics["f1"]))
        component_recalls.append(comp_recall)
        best_route_group_ious.append(best_route_iou)
        auto_route_ious.append(auto_route_iou)

        metric_rows.append(
            {
                "id": entry.id,
                "imagePath": str(entry.image_path),
                "width": image.width,
                "height": image.height,
                "runtimeMs": runtime_ms,
                "postprocessMs": postprocess_ms,
                "endToEndMs": runtime_ms + postprocess_ms,
                "tileCount": tile_count,
                "instanceCount": len(instances) if args.legacy_postprocess else len(tiled_instances),
                "groupCount": len(groups),
                "selectedGroupId": selected_group.id if selected_group is not None else None,
                "selectedMaskPath": str(selected_path.relative_to(out)),
                "predictedHoldsMaskPath": str(holds_path.relative_to(out)),
                "allHold": all_metrics,
                "componentRecall": comp_recall,
                "bestRouteGroupIou": best_route_iou,
                "autoRouteIou": auto_route_iou,
            }
        )

    write_jsonl(out / "metrics.jsonl", metric_rows)
    summary = {
        "imageCount": len(metric_rows),
        "model": str(Path(args.model).resolve()),
        "imgsz": args.imgsz,
        "tileSize": args.tile_size,
        "overlap": args.overlap,
        "batch": args.batch,
        "half": args.half,
        "maxDet": args.max_det,
        "serialTiles": args.serial_tiles,
        "conf": args.conf,
        "iou": args.iou,
        "split": args.split,
        "allHold": {
            "iou": average(all_hold_iou),
            "precision": average(all_hold_precision),
            "recall": average(all_hold_recall),
            "f1": average(all_hold_f1),
        },
        "componentRecall": average(component_recalls),
        "bestRouteGroupIou": average(best_route_group_ious),
        "autoRouteIou": average(auto_route_ious),
        "runtimeMs": {"p50": percentile(runtime_values, 50), "p90": percentile(runtime_values, 90)},
        "postprocessMs": {"p50": percentile(postprocess_values, 50), "p90": percentile(postprocess_values, 90)},
        "endToEndMs": {"p50": percentile(end_to_end_values, 50), "p90": percentile(end_to_end_values, 90)},
        "gates": {
            "allHoldRecall": average(all_hold_recall) >= 0.9,
            "bestRouteGroupIou": average(best_route_group_ious) >= 0.75,
            "autoRouteIou": average(auto_route_ious) >= 0.65,
            "p90RuntimeMs": percentile(runtime_values, 90) <= 1500,
        },
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

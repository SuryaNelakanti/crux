from __future__ import annotations

import argparse
import colorsys
import json
import math
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
from PIL import Image, ImageDraw


@dataclass(frozen=True)
class ManifestHold:
    id: int
    polygon: list[dict[str, float]]
    route_id: str
    route_label: str


@dataclass(frozen=True)
class ManifestRoute:
    id: str
    label: str
    hold_ids: list[int]


@dataclass(frozen=True)
class ManifestEntry:
    id: str
    image_path: Path
    width: int
    height: int
    holds: list[ManifestHold]
    routes: list[ManifestRoute]
    split: str = "all"


@dataclass(frozen=True)
class HslColor:
    h: float
    s: float
    l: float


@dataclass(frozen=True)
class PredictedInstance:
    id: int
    mask: Image.Image
    confidence: float
    color: HslColor
    area: int
    bbox: tuple[int, int, int, int]


@dataclass(frozen=True)
class PredictedGroup:
    id: int
    instance_ids: list[int]
    color: HslColor
    area: int
    score: float
    mask: Image.Image
    bbox: tuple[int, int, int, int]
    instance_count: int
    selection: dict[str, float]


def read_jsonl(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def write_jsonl(path: Path, rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True))
            handle.write("\n")


def load_manifest(path: Path) -> list[ManifestEntry]:
    root = path.parent
    entries: list[ManifestEntry] = []
    for row in read_jsonl(path):
        image_path = Path(row["imagePath"])
        if not image_path.is_absolute():
            image_path = (root / image_path).resolve()
        holds = [
            ManifestHold(
                id=int(hold["id"]),
                polygon=list(hold["polygon"]),
                route_id=str(hold.get("routeId", "")),
                route_label=str(hold.get("routeLabel", "")),
            )
            for hold in row.get("holds", [])
        ]
        routes = [
            ManifestRoute(
                id=str(route["id"]),
                label=str(route.get("label", route["id"])),
                hold_ids=[int(hold_id) for hold_id in route.get("holdIds", [])],
            )
            for route in row.get("routes", [])
        ]
        entries.append(
            ManifestEntry(
                id=str(row["id"]),
                image_path=image_path,
                width=int(row["width"]),
                height=int(row["height"]),
                holds=holds,
                routes=routes,
                split=str(row.get("split", "all")),
            )
        )
    return entries


def stable_split(entries: Sequence[ManifestEntry], train: float, val: float) -> dict[str, list[ManifestEntry]]:
    if train <= 0 or val <= 0 or train + val >= 1:
        raise ValueError("--train and --val must be positive and leave room for test")

    sorted_entries = sorted(entries, key=lambda entry: entry.id)
    split: dict[str, list[ManifestEntry]] = {"train": [], "val": [], "test": []}
    total = len(sorted_entries)
    if total <= 2:
        split["train"] = sorted_entries[:1]
        split["val"] = sorted_entries[1:]
        return split

    train_cut = math.floor(total * train)
    val_cut = math.floor(total * (train + val))
    for index, entry in enumerate(sorted_entries):
        if index < train_cut:
            split["train"].append(entry)
        elif index < val_cut:
            split["val"].append(entry)
        else:
            split["test"].append(entry)
    if total > 0 and len(split["val"]) == 0:
        split["val"].append(split["train"].pop() if split["train"] else sorted_entries[0])
    if total > 1 and len(split["test"]) == 0:
        source = split["train"] if len(split["train"]) > 1 else split["val"]
        split["test"].append(source.pop())
    return split


def safe_stem(value: str) -> str:
    safe = "".join(char if char.isalnum() or char in "-_" else "_" for char in value)
    return safe.strip("_") or "image"


def copy_image(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def polygon_to_yolo_line(polygon: Sequence[dict[str, float]], width: int, height: int) -> str | None:
    points: list[str] = []
    for point in polygon:
        x = min(1.0, max(0.0, float(point["x"]) / max(1, width)))
        y = min(1.0, max(0.0, float(point["y"]) / max(1, height)))
        points.extend([f"{x:.6f}", f"{y:.6f}"])
    if len(points) < 6:
        return None
    return "0 " + " ".join(points)


def rasterize_polygons(width: int, height: int, polygons: Sequence[Sequence[dict[str, float]]]) -> Image.Image:
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        points = [(float(point["x"]), float(point["y"])) for point in polygon]
        if len(points) >= 3:
            draw.polygon(points, fill=255)
    return mask


def binary_metrics(predicted: Image.Image, ground_truth: Image.Image) -> dict[str, float | int]:
    pred = predicted.convert("L")
    gt = ground_truth.convert("L")
    if pred.size != gt.size:
        pred = pred.resize(gt.size, Image.Resampling.NEAREST)

    pred_array = np.asarray(pred) > 0
    gt_array = np.asarray(gt) > 0
    true_positive = int(np.count_nonzero(pred_array & gt_array))
    false_positive = int(np.count_nonzero(pred_array & ~gt_array))
    false_negative = int(np.count_nonzero(~pred_array & gt_array))
    true_negative = int(np.count_nonzero(~pred_array & ~gt_array))

    precision = _safe_divide(true_positive, true_positive + false_positive)
    recall = _safe_divide(true_positive, true_positive + false_negative)
    f1 = _safe_divide(2 * precision * recall, precision + recall)
    iou = _safe_divide(true_positive, true_positive + false_positive + false_negative)
    return {
        "truePositive": true_positive,
        "falsePositive": false_positive,
        "falseNegative": false_negative,
        "trueNegative": true_negative,
        "iou": iou,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def component_recall(predicted: Image.Image, components: Sequence[Image.Image], min_overlap: float = 0.5) -> float:
    if not components:
        return 0.0

    pred = predicted.convert("L")
    pred_array = np.asarray(pred) > 0
    matched = 0
    for component in components:
        gt = component.convert("L")
        if pred.size != gt.size:
            resized_pred = pred.resize(gt.size, Image.Resampling.NEAREST)
            pred_component_array = np.asarray(resized_pred) > 0
        else:
            pred_component_array = pred_array
        gt_array = np.asarray(gt) > 0
        area = int(np.count_nonzero(gt_array))
        overlap = int(np.count_nonzero(pred_component_array & gt_array))
        if area > 0 and overlap / area >= min_overlap:
            matched += 1
    return matched / len(components)


def build_all_hold_mask(masks: Sequence[Image.Image], size: tuple[int, int]) -> Image.Image:
    output = Image.new("L", size, 0)
    for mask in masks:
        mask_l = mask if mask.mode == "L" else mask.convert("L")
        if mask_l.size != size:
            mask_l = mask_l.resize(size, Image.Resampling.NEAREST)
        output.paste(255, (0, 0), mask_l)
    return output


def make_predicted_instances(
    source_image: Image.Image, masks: Sequence[Image.Image], confidences: Sequence[float]
) -> list[PredictedInstance]:
    instances: list[PredictedInstance] = []
    source_rgb = source_image if source_image.mode == "RGB" else source_image.convert("RGB")
    for index, mask in enumerate(masks):
        mask_l = mask.convert("L")
        if mask_l.size != source_rgb.size:
            mask_l = mask_l.resize(source_rgb.size, Image.Resampling.NEAREST)
        bbox = mask_l.getbbox()
        if bbox is None:
            continue
        area = mask_area(mask_l, bbox)
        if area == 0:
            continue
        instances.append(
            PredictedInstance(
                id=index,
                mask=mask_l,
                confidence=float(confidences[index]) if index < len(confidences) else 1.0,
                color=median_color_hsl(source_rgb, mask_l, bbox),
                area=area,
                bbox=bbox,
            )
        )
    return instances


def group_instances_by_color(instances: Sequence[PredictedInstance]) -> list[PredictedGroup]:
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
        size = group_instances[0].mask.size
        mask = build_all_hold_mask([instance.mask for instance in group_instances], size)
        area = sum(instance.area for instance in group_instances)
        score = sum(instance.confidence * math.sqrt(max(1, instance.area)) for instance in group_instances)
        bbox = (
            min(instance.bbox[0] for instance in group_instances),
            min(instance.bbox[1] for instance in group_instances),
            max(instance.bbox[2] for instance in group_instances),
            max(instance.bbox[3] for instance in group_instances),
        )
        selection = route_group_selection_score(area, len(group_instances), group["color"], bbox, size, score)
        groups.append(
            PredictedGroup(
                id=len(groups),
                instance_ids=sorted(instance.id for instance in group_instances),
                color=group["color"],
                area=area,
                score=score,
                mask=mask,
                bbox=bbox,
                instance_count=len(group_instances),
                selection=selection,
            )
        )

    sorted_groups = sorted(groups, key=lambda group: (group.selection["score"], group.score), reverse=True)
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


def select_route_group(
    groups: Sequence[PredictedGroup], instances: Sequence[PredictedInstance], seed: tuple[int, int] | None = None
) -> PredictedGroup | None:
    if not groups:
        return None

    if seed is not None:
        x, y = seed
        direct_ids: set[int] = set()
        best_instance_id: int | None = None
        best_distance = float("inf")
        for instance in instances:
            mask = instance.mask.convert("L")
            clamped_x = min(mask.width - 1, max(0, x))
            clamped_y = min(mask.height - 1, max(0, y))
            if mask.getpixel((clamped_x, clamped_y)) > 0:
                direct_ids.add(instance.id)
                break
            bbox = mask.getbbox()
            if bbox is None:
                continue
            cx = (bbox[0] + bbox[2]) / 2
            cy = (bbox[1] + bbox[3]) / 2
            distance = (cx - x) ** 2 + (cy - y) ** 2
            if distance < best_distance:
                best_distance = distance
                best_instance_id = instance.id
        target_id = next(iter(direct_ids), best_instance_id)
        if target_id is not None:
            for group in groups:
                if target_id in group.instance_ids:
                    return group

    return max(groups, key=lambda group: (group.selection["score"], group.score))


def mask_area(mask: Image.Image, bbox: tuple[int, int, int, int] | None = None) -> int:
    mask_l = mask.convert("L")
    if bbox is not None:
        mask_l = mask_l.crop(bbox)
    return int(np.count_nonzero(np.asarray(mask_l)))


def median_color_hsl(
    source_image: Image.Image, mask: Image.Image, bbox: tuple[int, int, int, int] | None = None
) -> HslColor:
    image = source_image if source_image.mode == "RGB" else source_image.convert("RGB")
    mask_l = mask if mask.mode == "L" else mask.convert("L")
    if mask_l.size != image.size:
        mask_l = mask_l.resize(image.size, Image.Resampling.NEAREST)
    if bbox is not None:
        image = image.crop(bbox)
        mask_l = mask_l.crop(bbox)
    image_array = np.asarray(image)
    mask_array = np.asarray(mask_l) > 0
    if not np.any(mask_array):
        return HslColor(h=0.0, s=0.0, l=0.0)
    median_rgb = np.median(image_array[mask_array], axis=0) / 255
    r, g, b = (float(value) for value in median_rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return HslColor(h=h * 360, s=s * 100, l=l * 100)


def hsl_distance(a: HslColor, b: HslColor) -> float:
    raw_hue = abs(a.h - b.h)
    hue = min(raw_hue, 360 - raw_hue) / 180
    sat = (a.s - b.s) / 100
    light = (a.l - b.l) / 100
    return math.sqrt((hue * 1.35) ** 2 + sat * sat + (light * 0.75) ** 2)


def route_group_selection_score(
    area: int,
    instance_count: int,
    color: HslColor,
    bbox: tuple[int, int, int, int],
    image_size: tuple[int, int],
    raw_score: float,
) -> dict[str, float]:
    width, height = image_size
    total = max(1, width * height)
    coverage = area / total
    if coverage < 0.0008:
        coverage_score = 0.08
    elif coverage < 0.003:
        coverage_score = min(1.0, max(0.0, coverage / 0.003)) * 0.82
    elif coverage <= 0.055:
        coverage_score = 1.0
    elif coverage <= 0.12:
        coverage_score = min(1.0, max(0.35, 1 - (coverage - 0.055) / 0.065))
    else:
        coverage_score = 0.18

    saturation_score = min(1.0, max(0.0, (color.s - 12) / 58))
    lightness_score = min(1.0, max(0.0, 1 - abs(color.l - 55) / 58))
    dark_penalty = max(0.0, (18 - color.l) / 18) * 0.18
    bright_penalty = max(0.0, (color.l - 96) / 4) * 0.1
    lightness_penalty = min(0.2, dark_penalty + bright_penalty)
    count_score = min(1.0, max(0.0, (instance_count - 1) / 5))
    bbox_width = max(1, bbox[2] - bbox[0])
    bbox_height = max(1, bbox[3] - bbox[1])
    spread = math.sqrt((bbox_width / max(1, width)) ** 2 + (bbox_height / max(1, height)) ** 2)
    spread_score = min(1.0, max(0.0, (spread - 0.08) / 0.48))
    wide_spread_penalty = min(0.08, max(0.0, (spread_score - 0.85) / 0.15) * 0.08)
    touches_edge = (
        (1 if bbox[0] <= width * 0.01 else 0)
        + (1 if bbox[2] >= width * 0.99 else 0)
        + (1 if bbox[1] <= height * 0.01 else 0)
        + (1 if bbox[3] >= height * 0.99 else 0)
    )
    edge_penalty = touches_edge * 0.12 + (0.32 if coverage > 0.18 else 0.0)
    normalized_raw = min(1.0, max(0.0, raw_score / 600))
    score = min(
        1.0,
        max(
            0.0,
            normalized_raw * 0.22
            + coverage_score * 0.14
            + saturation_score * 0.26
            + lightness_score * 0.12
            + count_score * 0.08
            + spread_score * 0.02
            - edge_penalty * 0.8
            - lightness_penalty * 0.8
            - wide_spread_penalty * 0.6,
        ),
    )
    return {
        "score": score,
        "coverage": coverage,
        "coverageScore": coverage_score,
        "saturationScore": saturation_score,
        "lightnessScore": lightness_score,
        "holdCountScore": count_score,
        "spreadScore": spread_score,
        "edgePenalty": edge_penalty,
        "lightnessPenalty": lightness_penalty,
        "wideSpreadPenalty": wide_spread_penalty,
    }


def weighted_average_hsl(instances: Sequence[PredictedInstance]) -> HslColor:
    sum_sin = 0.0
    sum_cos = 0.0
    sum_s = 0.0
    sum_l = 0.0
    total = 0.0
    for instance in instances:
        weight = max(1, instance.area)
        radians = math.radians(instance.color.h)
        sum_sin += math.sin(radians) * weight
        sum_cos += math.cos(radians) * weight
        sum_s += instance.color.s * weight
        sum_l += instance.color.l * weight
        total += weight
    hue = math.degrees(math.atan2(sum_sin, sum_cos))
    if hue < 0:
        hue += 360
    return HslColor(h=hue, s=sum_s / max(1, total), l=sum_l / max(1, total))


def percentile(values: Sequence[float], percentile_value: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = min(len(sorted_values) - 1, max(0, math.ceil((percentile_value / 100) * len(sorted_values)) - 1))
    return sorted_values[index]


def build_parser(description: str) -> argparse.ArgumentParser:
    return argparse.ArgumentParser(description=description, formatter_class=argparse.ArgumentDefaultsHelpFormatter)


def _safe_divide(numerator: float, denominator: float) -> float:
    return 0.0 if denominator == 0 else numerator / denominator

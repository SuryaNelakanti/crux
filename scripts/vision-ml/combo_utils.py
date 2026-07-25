from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
from PIL import Image, ImageDraw

from _common import (
    HslColor,
    PredictedInstance,
    binary_metrics,
    build_all_hold_mask,
    group_instances_by_color,
    mask_area,
    median_color_hsl,
    rasterize_polygons,
    select_route_group,
    write_jsonl,
)


PROPOSAL_FEATURE_NAMES = [
    "primitiveScore",
    "areaRatio",
    "bboxCenterX",
    "bboxCenterY",
    "bboxWidth",
    "bboxHeight",
    "bboxAspect",
    "hueSin",
    "hueCos",
    "saturation",
    "lightness",
    "edgeConfidence",
]


@dataclass(frozen=True)
class ComboProposal:
    id: int
    mask: Image.Image
    confidence: float
    polygon: list[dict[str, float]]
    bbox: tuple[int, int, int, int]
    color: HslColor
    edge_confidence: float


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def proposal_rows_from_json(path: Path) -> list[dict]:
    raw = read_json(path)
    if not isinstance(raw, list):
        raise ValueError(f"Proposal file must be a list: {path}")
    return [row for row in raw if isinstance(row, dict)]


def polygon_bbox(polygon: Sequence[dict[str, float]], width: int, height: int) -> tuple[int, int, int, int]:
    xs = [float(point["x"]) for point in polygon]
    ys = [float(point["y"]) for point in polygon]
    min_x = max(0, min(width - 1, math.floor(min(xs))))
    min_y = max(0, min(height - 1, math.floor(min(ys))))
    max_x = max(min_x + 1, min(width, math.ceil(max(xs))))
    max_y = max(min_y + 1, min(height, math.ceil(max(ys))))
    return min_x, min_y, max_x, max_y


def contour_polygon(mask: Image.Image) -> list[dict[str, float]] | None:
    bbox = mask.convert("L").getbbox()
    if bbox is None:
        return None
    min_x, min_y, max_x, max_y = bbox
    return [
        {"x": float(min_x), "y": float(min_y)},
        {"x": float(max_x), "y": float(min_y)},
        {"x": float(max_x), "y": float(max_y)},
        {"x": float(min_x), "y": float(max_y)},
    ]


def load_combo_proposals(row: dict, image: Image.Image) -> list[ComboProposal]:
    proposals = row.get("proposals")
    if not isinstance(proposals, list):
        return []
    loaded: list[ComboProposal] = []
    for index, proposal in enumerate(proposals):
        if not isinstance(proposal, dict):
            continue
        polygon = proposal.get("polygon")
        if not isinstance(polygon, list) or len(polygon) < 3:
            continue
        clean_polygon = [
            {
                "x": min(float(image.width - 1), max(0.0, float(point["x"]))),
                "y": min(float(image.height - 1), max(0.0, float(point["y"]))),
            }
            for point in polygon
            if isinstance(point, dict) and "x" in point and "y" in point
        ]
        if len(clean_polygon) < 3:
            continue
        mask = rasterize_polygons(image.width, image.height, [clean_polygon])
        bbox = mask.getbbox()
        if bbox is None:
            continue
        loaded.append(
            ComboProposal(
                id=index,
                mask=mask,
                confidence=float(proposal.get("confidence", proposal.get("score", 1.0))),
                polygon=clean_polygon,
                bbox=bbox,
                color=median_color_hsl(image, mask, bbox),
                edge_confidence=float(proposal.get("edgeConfidence", proposal.get("confidence", 1.0))),
            )
        )
    return loaded


def proposal_features(proposal: ComboProposal, image_size: tuple[int, int]) -> list[float]:
    width, height = image_size
    bbox_width = max(1, proposal.bbox[2] - proposal.bbox[0])
    bbox_height = max(1, proposal.bbox[3] - proposal.bbox[1])
    area_ratio = mask_area(proposal.mask, proposal.bbox) / max(1, width * height)
    hue = math.radians(proposal.color.h)
    return [
        proposal.confidence,
        area_ratio,
        ((proposal.bbox[0] + proposal.bbox[2]) / 2) / max(1, width),
        ((proposal.bbox[1] + proposal.bbox[3]) / 2) / max(1, height),
        bbox_width / max(1, width),
        bbox_height / max(1, height),
        min(10.0, bbox_width / max(1, bbox_height)) / 10.0,
        math.sin(hue),
        math.cos(hue),
        proposal.color.s / 100,
        proposal.color.l / 100,
        proposal.edge_confidence,
    ]


def mask_iou(a: Image.Image, b: Image.Image) -> float:
    a_array = np.asarray(a.convert("L")) > 0
    b_l = b.convert("L")
    if b_l.size != a.size:
        b_l = b_l.resize(a.size, Image.Resampling.NEAREST)
    b_array = np.asarray(b_l) > 0
    true_positive = int(np.count_nonzero(a_array & b_array))
    false_positive = int(np.count_nonzero(a_array & ~b_array))
    false_negative = int(np.count_nonzero(~a_array & b_array))
    denominator = true_positive + false_positive + false_negative
    return 0.0 if denominator == 0 else true_positive / denominator


def matched_hold(
    proposal: ComboProposal,
    hold_masks: Sequence[Image.Image],
    hold_route_ids: Sequence[str],
    hold_threshold: float,
    ignore_threshold: float,
) -> tuple[str, int | None, str | None, float]:
    best_iou = 0.0
    best_index: int | None = None
    for index, hold_mask in enumerate(hold_masks):
        iou = mask_iou(proposal.mask, hold_mask)
        if iou > best_iou:
            best_iou = iou
            best_index = index
    if best_index is not None and best_iou >= hold_threshold:
        return "hold", best_index, hold_route_ids[best_index], best_iou
    if best_iou >= ignore_threshold:
        return "ignore", best_index, hold_route_ids[best_index] if best_index is not None else None, best_iou
    return "non_hold", None, None, best_iou


def build_proposal_dataset_rows(
    manifest_entries: Sequence,
    proposal_rows: Sequence[dict],
    hold_threshold: float = 0.35,
    ignore_threshold: float = 0.12,
) -> tuple[list[dict], dict]:
    proposals_by_id = {str(row.get("id")): row for row in proposal_rows}
    rows: list[dict] = []
    recall_total = 0
    recall_hit = 0
    skipped_images: list[str] = []
    for entry in manifest_entries:
        raw_row = proposals_by_id.get(entry.id)
        if raw_row is None:
            skipped_images.append(entry.id)
            continue
        image = Image.open(entry.image_path).convert("RGB")
        hold_masks = [rasterize_polygons(image.width, image.height, [hold.polygon]) for hold in entry.holds]
        hold_route_ids = [hold.route_id for hold in entry.holds]
        proposals = load_combo_proposals(raw_row, image)
        matched_holds: set[int] = set()
        for proposal in proposals:
            label, hold_id, route_id, best_iou = matched_hold(
                proposal, hold_masks, hold_route_ids, hold_threshold, ignore_threshold
            )
            if hold_id is not None and label == "hold":
                matched_holds.add(hold_id)
            rows.append(
                {
                    "id": f"{entry.id}:{proposal.id}",
                    "imageId": entry.id,
                    "imagePath": str(entry.image_path),
                    "width": image.width,
                    "height": image.height,
                    "split": getattr(entry, "split", "all"),
                    "proposalId": proposal.id,
                    "polygon": proposal.polygon,
                    "bbox": list(proposal.bbox),
                    "features": proposal_features(proposal, image.size),
                    "featureNames": PROPOSAL_FEATURE_NAMES,
                    "label": label,
                    "isHold": 1 if label == "hold" else 0,
                    "trainWeight": 0.0 if label == "ignore" else 1.0,
                    "matchedHoldId": hold_id,
                    "matchedRouteId": route_id,
                    "matchedIou": best_iou,
                }
            )
        recall_total += len(hold_masks)
        recall_hit += len(matched_holds)
    summary = summarize_proposal_rows(rows)
    summary.update(
        {
            "holdThreshold": hold_threshold,
            "ignoreThreshold": ignore_threshold,
            "proposalRecall": 0.0 if recall_total == 0 else recall_hit / recall_total,
            "proposalRecallHitCount": recall_hit,
            "proposalRecallTotal": recall_total,
            "skippedImages": skipped_images,
        }
    )
    return rows, summary


def build_prompted_proposal_dataset_rows(manifest_entries: Sequence, proposal_rows: Sequence[dict]) -> tuple[list[dict], dict]:
    proposals_by_id = {str(row.get("id")): row for row in proposal_rows}
    entries_by_id = {str(entry.id): entry for entry in manifest_entries}
    rows: list[dict] = []
    recall_total = 0
    recall_hit = 0
    skipped_images: list[str] = []

    for image_id, raw_row in proposals_by_id.items():
        entry = entries_by_id.get(image_id)
        if entry is None:
            skipped_images.append(image_id)
            continue
        image = Image.open(entry.image_path).convert("RGB")
        hold_by_id = {int(hold.id): hold for hold in entry.holds}
        proposals = load_combo_proposals(raw_row, image)
        raw_proposals = raw_row.get("proposals", [])
        matched_holds: set[int] = set()
        recall_total += len(entry.holds)

        for proposal in proposals:
            raw_proposal = raw_proposals[proposal.id] if proposal.id < len(raw_proposals) else {}
            manual_hold_id = raw_proposal.get("manualHoldId") if isinstance(raw_proposal, dict) else None
            try:
                hold_id = int(manual_hold_id)
            except (TypeError, ValueError):
                hold_id = None
            hold = hold_by_id.get(hold_id) if hold_id is not None else None
            route_id = hold.route_id if hold is not None else str(raw_proposal.get("routeId", ""))
            if hold is not None:
                matched_holds.add(hold.id)
            rows.append(
                {
                    "id": f"{entry.id}:{proposal.id}",
                    "imageId": entry.id,
                    "imagePath": str(entry.image_path),
                    "width": image.width,
                    "height": image.height,
                    "split": getattr(entry, "split", "all"),
                    "proposalId": proposal.id,
                    "polygon": proposal.polygon,
                    "bbox": list(proposal.bbox),
                    "features": proposal_features(proposal, image.size),
                    "featureNames": PROPOSAL_FEATURE_NAMES,
                    "label": "hold" if hold is not None else "ignore",
                    "isHold": 1 if hold is not None else 0,
                    "trainWeight": 1.0 if hold is not None else 0.0,
                    "matchedHoldId": hold.id if hold is not None else None,
                    "matchedRouteId": route_id or None,
                    "matchedIou": 1.0 if hold is not None else 0.0,
                    "labelSource": "sam2-bbox-refine",
                }
            )
        recall_hit += len(matched_holds)

    summary = summarize_proposal_rows(rows)
    summary.update(
        {
            "labelPolicy": "trusted prompt hold IDs from SAM2 bbox refinement",
            "proposalRecall": 0.0 if recall_total == 0 else recall_hit / recall_total,
            "proposalRecallHitCount": recall_hit,
            "proposalRecallTotal": recall_total,
            "skippedImages": skipped_images,
        }
    )
    return rows, summary


def summarize_proposal_rows(rows: Sequence[dict]) -> dict:
    by_split: dict[str, int] = {}
    by_label: dict[str, int] = {}
    for row in rows:
        by_split[str(row.get("split", "all"))] = by_split.get(str(row.get("split", "all")), 0) + 1
        by_label[str(row.get("label", "unknown"))] = by_label.get(str(row.get("label", "unknown")), 0) + 1
    return {
        "proposalCount": len(rows),
        "splitCounts": by_split,
        "labelCounts": by_label,
        "featureNames": PROPOSAL_FEATURE_NAMES,
    }


def validate_no_pseudo_leakage(rows: Sequence[dict]) -> dict:
    issues = []
    for row in rows:
        source = str(row.get("labelSource", "manual"))
        split = str(row.get("split", "all"))
        if source in {"reviewed-sam3", "sam3-proposal", "sam3_pseudo"} and split != "train":
            issues.append(f"{row.get('id')} has pseudo label source in split {split}")
    return {"valid": len(issues) == 0, "issues": issues}


def write_proposal_dataset(out: Path, rows: Sequence[dict], summary: dict) -> None:
    out.mkdir(parents=True, exist_ok=True)
    write_jsonl(out / "proposals.jsonl", rows)
    (out / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    (out / "leakage-audit.json").write_text(
        json.dumps(validate_no_pseudo_leakage(rows), indent=2, sort_keys=True),
        encoding="utf-8",
    )


def rows_by_split(rows: Sequence[dict], split: str) -> list[dict]:
    if split == "all":
        return list(rows)
    return [row for row in rows if str(row.get("split", "all")) == split]


def score_rows_with_linear_heads(rows: Sequence[dict], weights: dict) -> list[dict]:
    hold = np.asarray(weights["hold"], dtype=np.float32)
    route = np.asarray(weights["route"], dtype=np.float32)
    quality = np.asarray(weights["quality"], dtype=np.float32)
    output = []
    for row in rows:
        x = np.asarray([1.0, *row["features"]], dtype=np.float32)
        is_hold = sigmoid(float(np.dot(hold, x)))
        route_relevance = sigmoid(float(np.dot(route, x)))
        quality_score = sigmoid(float(np.dot(quality, x)))
        output.append({**row, "scores": {"isHold": is_hold, "routeRelevance": route_relevance, "quality": quality_score}})
    return output


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, value))))


def instances_from_scored_rows(image: Image.Image, scored_rows: Sequence[dict], hold_threshold: float) -> list[PredictedInstance]:
    instances: list[PredictedInstance] = []
    for row in scored_rows:
        score = float(row.get("scores", {}).get("isHold", 0.0))
        if score < hold_threshold:
            continue
        polygon = row.get("polygon")
        if not isinstance(polygon, list) or len(polygon) < 3:
            continue
        mask = rasterize_polygons(image.width, image.height, [polygon])
        bbox = mask.getbbox()
        if bbox is None:
            continue
        instances.append(
            PredictedInstance(
                id=int(row.get("proposalId", len(instances))),
                mask=mask,
                confidence=score,
                color=median_color_hsl(image, mask, bbox),
                area=mask_area(mask, bbox),
                bbox=bbox,
            )
        )
    return instances


def selected_route_from_scored_rows(image: Image.Image, scored_rows: Sequence[dict], hold_threshold: float) -> tuple[Image.Image, list[PredictedInstance], object | None]:
    instances = instances_from_scored_rows(image, scored_rows, hold_threshold)
    groups = group_instances_by_color(instances)
    selected = select_route_group(groups, instances)
    selected_mask = selected.mask if selected is not None else Image.new("L", image.size, 0)
    return selected_mask, instances, selected


def draw_overlay(image: Image.Image, mask: Image.Image, out: Path) -> None:
    overlay = image.convert("RGBA")
    color = Image.new("RGBA", image.size, (255, 80, 40, 120))
    alpha = mask.convert("L")
    overlay.alpha_composite(Image.composite(color, Image.new("RGBA", image.size, (0, 0, 0, 0)), alpha))
    out.parent.mkdir(parents=True, exist_ok=True)
    overlay.convert("RGB").save(out, quality=88)

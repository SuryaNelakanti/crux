from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from _common import (
    HslColor,
    binary_metrics,
    build_all_hold_mask,
    group_instances_by_color,
    load_manifest,
    make_predicted_instances,
    polygon_to_yolo_line,
    rasterize_polygons,
    select_route_group,
    stable_split,
)


class CommonPipelineTests(unittest.TestCase):
    def test_polygon_to_yolo_line_normalizes_points(self) -> None:
        line = polygon_to_yolo_line(
            [{"x": 10, "y": 20}, {"x": 30, "y": 20}, {"x": 30, "y": 40}],
            width=100,
            height=200,
        )
        self.assertEqual(line, "0 0.100000 0.100000 0.300000 0.100000 0.300000 0.200000")

    def test_binary_metrics_known_masks(self) -> None:
        predicted = Image.new("L", (3, 1), 0)
        predicted.putpixel((0, 0), 255)
        predicted.putpixel((1, 0), 255)
        truth = Image.new("L", (3, 1), 0)
        truth.putpixel((0, 0), 255)
        truth.putpixel((2, 0), 255)
        metrics = binary_metrics(predicted, truth)
        self.assertEqual(metrics["truePositive"], 1)
        self.assertEqual(metrics["falsePositive"], 1)
        self.assertEqual(metrics["falseNegative"], 1)
        self.assertAlmostEqual(metrics["iou"], 1 / 3)

    def test_grouping_and_seed_selection(self) -> None:
        image = Image.new("RGB", (12, 6), (110, 110, 110))
        red_mask = Image.new("L", image.size, 0)
        blue_mask = Image.new("L", image.size, 0)
        ImageDraw.Draw(red_mask).rectangle((1, 1, 3, 3), fill=255)
        ImageDraw.Draw(blue_mask).rectangle((8, 1, 10, 3), fill=255)
        draw = ImageDraw.Draw(image)
        draw.rectangle((1, 1, 3, 3), fill=(220, 40, 40))
        draw.rectangle((8, 1, 10, 3), fill=(40, 80, 220))

        instances = make_predicted_instances(image, [red_mask, blue_mask], [0.9, 0.9])
        groups = group_instances_by_color(instances)
        selected = select_route_group(groups, instances, seed=(9, 2))

        self.assertEqual(len(groups), 2)
        self.assertIsNotNone(selected)
        self.assertIn(1, selected.instance_ids)

    def test_default_selection_prefers_dominant_saturated_group(self) -> None:
        image = Image.new("RGB", (200, 200), (110, 110, 110))
        muted_mask = Image.new("L", image.size, 0)
        saturated_mask = Image.new("L", image.size, 0)
        ImageDraw.Draw(muted_mask).rectangle((2, 2, 20, 20), fill=255)
        ImageDraw.Draw(saturated_mask).rectangle((30, 10, 65, 45), fill=255)
        draw = ImageDraw.Draw(image)
        draw.rectangle((2, 2, 20, 20), fill=(95, 88, 80))
        draw.rectangle((30, 10, 65, 45), fill=(220, 45, 35))

        instances = make_predicted_instances(image, [muted_mask, saturated_mask], [0.99, 0.35])
        groups = group_instances_by_color(instances)
        selected = select_route_group(groups, instances)

        self.assertIsNotNone(selected)
        self.assertIn(1, selected.instance_ids)

    def test_default_selection_penalizes_wall_bright_saturated_area(self) -> None:
        image = Image.new("RGB", (200, 200), (110, 110, 110))
        wall_bright_mask = Image.new("L", image.size, 0)
        hold_mask = Image.new("L", image.size, 0)
        ImageDraw.Draw(wall_bright_mask).rectangle((5, 5, 95, 95), fill=255)
        ImageDraw.Draw(hold_mask).rectangle((110, 30, 170, 90), fill=255)
        draw = ImageDraw.Draw(image)
        draw.rectangle((5, 5, 95, 95), fill=(245, 225, 40))
        draw.rectangle((110, 30, 170, 90), fill=(185, 30, 20))

        instances = make_predicted_instances(image, [wall_bright_mask, hold_mask], [0.95, 0.7])
        groups = group_instances_by_color(instances)
        selected = select_route_group(groups, instances)

        self.assertIsNotNone(selected)
        self.assertIn(1, selected.instance_ids)

    def test_manifest_loading_and_small_split(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_path = root / "image.jpg"
            Image.new("RGB", (4, 4), (0, 0, 0)).save(image_path)
            manifest_path = root / "manifest.jsonl"
            manifest_path.write_text(
                (
                    '{"id":"a","imagePath":"image.jpg","width":4,"height":4,'
                    '"holds":[{"id":0,"polygon":[{"x":0,"y":0},{"x":2,"y":0},{"x":2,"y":2}],'
                    '"routeId":"r","routeLabel":"red"}],'
                    '"routes":[{"id":"r","label":"red","holdIds":[0]}]}\n'
                ),
                encoding="utf-8",
            )

            entries = load_manifest(manifest_path)
            split = stable_split(entries, train=0.8, val=0.1)

            self.assertEqual(entries[0].image_path, image_path.resolve())
            self.assertEqual(len(split["train"]), 1)

    def test_rasterize_and_union(self) -> None:
        mask = rasterize_polygons(
            4,
            4,
            [[{"x": 0, "y": 0}, {"x": 3, "y": 0}, {"x": 3, "y": 3}, {"x": 0, "y": 3}]],
        )
        union = build_all_hold_mask([mask], (4, 4))
        self.assertGreater(sum(1 for value in union.tobytes() if value > 0), 0)

    def test_hsl_color_type_is_plain_data(self) -> None:
        color = HslColor(h=10, s=20, l=30)
        self.assertEqual((color.h, color.s, color.l), (10, 20, 30))

    def test_check_pipeline_imports_without_common_helpers(self) -> None:
        script_path = Path(__file__).with_name("check-pipeline.py")
        source = script_path.read_text(encoding="utf-8")
        self.assertNotIn("from _common", source)

    def test_check_pipeline_validates_augmented_manifest(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("check-pipeline.py")
        spec = spec_from_file_location("check_pipeline", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            good = root / "good.jsonl"
            bad = root / "bad.jsonl"
            good.write_text(
                json.dumps({"id": "sam3_good", "split": "train", "labelSource": "reviewed-sam3"}) + "\n",
                encoding="utf-8",
            )
            bad.write_text(
                json.dumps({"id": "sam3_bad", "split": "test", "labelSource": "reviewed-sam3"}) + "\n",
                encoding="utf-8",
            )

            self.assertTrue(module.validate_augmented_manifest(good))
            self.assertFalse(module.validate_augmented_manifest(bad))
            self.assertIsNone(module.validate_augmented_manifest(None))

    def test_annotation_candidate_ids_match_manifest_ids(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("select-annotation-candidates.py")
        spec = spec_from_file_location("select_annotation_candidates", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        root = Path("heidelberg")
        self.assertEqual(module.raw_image_id(root / "bh" / "0689.jpg", root), "bh_0689")
        self.assertEqual(module.raw_image_id(root / "bh-phone" / "000.jpg", root), "bh-phone_000")

    def test_sam3_proposal_ids_match_annotator_ids(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("propose-sam3-labels.py")
        spec = spec_from_file_location("propose_sam3_labels", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        root = Path("heidelberg")
        self.assertEqual(module.raw_image_id(root / "bh" / "0689.jpg", root), "bh_0689")
        self.assertEqual(module.raw_image_id(root / "sm" / "wall-1.png", root), "sm_wall-1")

    def test_sam3_proposal_via_payload_is_review_only(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("propose-sam3-labels.py")
        spec = spec_from_file_location("propose_sam3_labels", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        payload = module.via_payload(
            [
                {
                    "relativePath": "bh/0689.jpg",
                    "prompt": "climbing hold",
                    "proposals": [
                        {
                            "confidence": 0.875,
                            "polygon": [{"x": 1, "y": 2}, {"x": 8, "y": 2}, {"x": 8, "y": 6}],
                        }
                    ],
                }
            ]
        )

        regions = payload["_via_img_metadata"]["bh/0689.jpg1"]["regions"]
        self.assertEqual(regions[0]["region_attributes"]["source"], "sam3-proposal")
        self.assertEqual(regions[0]["region_attributes"]["prompt"], "climbing hold")

    def test_sam3_contour_polygon_falls_back_to_bbox_shape(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("propose-sam3-labels.py")
        spec = spec_from_file_location("propose_sam3_labels", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        mask = Image.new("L", (10, 10), 0)
        ImageDraw.Draw(mask).rectangle((2, 3, 6, 7), fill=255)
        polygon = module.contour_polygon(mask)

        self.assertIsNotNone(polygon)
        self.assertGreaterEqual(len(polygon), 3)

    def test_reviewed_sam3_merge_adds_train_only_rows(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("merge-reviewed-proposals.py")
        spec = spec_from_file_location("merge_reviewed_proposals", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image = root / "raw.jpg"
            Image.new("RGB", (20, 12), (120, 120, 120)).save(image)
            reviewed = {
                "id": "raw",
                "imagePath": str(image),
                "proposals": [
                    {"polygon": [{"x": 1, "y": 1}, {"x": 8, "y": 1}, {"x": 8, "y": 6}], "source": "reviewed-sam3"}
                ],
            }

            merged = module.proposal_row(reviewed, image, 0)

        self.assertIsNotNone(merged)
        self.assertEqual(merged["split"], "train")
        self.assertEqual(merged["labelSource"], "reviewed-sam3")
        self.assertEqual(merged["routes"][0]["id"], "sam3_pseudo")

    def test_reviewed_sam3_merge_parses_via_rows(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("merge-reviewed-proposals.py")
        spec = spec_from_file_location("merge_reviewed_proposals", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "reviewed.via.json"
            path.write_text(
                json.dumps(
                    {
                        "_via_img_metadata": {
                            "bh/1.jpg1": {
                                "filename": "bh/1.jpg",
                                "regions": [
                                    {
                                        "shape_attributes": {
                                            "name": "polygon",
                                            "all_points_x": [1, 5, 5],
                                            "all_points_y": [2, 2, 6],
                                        }
                                    }
                                ],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            rows = module.load_reviewed_rows(path)

        self.assertEqual(rows[0]["relativePath"], "bh/1.jpg")
        self.assertEqual(len(rows[0]["proposals"]), 1)

    def test_reviewed_sam3_merge_assigns_stable_base_splits(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("merge-reviewed-proposals.py")
        spec = spec_from_file_location("merge_reviewed_proposals", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = root / "manifest.jsonl"
            rows = []
            for image_id in ["a", "b", "c", "d"]:
                rows.append(
                    {
                        "id": image_id,
                        "imagePath": f"{image_id}.jpg",
                        "width": 10,
                        "height": 10,
                        "holds": [],
                        "routes": [],
                    }
                )
            base.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            reviewed = root / "reviewed.json"
            reviewed.write_text("[]", encoding="utf-8")
            out = root / "augmented.jsonl"

            previous_argv = sys.argv
            sys.argv = [
                "merge-reviewed-proposals.py",
                "--base-manifest",
                str(base),
                "--reviewed",
                str(reviewed),
                "--out",
                str(out),
            ]
            try:
                module.run()
            finally:
                sys.argv = previous_argv

            split_counts = {}
            for line in out.read_text(encoding="utf-8").splitlines():
                row = json.loads(line)
                split_counts[row["split"]] = split_counts.get(row["split"], 0) + 1

        self.assertEqual(split_counts, {"train": 2, "val": 1, "test": 1})

    def test_prepare_yolo_tiles_can_preserve_manifest_splits(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("prepare-yolo-tiles.py")
        spec = spec_from_file_location("prepare_yolo_tiles", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        entries = [
            type("Entry", (), {"id": "manual-train", "split": "train"})(),
            type("Entry", (), {"id": "manual-val", "split": "val"})(),
            type("Entry", (), {"id": "manual-test", "split": "test"})(),
            type("Entry", (), {"id": "sam3-pseudo", "split": "train"})(),
        ]
        split = module.split_entries(entries, train=0.8, val=0.1, preserve=True)

        self.assertEqual([entry.id for entry in split["train"]], ["manual-train", "sam3-pseudo"])
        self.assertEqual([entry.id for entry in split["val"]], ["manual-val"])
        self.assertEqual([entry.id for entry in split["test"]], ["manual-test"])

    def test_prepare_yolo_dataset_can_preserve_manifest_splits(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("prepare-yolo-dataset.py")
        spec = spec_from_file_location("prepare_yolo_dataset", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        entries = [
            type("Entry", (), {"id": "manual-train", "split": "train"})(),
            type("Entry", (), {"id": "manual-val", "split": "val"})(),
            type("Entry", (), {"id": "sam3-pseudo", "split": "train"})(),
        ]
        split = module.split_entries(entries, train=0.8, val=0.1, preserve=True)

        self.assertEqual([entry.id for entry in split["train"]], ["manual-train", "sam3-pseudo"])
        self.assertEqual([entry.id for entry in split["val"]], ["manual-val"])
        self.assertEqual(split["test"], [])

    def test_augmented_manifest_validator_rejects_pseudo_val_rows(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("validate-augmented-manifest.py")
        spec = spec_from_file_location("validate_augmented_manifest", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            manifest = Path(tmp) / "manifest.jsonl"
            rows = [
                {
                    "id": "manual",
                    "split": "val",
                    "imagePath": "manual.jpg",
                    "width": 10,
                    "height": 10,
                    "holds": [],
                    "routes": [],
                },
                {
                    "id": "sam3_bad",
                    "split": "val",
                    "imagePath": "pseudo.jpg",
                    "width": 10,
                    "height": 10,
                    "labelSource": "reviewed-sam3",
                    "holds": [],
                    "routes": [],
                },
            ]
            manifest.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")

            result = module.validate(manifest)

        self.assertFalse(result["valid"])
        self.assertEqual(result["pseudoCounts"]["val"], 1)

    def test_augmented_manifest_validator_allows_train_pseudo_rows(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("validate-augmented-manifest.py")
        spec = spec_from_file_location("validate_augmented_manifest", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            manifest = Path(tmp) / "manifest.jsonl"
            row = {
                "id": "sam3_good",
                "split": "train",
                "imagePath": "pseudo.jpg",
                "width": 10,
                "height": 10,
                "holds": [{"id": 0, "labelSource": "reviewed-sam3", "polygon": []}],
                "routes": [],
            }
            manifest.write_text(json.dumps(row), encoding="utf-8")

            result = module.validate(manifest)

        self.assertTrue(result["valid"])
        self.assertEqual(result["pseudoCounts"]["train"], 1)

    def test_annotation_candidate_selection_round_robins_groups(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        script_path = Path(__file__).with_name("select-annotation-candidates.py")
        spec = spec_from_file_location("select_annotation_candidates", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        rows = [
            {"id": "a1", "group": "a", "score": 10.0, "histogram": [1.0, 0.0]},
            {"id": "a2", "group": "a", "score": 9.0, "histogram": [0.0, 1.0]},
            {"id": "b1", "group": "b", "score": 1.0, "histogram": [0.5, 0.5]},
        ]
        selected = module.select_diverse(rows, 3)

        self.assertEqual([row["id"] for row in selected], ["a1", "b1", "a2"])

    def test_heidelberg_annotator_supports_candidate_batches(self) -> None:
        annotator = Path(__file__).parents[1] / "vision" / "annotate-heidelberg.html"
        source = annotator.read_text(encoding="utf-8")

        self.assertIn('id="loadCandidates"', source)
        self.assertIn('id="candidateFile"', source)
        self.assertIn('id="candidateOnly"', source)
        self.assertIn("function imageId(image)", source)
        self.assertIn("async function loadCandidateFile(file)", source)
        self.assertIn("function proposalRowsFromVia(raw)", source)
        self.assertIn("function normalizeCandidateRows(raw)", source)
        self.assertIn("proposal drafts", source)

    def test_package_model_supports_directory_artifacts(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        package_path = Path(__file__).with_name("package-model.py")
        spec = spec_from_file_location("package_model", package_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            artifact = root / "best.mlpackage"
            artifact.mkdir()
            (artifact / "model.mlmodel").write_text("model", encoding="utf-8")

            self.assertEqual(module.artifact_size(artifact), 5)
            self.assertEqual(module.sha256_artifact(artifact), module.sha256_artifact(artifact))

    def test_validate_model_card_catches_offline_contract(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        validator_path = Path(__file__).with_name("validate-model-card.py")
        spec = spec_from_file_location("validate_model_card", validator_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model = root / "model.onnx"
            model.write_text("model", encoding="utf-8")
            card = {
                "schemaVersion": 1,
                "family": "yolo26-seg",
                "method": "ml-yolo26-seg",
                "files": {
                    "model": {
                        "path": model.name,
                        "sha256": module.sha256_artifact(model),
                        "bytes": module.artifact_size(model),
                        "artifactType": "file",
                    }
                },
                "metrics": {
                    "imageCount": 1,
                    "gates": {
                        "allHoldRecall": True,
                        "bestRouteGroupIou": True,
                        "autoRouteIou": True,
                        "p90RuntimeMs": True,
                    },
                },
                "integration": {
                    "offlineOnly": True,
                    "networkRequiredForInference": False,
                    "fallback": "@crux/vision deterministic generateRouteMask",
                    "storeModelHashWithMask": True,
                },
            }
            card_path = root / "model-card.json"
            card_path.write_text(json.dumps(card), encoding="utf-8")

            self.assertTrue(module.validate(card_path)["valid"])

    def test_validate_dataset_reports_manifest_quality(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        validator_path = Path(__file__).with_name("validate-dataset.py")
        spec = spec_from_file_location("validate_dataset", validator_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image = root / "wall.png"
            Image.new("RGB", (8, 8), (0, 0, 0)).save(image)
            manifest = root / "manifest.jsonl"
            manifest.write_text(
                json.dumps(
                    {
                        "id": "wall",
                        "imagePath": str(image),
                        "width": 8,
                        "height": 8,
                        "split": "train",
                        "holds": [
                            {
                                "id": 0,
                                "polygon": [{"x": 1, "y": 1}, {"x": 4, "y": 1}, {"x": 4, "y": 4}],
                                "routeId": "r",
                                "routeLabel": "red",
                            }
                        ],
                        "routes": [{"id": "r", "label": "red", "holdIds": [0]}],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = module.validate_manifest(
                manifest,
                min_images=1,
                min_holds=1,
                min_routes=1,
                require_splits=False,
            )

            self.assertTrue(result["valid"])
            self.assertEqual(result["holdCount"], 1)

    def test_tile_offsets_and_polygon_clipping_cover_edges(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        tile_path = Path(__file__).with_name("prepare-yolo-tiles.py")
        spec = spec_from_file_location("prepare_yolo_tiles", tile_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        self.assertEqual(module.tile_offsets(2800, 1536, 256), [0, 1264])
        clipped = module.clip_polygon_to_rect(
            [{"x": 900, "y": 900}, {"x": 1200, "y": 900}, {"x": 1200, "y": 1200}, {"x": 900, "y": 1200}],
            1024,
            1024,
            1536,
            1536,
        )

        self.assertGreaterEqual(len(clipped), 3)
        self.assertTrue(all(0 <= point["x"] <= 512 and 0 <= point["y"] <= 512 for point in clipped))


    def test_environment_report_contains_core_sections(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        report_path = Path(__file__).with_name("report-environment.py")
        spec = spec_from_file_location("report_environment", report_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        report = module.build_report()

        self.assertIn("python", report)
        self.assertIn("packages", report)
        self.assertIn("torch", report)

    def test_validate_export_accepts_coreml_directory_shape(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        validator_path = Path(__file__).with_name("validate-export.py")
        spec = spec_from_file_location("validate_export", validator_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            model = Path(tmp) / "best.mlpackage"
            model.mkdir()
            result = module.validate_artifact(model, "coreml")

            self.assertTrue(result["valid"])

    def test_training_profiles_are_named_and_single_class(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        train_path = Path(__file__).with_name("train-yolo-seg.py")
        spec = spec_from_file_location("train_yolo_seg", train_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        profile = module.training_profile("accuracy")

        self.assertTrue(profile["single_cls"])
        self.assertGreater(profile["copy_paste"], 0)
        self.assertGreater(profile["mosaic"], module.training_profile("speed")["mosaic"])

    def test_training_preflight_recommends_safe_model_for_six_gb_gpu(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        preflight_path = Path(__file__).with_name("preflight-training.py")
        spec = spec_from_file_location("preflight_training", preflight_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        commands = module.recommended_commands(6 * 1024**3)

        self.assertEqual(commands[0]["label"], "safeFirstRun")
        self.assertIn("yolo26m-seg.pt", commands[0]["command"])
        self.assertIn("yolo26x-seg.pt", commands[1]["command"])

    def test_ml_gallery_metric_and_path_helpers(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        gallery_path = Path(__file__).with_name("render-gallery.py")
        spec = spec_from_file_location("render_gallery", gallery_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        metrics_dir = Path("metrics").resolve()

        self.assertEqual(module.metric_value({"allHold": {"recall": 0.75}}, "allHoldRecall"), 0.75)
        self.assertEqual(module.resolve_path(metrics_dir, "masks/a.png"), metrics_dir / "masks" / "a.png")

    def test_full_pipeline_requires_training_confirmation(self) -> None:
        pipeline_path = Path(__file__).with_name("run-local-pipeline.py")
        source = pipeline_path.read_text(encoding="utf-8")

        self.assertIn("--confirm-training", source)
        self.assertIn("Refusing to start training without --confirm-training", source)

    def test_full_pipeline_skip_train_stops_after_preflight(self) -> None:
        pipeline_path = Path(__file__).with_name("run-local-pipeline.py")
        source = pipeline_path.read_text(encoding="utf-8")

        skip_train_branch = source[source.index("if args.skip_train:") : source.index("sweep_command = [")]

        self.assertIn("preflight-training.py", skip_train_branch)
        self.assertIn("training was not started", skip_train_branch)
        self.assertIn("return", skip_train_branch)

    def test_full_pipeline_writes_annotation_candidates_before_failed_gate_exit(self) -> None:
        pipeline_path = Path(__file__).with_name("run-local-pipeline.py")
        source = pipeline_path.read_text(encoding="utf-8")

        self.assertIn("--annotation-candidates", source)
        self.assertIn("write_annotation_candidates(root, raw_source, normalized, out, args.annotation_candidates)", source)
        self.assertIn("Refusing to package model because promotion gates failed", source)

    def test_full_pipeline_can_prepare_and_evaluate_tiled_runs(self) -> None:
        pipeline_path = Path(__file__).with_name("run-local-pipeline.py")
        sweep_path = Path(__file__).with_name("sweep-yolo-seg.py")
        pipeline_source = pipeline_path.read_text(encoding="utf-8")
        sweep_source = sweep_path.read_text(encoding="utf-8")

        self.assertIn("--tiled", pipeline_source)
        self.assertIn("prepare-yolo-tiles.py", pipeline_source)
        self.assertIn("--tiled-eval", pipeline_source)
        self.assertIn("evaluate-yolo-tiles.py", sweep_source)
        self.assertIn("--tile-size", sweep_source)

    def test_full_pipeline_supports_augmented_tiled_training_manifest(self) -> None:
        pipeline_path = Path(__file__).with_name("run-local-pipeline.py")
        source = pipeline_path.read_text(encoding="utf-8")

        self.assertIn("--augmented-manifest", source)
        self.assertIn("validate-augmented-manifest.py", source)
        self.assertIn("--preserve-splits", source)
        self.assertIn("eval_manifest = yolo / \"crux-manifest.jsonl\"", source)
        self.assertIn("--augmented-manifest\", str(augmented_manifest)", source)

    def test_inference_resolves_model_from_valid_model_card(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        infer_path = Path(__file__).with_name("infer-yolo-route.py")
        spec = spec_from_file_location("infer_yolo_route", infer_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        validator_path = Path(__file__).with_name("validate-model-card.py")
        validator_spec = spec_from_file_location("validate_model_card", validator_path)
        self.assertIsNotNone(validator_spec)
        self.assertIsNotNone(validator_spec.loader)
        validator = module_from_spec(validator_spec)
        validator_spec.loader.exec_module(validator)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model = root / "best.onnx"
            model.write_text("model", encoding="utf-8")
            card = {
                "schemaVersion": 1,
                "family": "yolo26-seg",
                "method": "ml-yolo26-seg",
                "input": {"imageSize": 96, "colorSpace": "RGB", "output": "masks"},
                "files": {
                    "model": {
                        "path": model.name,
                        "sha256": validator.sha256_artifact(model),
                        "bytes": validator.artifact_size(model),
                        "artifactType": "file",
                    }
                },
                "metrics": {
                    "imageCount": 1,
                    "gates": {
                        "allHoldRecall": True,
                        "bestRouteGroupIou": True,
                        "autoRouteIou": True,
                        "p90RuntimeMs": True,
                    },
                },
                "integration": {
                    "offlineOnly": True,
                    "networkRequiredForInference": False,
                    "fallback": "@crux/vision deterministic generateRouteMask",
                    "maskVersionMethod": "ml-yolo26-seg",
                    "storeModelHashWithMask": True,
                },
            }
            card_path = root / "model-card.json"
            card_path.write_text(json.dumps(card), encoding="utf-8")

            resolved_model, loaded_card = module.model_from_card(card_path)

            self.assertEqual(resolved_model, model.resolve())
            self.assertEqual(loaded_card["method"], card["method"])

    def test_inference_script_supports_tiled_mode(self) -> None:
        infer_path = Path(__file__).with_name("infer-yolo-route.py")
        source = infer_path.read_text(encoding="utf-8")

        self.assertIn("--tiled", source)
        self.assertIn("--tile-size", source)
        self.assertIn("--max-det", source)
        self.assertIn("--serial-tiles", source)
        self.assertIn("predict_tiled_masks", source)
        self.assertIn('"inferenceMode": "tiled" if args.tiled else "full-frame"', source)

    def test_tiled_eval_exposes_max_det_runtime_control(self) -> None:
        eval_path = Path(__file__).with_name("evaluate-yolo-tiles.py")
        sweep_path = Path(__file__).with_name("sweep-yolo-seg.py")
        runner_path = Path(__file__).with_name("run-local-pipeline.py")

        eval_source = eval_path.read_text(encoding="utf-8")
        sweep_source = sweep_path.read_text(encoding="utf-8")
        runner_source = runner_path.read_text(encoding="utf-8")

        self.assertIn("--max-det", eval_source)
        self.assertIn("max_det=args.max_det", eval_source)
        self.assertIn('"maxDet": args.max_det', eval_source)
        self.assertIn("--max-det", sweep_source)
        self.assertIn("--max-det", runner_source)


if __name__ == "__main__":
    unittest.main()

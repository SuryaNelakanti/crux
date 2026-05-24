from __future__ import annotations

import importlib.util
import json
import sys
import argparse
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Audit whether the local ML mask pipeline has the artifacts required for promotion.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--yolo-data", default=".data/vision/heidelberg-yolo/data.yaml")
    parser.add_argument("--checkpoint", default=".models/vision/yolo-hold-seg/heidelberg-yolo26x/weights/best.pt")
    parser.add_argument("--eval-summary", default="scripts/output/vision-ml/eval/summary.json")
    parser.add_argument("--exported-model", default=None)
    parser.add_argument("--model-card", default=".models/vision/crux-route-mask-model/model-card.json")
    parser.add_argument("--environment-report", default="scripts/output/vision-ml/environment.json")
    parser.add_argument("--augmented-manifest", default=None)
    parser.add_argument("--out", default="scripts/output/vision-ml/pipeline-audit.json")
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def import_available(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def read_eval_summary(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def validate_augmented_manifest(path: Path | None) -> bool | None:
    if path is None:
        return None
    if not path.exists():
        return False
    validator_path = Path(__file__).with_name("validate-augmented-manifest.py")
    spec = importlib.util.spec_from_file_location("validate_augmented_manifest", validator_path)
    if spec is None or spec.loader is None:
        return False
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return bool(module.validate(path)["valid"])


def run() -> None:
    args = parse_args()
    manifest = Path(args.manifest).resolve()
    yolo_data = Path(args.yolo_data).resolve()
    checkpoint = Path(args.checkpoint).resolve()
    eval_summary_path = Path(args.eval_summary).resolve()
    exported_model = Path(args.exported_model).resolve() if args.exported_model else None
    model_card = Path(args.model_card).resolve()
    environment_report = Path(args.environment_report).resolve()
    augmented_manifest = Path(args.augmented_manifest).resolve() if args.augmented_manifest else None
    eval_summary = read_eval_summary(eval_summary_path)
    eval_gates = eval_summary.get("gates", {}) if eval_summary else {}
    augmented_manifest_valid = validate_augmented_manifest(augmented_manifest)
    model_card_valid = False
    if model_card.exists():
        import importlib.util

        validator_path = Path(__file__).with_name("validate-model-card.py")
        spec = importlib.util.spec_from_file_location("validate_model_card", validator_path)
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            model_card_valid = bool(module.validate(model_card)["valid"])

    checks = {
        "dependencies": {
            "kaggle": import_available("kaggle"),
            "ultralytics": import_available("ultralytics"),
            "onnxruntime": import_available("onnxruntime"),
            "PIL": import_available("PIL"),
            "numpy": import_available("numpy"),
        },
        "artifacts": {
            "heidelbergManifest": manifest.exists(),
            "yoloDataYaml": yolo_data.exists(),
            "trainedCheckpoint": checkpoint.exists(),
            "evalSummary": eval_summary is not None,
            "exportedModel": exported_model.exists() if exported_model else False,
            "modelCard": model_card.exists(),
            "environmentReport": environment_report.exists(),
        },
        "promotionGates": {
            "hasImages": bool(eval_summary and int(eval_summary.get("imageCount", 0)) > 0),
            "allHoldRecall": bool(eval_gates.get("allHoldRecall")),
            "bestRouteGroupIou": bool(eval_gates.get("bestRouteGroupIou")),
            "autoRouteIou": bool(eval_gates.get("autoRouteIou")),
            "p90RuntimeMs": bool(eval_gates.get("p90RuntimeMs")),
        },
        "integrationPackage": {
            "modelCardValid": model_card_valid,
        },
        "augmentedData": {
            "notProvided": augmented_manifest is None,
            "manifestExists": augmented_manifest.exists() if augmented_manifest else None,
            "trainOnlyPseudoLabels": augmented_manifest_valid,
        },
    }
    augmented_ready = augmented_manifest_valid is not False
    ready = (
        all(checks["dependencies"].values())
        and all(checks["artifacts"].values())
        and all(checks["promotionGates"].values())
        and all(checks["integrationPackage"].values())
        and augmented_ready
    )
    audit = {
        "readyForIntegration": ready,
        "checks": checks,
        "paths": {
            "manifest": str(manifest),
            "yoloData": str(yolo_data),
            "checkpoint": str(checkpoint),
            "evalSummary": str(eval_summary_path),
            "exportedModel": str(exported_model) if exported_model else None,
            "modelCard": str(model_card),
            "environmentReport": str(environment_report),
            "augmentedManifest": str(augmented_manifest) if augmented_manifest else None,
        },
    }

    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(audit, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(audit, indent=2, sort_keys=True))

    if args.strict and not ready:
        sys.exit(1)


if __name__ == "__main__":
    run()

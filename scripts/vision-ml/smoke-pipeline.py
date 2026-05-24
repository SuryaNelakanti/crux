from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Run a deterministic local smoke test for the ML pipeline without Kaggle data.")
    parser.add_argument("--out", default="scripts/output/vision-ml/smoke")
    return parser.parse_args()


def run_command(command: list[str]) -> None:
    print(" ".join(command), flush=True)
    subprocess.run(command, check=True)


def run() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parent
    out = Path(args.out).resolve()
    fixture = out / "fixture"
    yolo = out / "yolo"
    package_root = out / "package"
    fake_model = out / "fake-best.onnx"
    fake_eval = out / "fake-eval-summary.json"

    run_command([sys.executable, str(root / "make-tiny-fixture.py"), "--out", str(fixture)])
    run_command(
        [
            sys.executable,
            str(root / "prepare-yolo-dataset.py"),
            "--manifest",
            str(fixture / "manifest.jsonl"),
            "--out",
            str(yolo),
        ]
    )

    data_yaml = yolo / "data.yaml"
    yolo_manifest = yolo / "crux-manifest.jsonl"
    if not data_yaml.exists() or not yolo_manifest.exists():
        raise FileNotFoundError("YOLO dataset conversion did not produce expected artifacts")

    fake_model.write_bytes(b"synthetic local route mask model")
    fake_eval.write_text(
        json.dumps(
            {
                "imageCount": 3,
                "allHold": {"iou": 0.91, "precision": 0.95, "recall": 0.94, "f1": 0.94},
                "componentRecall": 0.93,
                "bestRouteGroupIou": 0.82,
                "autoRouteIou": 0.72,
                "runtimeMs": {"p50": 12, "p90": 18},
                "gates": {
                    "allHoldRecall": True,
                    "bestRouteGroupIou": True,
                    "autoRouteIou": True,
                    "p90RuntimeMs": True,
                },
            },
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    run_command(
        [
            sys.executable,
            str(root / "package-model.py"),
            "--model",
            str(fake_model),
            "--eval-summary",
            str(fake_eval),
            "--dataset-manifest",
            str(yolo_manifest),
            "--out",
            str(package_root),
        ]
    )

    model_card = package_root / "model-card.json"
    if not model_card.exists():
        raise FileNotFoundError("Package smoke did not produce model-card.json")

    summary = {
        "fixtureManifest": str(fixture / "manifest.jsonl"),
        "yoloData": str(data_yaml),
        "yoloManifest": str(yolo_manifest),
        "modelCard": str(model_card),
    }
    (out / "smoke-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

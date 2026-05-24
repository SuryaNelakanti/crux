from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Run a tiny real YOLO train/eval/export/package smoke test on synthetic data.")
    parser.add_argument("--out", default="scripts/output/vision-ml/train-smoke")
    parser.add_argument("--model", default="yolo26n-seg.pt")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--imgsz", type=int, default=96)
    parser.add_argument("--device", default=None)
    parser.add_argument("--skip-train", action="store_true")
    return parser.parse_args()


def run_command(command: list[str]) -> None:
    print(" ".join(command), flush=True)
    subprocess.run(command, check=True)


def safe_name(model_name: str) -> str:
    return Path(model_name).stem.replace(".", "_")


def run() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parent
    out = Path(args.out).resolve()
    fixture = out / "fixture"
    yolo = out / "yolo"
    project = out / "runs"
    run_name = f"smoke-{safe_name(args.model)}"
    checkpoint = project / run_name / "weights" / "best.pt"
    eval_out = out / "eval"
    exported = checkpoint.with_suffix(".onnx")
    package_out = out / "package"

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
    run_command(
        [
            sys.executable,
            str(root / "validate-dataset.py"),
            "--manifest",
            str(yolo / "crux-manifest.jsonl"),
            "--min-images",
            "3",
            "--min-holds",
            "9",
            "--min-routes",
            "3",
            "--require-splits",
            "--strict",
        ]
    )

    if not args.skip_train:
        train_command = [
            sys.executable,
            str(root / "train-yolo-seg.py"),
            "--data",
            str(yolo / "data.yaml"),
            "--model",
            args.model,
            "--project",
            str(project),
            "--name",
            run_name,
            "--epochs",
            str(args.epochs),
            "--imgsz",
            str(args.imgsz),
            "--batch",
            "1",
            "--workers",
            "0",
            "--profile",
            "speed",
            "--patience",
            "1",
        ]
        if args.device is not None:
            train_command.extend(["--device", args.device])
        run_command(train_command)

    if not checkpoint.exists():
        raise FileNotFoundError(f"Smoke checkpoint not found: {checkpoint}")

    run_command(
        [
            sys.executable,
            str(root / "evaluate-yolo-seg.py"),
            "--model",
            str(checkpoint),
            "--manifest",
            str(yolo / "crux-manifest.jsonl"),
            "--split",
            "val",
            "--out",
            str(eval_out),
            "--imgsz",
            str(args.imgsz),
            "--conf",
            "0.05",
            "--iou",
            "0.5",
        ]
    )
    run_command(
        [
            sys.executable,
            str(root / "export-yolo-seg.py"),
            "--model",
            str(checkpoint),
            "--format",
            "onnx",
            "--imgsz",
            str(args.imgsz),
        ]
    )
    run_command(
        [
            sys.executable,
            str(root / "validate-export.py"),
            "--model",
            str(exported),
            "--format",
            "onnx",
            "--strict",
        ]
    )
    run_command(
        [
            sys.executable,
            str(root / "package-model.py"),
            "--model",
            str(exported),
            "--eval-summary",
            str(eval_out / "summary.json"),
            "--dataset-manifest",
            str(yolo / "crux-manifest.jsonl"),
            "--out",
            str(package_out),
            "--imgsz",
            str(args.imgsz),
            "--allow-failed-gates",
        ]
    )

    summary = {
        "checkpoint": str(checkpoint),
        "exported": str(exported),
        "evalSummary": str(eval_out / "summary.json"),
        "modelCard": str(package_out / "model-card.json"),
    }
    (out / "train-smoke-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

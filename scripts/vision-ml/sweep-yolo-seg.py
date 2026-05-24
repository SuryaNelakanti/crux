from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Train/evaluate multiple YOLO segmentation candidates and rank the best local route-mask model.")
    parser.add_argument("--data", default=".data/vision/heidelberg-yolo/data.yaml")
    parser.add_argument("--manifest", default=".data/vision/heidelberg-yolo/crux-manifest.jsonl")
    parser.add_argument("--project", default=".models/vision/yolo-hold-seg")
    parser.add_argument("--out", default="scripts/output/vision-ml/sweep")
    parser.add_argument("--models", nargs="+", default=["yolo26m-seg.pt", "yolo26l-seg.pt", "yolo26x-seg.pt"])
    parser.add_argument("--epochs", type=int, default=160)
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--batch", type=int, default=-1)
    parser.add_argument("--device", default=None)
    parser.add_argument("--profile", default="accuracy", choices=["accuracy", "balanced", "speed"])
    parser.add_argument("--split", default="val", choices=["train", "val", "test", "all"])
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.6)
    parser.add_argument("--tiled-eval", action="store_true")
    parser.add_argument("--tile-size", type=int, default=1536)
    parser.add_argument("--overlap", type=int, default=256)
    parser.add_argument("--max-det", type=int, default=300)
    parser.add_argument("--skip-train", action="store_true")
    parser.add_argument("--export-format", default=None, choices=["onnx", "torchscript", "coreml", "engine"])
    return parser.parse_args()


def safe_name(model_name: str) -> str:
    return Path(model_name).stem.replace(".", "_")


def run_command(command: list[str]) -> None:
    print(" ".join(command), flush=True)
    subprocess.run(command, check=True)


def score_summary(summary: dict) -> float:
    all_hold = summary.get("allHold", {})
    gates = summary.get("gates", {})
    gate_bonus = sum(1 for value in gates.values() if value) * 0.25
    return (
        float(summary.get("autoRouteIou", 0.0)) * 4.0
        + float(summary.get("bestRouteGroupIou", 0.0)) * 2.0
        + float(all_hold.get("recall", 0.0)) * 1.5
        + float(all_hold.get("precision", 0.0))
        + gate_bonus
        - float(summary.get("runtimeMs", {}).get("p90", 0.0)) / 5000
    )


def run() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parent
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    rankings = []

    for model_name in args.models:
        candidate = safe_name(model_name)
        run_name = f"heidelberg-{candidate}"
        checkpoint = Path(args.project).resolve() / run_name / "weights" / "best.pt"
        eval_out = out / candidate

        if not args.skip_train:
            train_command = [
                sys.executable,
                str(root / "train-yolo-seg.py"),
                "--data",
                args.data,
                "--model",
                model_name,
                "--project",
                args.project,
                "--name",
                run_name,
                "--epochs",
                str(args.epochs),
                "--imgsz",
                str(args.imgsz),
                "--batch",
                str(args.batch),
                "--profile",
                args.profile,
            ]
            if args.device is not None:
                train_command.extend(["--device", args.device])
            run_command(train_command)

        evaluator = "evaluate-yolo-tiles.py" if args.tiled_eval else "evaluate-yolo-seg.py"
        eval_command = [
            sys.executable,
            str(root / evaluator),
            "--model",
            str(checkpoint),
            "--manifest",
            args.manifest,
            "--split",
            args.split,
            "--out",
            str(eval_out),
            "--imgsz",
            str(args.imgsz),
            "--conf",
            str(args.conf),
            "--iou",
            str(args.iou),
        ]
        if args.tiled_eval:
            eval_command.extend(["--tile-size", str(args.tile_size), "--overlap", str(args.overlap)])
            eval_command.extend(["--max-det", str(args.max_det)])
            if args.batch > 0:
                eval_command.extend(["--batch", str(args.batch)])
        if args.device is not None:
            eval_command.extend(["--device", args.device])
        run_command(eval_command)

        summary = json.loads((eval_out / "summary.json").read_text(encoding="utf-8"))
        ranking = {
            "model": model_name,
            "runName": run_name,
            "checkpoint": str(checkpoint),
            "evalSummary": str(eval_out / "summary.json"),
            "score": score_summary(summary),
            "gates": summary.get("gates", {}),
            "allHold": summary.get("allHold", {}),
            "bestRouteGroupIou": summary.get("bestRouteGroupIou", 0.0),
            "autoRouteIou": summary.get("autoRouteIou", 0.0),
            "runtimeMs": summary.get("runtimeMs", {}),
        }
        rankings.append(ranking)

    rankings.sort(key=lambda item: item["score"], reverse=True)
    result = {
        "best": rankings[0] if rankings else None,
        "rankings": rankings,
        "selectionRule": (
            "score = autoRouteIou*4 + bestRouteGroupIou*2 + allHoldRecall*1.5 + "
            "allHoldPrecision + 0.25 per passed gate - p90RuntimeMs/5000"
        ),
    }
    (out / "ranking.json").write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")

    if args.export_format and rankings:
        best_checkpoint = rankings[0]["checkpoint"]
        export_command = [
            sys.executable,
            str(root / "export-yolo-seg.py"),
            "--model",
            best_checkpoint,
            "--format",
            args.export_format,
            "--imgsz",
            str(args.imgsz),
        ]
        if args.device is not None:
            export_command.extend(["--device", args.device])
        run_command(export_command)

    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

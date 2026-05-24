from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Tune YOLO inference confidence/NMS thresholds with Crux route-mask metrics.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--manifest", default=".data/vision/heidelberg-yolo/crux-manifest.jsonl")
    parser.add_argument("--out", default="scripts/output/vision-ml/threshold-tuning")
    parser.add_argument("--split", default="val", choices=["train", "val", "test", "all"])
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--confs", nargs="+", type=float, default=[0.15, 0.2, 0.25, 0.3, 0.4])
    parser.add_argument("--ious", nargs="+", type=float, default=[0.45, 0.55, 0.6, 0.7])
    parser.add_argument("--device", default=None)
    return parser.parse_args()


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


def run_command(command: list[str]) -> None:
    print(" ".join(command), flush=True)
    subprocess.run(command, check=True)


def format_threshold(value: float) -> str:
    return str(value).replace(".", "p")


def run() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parent
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    rankings = []

    for conf in args.confs:
        for iou in args.ious:
            eval_out = out / f"conf-{format_threshold(conf)}-iou-{format_threshold(iou)}"
            command = [
                sys.executable,
                str(root / "evaluate-yolo-seg.py"),
                "--model",
                args.model,
                "--manifest",
                args.manifest,
                "--split",
                args.split,
                "--out",
                str(eval_out),
                "--imgsz",
                str(args.imgsz),
                "--conf",
                str(conf),
                "--iou",
                str(iou),
            ]
            if args.device is not None:
                command.extend(["--device", args.device])
            run_command(command)

            summary = json.loads((eval_out / "summary.json").read_text(encoding="utf-8"))
            rankings.append(
                {
                    "conf": conf,
                    "iou": iou,
                    "evalSummary": str(eval_out / "summary.json"),
                    "score": score_summary(summary),
                    "gates": summary.get("gates", {}),
                    "allHold": summary.get("allHold", {}),
                    "componentRecall": summary.get("componentRecall", 0.0),
                    "bestRouteGroupIou": summary.get("bestRouteGroupIou", 0.0),
                    "autoRouteIou": summary.get("autoRouteIou", 0.0),
                    "runtimeMs": summary.get("runtimeMs", {}),
                }
            )

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
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

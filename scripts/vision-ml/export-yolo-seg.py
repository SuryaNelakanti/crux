from __future__ import annotations

import json
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Export a trained YOLO segmentation model for local inference.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--format", default="onnx", choices=["onnx", "torchscript", "coreml", "engine"])
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--device", default=None)
    parser.add_argument("--half", action="store_true")
    parser.add_argument("--int8", action="store_true")
    parser.add_argument("--dynamic", action="store_true")
    parser.add_argument("--out-summary", default=None)
    return parser.parse_args()


def run() -> None:
    args = parse_args()
    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise SystemExit(
            "Missing Python ML dependencies. Run: python -m pip install -r scripts/vision-ml/requirements.txt"
        ) from error

    model_path = Path(args.model).resolve()
    model = YOLO(str(model_path))
    exported_path = model.export(
        format=args.format,
        imgsz=args.imgsz,
        device=args.device,
        half=args.half,
        int8=args.int8,
        dynamic=args.dynamic,
        simplify=True,
    )
    summary = {
        "sourceModel": str(model_path),
        "format": args.format,
        "exportedPath": str(Path(exported_path).resolve()),
        "imgsz": args.imgsz,
        "half": args.half,
        "int8": args.int8,
        "dynamic": args.dynamic,
    }
    summary_path = Path(args.out_summary).resolve() if args.out_summary else model_path.parent / "crux-export-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

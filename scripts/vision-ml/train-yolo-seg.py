from __future__ import annotations

import json
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Fine-tune a local YOLO segmentation model for climbing hold masks.")
    parser.add_argument("--data", default=".data/vision/heidelberg-yolo/data.yaml")
    parser.add_argument("--model", default="yolo26x-seg.pt")
    parser.add_argument("--project", default=".models/vision/yolo-hold-seg")
    parser.add_argument("--name", default="heidelberg-yolo26x")
    parser.add_argument("--epochs", type=int, default=160)
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--batch", type=int, default=-1)
    parser.add_argument("--device", default=None)
    parser.add_argument("--patience", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--profile", default="accuracy", choices=["accuracy", "balanced", "speed"])
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


def training_profile(profile: str) -> dict:
    profiles = {
        "accuracy": {
            "close_mosaic": 25,
            "cos_lr": True,
            "degrees": 8.0,
            "translate": 0.08,
            "scale": 0.45,
            "shear": 1.5,
            "perspective": 0.0004,
            "fliplr": 0.5,
            "flipud": 0.0,
            "hsv_h": 0.025,
            "hsv_s": 0.45,
            "hsv_v": 0.35,
            "mosaic": 0.7,
            "mixup": 0.08,
            "copy_paste": 0.2,
            "erasing": 0.2,
            "optimizer": "auto",
            "single_cls": True,
        },
        "balanced": {
            "close_mosaic": 20,
            "cos_lr": True,
            "degrees": 5.0,
            "translate": 0.06,
            "scale": 0.35,
            "shear": 0.8,
            "perspective": 0.0002,
            "fliplr": 0.5,
            "flipud": 0.0,
            "hsv_h": 0.015,
            "hsv_s": 0.35,
            "hsv_v": 0.25,
            "mosaic": 0.5,
            "mixup": 0.03,
            "copy_paste": 0.1,
            "erasing": 0.1,
            "optimizer": "auto",
            "single_cls": True,
        },
        "speed": {
            "close_mosaic": 10,
            "cos_lr": True,
            "degrees": 3.0,
            "translate": 0.04,
            "scale": 0.25,
            "shear": 0.0,
            "perspective": 0.0,
            "fliplr": 0.5,
            "flipud": 0.0,
            "hsv_h": 0.01,
            "hsv_s": 0.25,
            "hsv_v": 0.2,
            "mosaic": 0.35,
            "mixup": 0.0,
            "copy_paste": 0.05,
            "erasing": 0.0,
            "optimizer": "auto",
            "single_cls": True,
        },
    }
    return profiles[profile]


def run() -> None:
    args = parse_args()
    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise SystemExit(
            "Missing Python ML dependencies. Run: python -m pip install -r scripts/vision-ml/requirements.txt"
        ) from error

    model = YOLO(args.model)
    profile = training_profile(args.profile)
    result = model.train(
        data=str(Path(args.data).resolve()),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(Path(args.project).resolve()),
        name=args.name,
        patience=args.patience,
        seed=args.seed,
        workers=args.workers,
        pretrained=True,
        amp=True,
        plots=True,
        save=True,
        resume=args.resume,
        **profile,
    )

    save_dir = Path(getattr(result, "save_dir", Path(args.project) / args.name)).resolve()
    summary = {
        "data": str(Path(args.data).resolve()),
        "baseModel": args.model,
        "saveDir": str(save_dir),
        "bestWeights": str(save_dir / "weights" / "best.pt"),
        "lastWeights": str(save_dir / "weights" / "last.pt"),
        "imgsz": args.imgsz,
        "epochs": args.epochs,
        "profile": args.profile,
        "trainingProfile": profile,
    }
    summary_path = save_dir / "crux-training-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

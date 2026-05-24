from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Run the local Crux route-mask ML pipeline end to end.")
    parser.add_argument("--raw-source", default=".data/raw/heidelberg")
    parser.add_argument("--normalized", default=".data/vision/heidelberg")
    parser.add_argument("--yolo", default=".data/vision/heidelberg-yolo")
    parser.add_argument("--yolo-tiles", default=".data/vision/heidelberg-yolo-tiles")
    parser.add_argument("--augmented-manifest", default=None)
    parser.add_argument("--augmented-yolo-tiles", default=".data/vision/heidelberg-sam3-yolo-tiles")
    parser.add_argument("--project", default=".models/vision/yolo-hold-seg")
    parser.add_argument("--out", default="scripts/output/vision-ml")
    parser.add_argument("--models", nargs="+", default=["yolo26m-seg.pt", "yolo26l-seg.pt", "yolo26x-seg.pt"])
    parser.add_argument("--epochs", type=int, default=160)
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--batch", type=int, default=-1)
    parser.add_argument("--device", default=None)
    parser.add_argument("--profile", default="accuracy", choices=["accuracy", "balanced", "speed"])
    parser.add_argument("--min-images", type=int, default=23)
    parser.add_argument("--min-holds", type=int, default=1887)
    parser.add_argument("--min-routes", type=int, default=400)
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--skip-train", action="store_true")
    parser.add_argument(
        "--confirm-training",
        action="store_true",
        help="Required before this script may start model training or candidate sweeps.",
    )
    parser.add_argument("--export-format", default="onnx", choices=["onnx", "torchscript", "coreml", "engine"])
    parser.add_argument("--tune-thresholds", action="store_true")
    parser.add_argument("--tiled", action="store_true")
    parser.add_argument("--train-tile-size", type=int, default=1024)
    parser.add_argument("--train-overlap", type=int, default=384)
    parser.add_argument("--tile-size", type=int, default=1536)
    parser.add_argument("--overlap", type=int, default=256)
    parser.add_argument("--max-det", type=int, default=300)
    parser.add_argument("--annotation-candidates", type=int, default=60)
    return parser.parse_args()


def run_command(command: list[str]) -> None:
    print(" ".join(command), flush=True)
    subprocess.run(command, check=True)


def command_path(name: str) -> str:
    resolved = shutil.which(name)
    if resolved:
        return resolved
    if sys.platform == "win32":
        resolved = shutil.which(f"{name}.cmd")
        if resolved:
            return resolved
    return name


def write_annotation_candidates(root: Path, raw_source: Path, normalized: Path, out: Path, limit: int) -> None:
    if limit <= 0:
        return
    run_command(
        [
            sys.executable,
            str(root / "select-annotation-candidates.py"),
            "--raw-source",
            str(raw_source),
            "--manifest",
            str(normalized / "manifest.jsonl"),
            "--out",
            str(out / "annotation-candidates"),
            "--limit",
            str(limit),
        ]
    )


def failed_gates(eval_summary: Path) -> list[str]:
    summary = json.loads(eval_summary.read_text(encoding="utf-8"))
    gates = summary.get("gates", {})
    return [name for name, passed in gates.items() if not passed]


def run() -> None:
    args = parse_args()
    if not args.skip_train and not args.confirm_training:
        raise SystemExit(
            "Refusing to start training without --confirm-training. "
            "Run scripts/vision-ml/preflight-training.py first, then rerun with --confirm-training "
            "only after explicit operator approval."
        )

    root = Path(__file__).resolve().parent
    repo = root.parent.parent
    raw_source = Path(args.raw_source).resolve()
    normalized = Path(args.normalized).resolve()
    yolo = Path(args.yolo).resolve()
    yolo_tiles = Path(args.yolo_tiles).resolve()
    augmented_manifest = Path(args.augmented_manifest).resolve() if args.augmented_manifest else None
    augmented_yolo_tiles = Path(args.augmented_yolo_tiles).resolve()
    out = Path(args.out).resolve()
    sweep_out = out / "sweep"

    run_command([sys.executable, str(root / "report-environment.py"), "--out", str(out / "environment.json")])

    if not args.skip_download:
        run_command([sys.executable, str(root / "download-heidelberg.py"), "--out", str(raw_source)])

    run_command(
        [
            command_path("pnpm"),
            "tsx",
            "scripts/vision/import-heidelberg.ts",
            "--source",
            str(raw_source),
            "--out",
            str(normalized),
        ]
    )
    run_command(
        [
            sys.executable,
            str(root / "validate-dataset.py"),
            "--manifest",
            str(normalized / "manifest.jsonl"),
            "--min-images",
            str(args.min_images),
            "--min-holds",
            str(args.min_holds),
            "--min-routes",
            str(args.min_routes),
            "--strict",
        ]
    )
    run_command(
        [
            sys.executable,
            str(root / "prepare-yolo-dataset.py"),
            "--manifest",
            str(normalized / "manifest.jsonl"),
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
            str(args.min_images),
            "--min-holds",
            str(args.min_holds),
            "--min-routes",
            str(args.min_routes),
            "--require-splits",
            "--strict",
        ]
    )
    train_data = yolo / "data.yaml"
    train_manifest = yolo / "crux-manifest.jsonl"
    eval_manifest = yolo / "crux-manifest.jsonl"
    augmented_training = augmented_manifest is not None
    if augmented_training:
        if not args.tiled:
            raise SystemExit("--augmented-manifest is supported for tiled training only. Add --tiled.")
        run_command(
            [
                sys.executable,
                str(root / "validate-augmented-manifest.py"),
                "--manifest",
                str(augmented_manifest),
                "--strict",
            ]
        )
    if args.tiled:
        tile_source_manifest = augmented_manifest if augmented_training else normalized / "manifest.jsonl"
        tile_out = augmented_yolo_tiles if augmented_training else yolo_tiles
        run_command(
            [
                sys.executable,
                str(root / "prepare-yolo-tiles.py"),
                "--manifest",
                str(tile_source_manifest),
                "--out",
                str(tile_out),
                "--tile-size",
                str(args.train_tile_size),
                "--overlap",
                str(args.train_overlap),
                *(["--preserve-splits"] if augmented_training else []),
            ]
        )
        run_command(
            [
                sys.executable,
                str(root / "validate-dataset.py"),
                "--manifest",
                str(tile_out / "crux-manifest.jsonl"),
                "--min-images",
                str(200),
                "--min-holds",
                str(args.min_holds),
                "--require-splits",
                "--strict",
                *(["--min-routes", str(args.min_routes)] if not augmented_training else []),
            ]
        )
        train_data = tile_out / "data.yaml"
        train_manifest = tile_out / "crux-manifest.jsonl"

    if args.skip_train:
        run_command(
            [
                sys.executable,
                str(root / "preflight-training.py"),
                "--data",
                str(train_data),
                "--manifest",
                str(train_manifest),
                "--out",
                str(out / "training-preflight.json"),
            ]
        )
        print(f"Pipeline prep complete in {repo}; training was not started.")
        return

    sweep_command = [
        sys.executable,
        str(root / "sweep-yolo-seg.py"),
        "--data",
        str(train_data),
        "--manifest",
        str(eval_manifest),
        "--project",
        args.project,
        "--out",
        str(sweep_out),
        "--models",
        *args.models,
        "--epochs",
        str(args.epochs),
        "--imgsz",
        str(args.imgsz),
        "--batch",
        str(args.batch),
        "--profile",
        args.profile,
        "--split",
        "val",
        "--export-format",
        args.export_format,
    ]
    if args.tiled:
        sweep_command.extend(["--tiled-eval", "--tile-size", str(args.tile_size), "--overlap", str(args.overlap)])
        sweep_command.extend(["--max-det", str(args.max_det)])
    if args.device is not None:
        sweep_command.extend(["--device", args.device])
    if args.skip_train:
        sweep_command.append("--skip-train")
    run_command(sweep_command)

    ranking = json.loads((sweep_out / "ranking.json").read_text(encoding="utf-8"))
    if not ranking.get("best"):
        raise FileNotFoundError(f"Sweep did not produce a best model in {sweep_out / 'ranking.json'}")
    best_checkpoint = Path(ranking["best"]["checkpoint"]).resolve()
    best_eval_summary = Path(ranking["best"]["evalSummary"]).resolve()
    exported = best_checkpoint.with_suffix(f".{args.export_format}")
    if args.export_format == "coreml":
        exported = best_checkpoint.with_suffix(".mlpackage")
    selected_eval_summary = best_eval_summary

    if args.tune_thresholds:
        tuning_out = out / "threshold-tuning"
        tune_command = [
            sys.executable,
            str(root / "tune-yolo-thresholds.py"),
            "--model",
            str(best_checkpoint),
            "--manifest",
            str(eval_manifest),
            "--split",
            "val",
            "--out",
            str(tuning_out),
            "--imgsz",
            str(args.imgsz),
        ]
        if args.device is not None:
            tune_command.extend(["--device", args.device])
        run_command(tune_command)
        tuning = json.loads((tuning_out / "ranking.json").read_text(encoding="utf-8"))
        if tuning.get("best"):
            selected_eval_summary = Path(tuning["best"]["evalSummary"]).resolve()

    failed = failed_gates(selected_eval_summary)
    if failed:
        write_annotation_candidates(root, raw_source, normalized, out, args.annotation_candidates)
        raise SystemExit(
            "Refusing to package model because promotion gates failed: "
            + ", ".join(failed)
            + f". Annotation candidates were written under {out / 'annotation-candidates'}."
        )

    if not exported.exists():
        run_command(
            [
                sys.executable,
                str(root / "export-yolo-seg.py"),
                "--model",
                str(best_checkpoint),
                "--format",
                args.export_format,
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
            args.export_format,
            "--strict",
            *(["--augmented-manifest", str(augmented_manifest)] if augmented_training else []),
        ]
    )

    run_command(
        [
            sys.executable,
            str(root / "package-model.py"),
            "--model",
            str(exported),
            "--eval-summary",
            str(selected_eval_summary),
            "--dataset-manifest",
            str(eval_manifest),
            "--out",
            ".models/vision/crux-route-mask-model",
            "--imgsz",
            str(args.imgsz),
        ]
    )
    run_command(
        [
            sys.executable,
            str(root / "check-pipeline.py"),
            "--manifest",
            str(normalized / "manifest.jsonl"),
            "--yolo-data",
            str(train_data),
            "--checkpoint",
            str(best_checkpoint),
            "--eval-summary",
            str(selected_eval_summary),
            "--exported-model",
            str(exported),
            "--environment-report",
            str(out / "environment.json"),
            "--strict",
        ]
    )

    print(f"Pipeline complete in {repo}")


if __name__ == "__main__":
    run()

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Package an evaluated local route-mask model with metadata for app integration.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--eval-summary", required=True)
    parser.add_argument("--dataset-manifest", default=".data/vision/heidelberg-yolo/crux-manifest.jsonl")
    parser.add_argument("--out", default=".models/vision/crux-route-mask-model")
    parser.add_argument("--family", default="yolo26-seg")
    parser.add_argument("--method", default="ml-yolo26-seg")
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--allow-failed-gates", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_artifact(path: Path) -> str:
    if path.is_file():
        return sha256(path)

    digest = hashlib.sha256()
    for child in sorted((item for item in path.rglob("*") if item.is_file()), key=lambda item: item.relative_to(path).as_posix()):
        digest.update(child.relative_to(path).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(sha256(child).encode("ascii"))
        digest.update(b"\0")
    return digest.hexdigest()


def artifact_size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def copy_artifact(source: Path, destination: Path) -> None:
    if source.is_dir():
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(source, destination)
    else:
        shutil.copy2(source, destination)


def require_file(path: Path, label: str) -> None:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"{label} not found: {path}")


def require_artifact(path: Path, label: str) -> None:
    if not path.exists() or not (path.is_file() or path.is_dir()):
        raise FileNotFoundError(f"{label} not found: {path}")


def run() -> None:
    args = parse_args()
    model_path = Path(args.model).resolve()
    eval_summary_path = Path(args.eval_summary).resolve()
    dataset_manifest_path = Path(args.dataset_manifest).resolve()
    require_artifact(model_path, "model")
    require_file(eval_summary_path, "evaluation summary")
    require_file(dataset_manifest_path, "dataset manifest")

    eval_summary = json.loads(eval_summary_path.read_text(encoding="utf-8"))
    gates = eval_summary.get("gates", {})
    failed = [name for name, passed in gates.items() if not passed]
    if failed and not args.allow_failed_gates:
        raise SystemExit(
            "Refusing to package model because promotion gates failed: "
            + ", ".join(failed)
            + ". Re-run with --allow-failed-gates only for local debugging artifacts."
        )

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    packaged_model = out / model_path.name
    copy_artifact(model_path, packaged_model)

    card = {
        "schemaVersion": 1,
        "family": args.family,
        "method": args.method,
        "input": {
            "imageSize": args.imgsz,
            "colorSpace": "RGB",
            "output": "hold instance masks grouped into route masks by median color",
        },
        "files": {
            "model": {
                "path": packaged_model.name,
                "sha256": sha256_artifact(packaged_model),
                "bytes": artifact_size(packaged_model),
                "artifactType": "directory" if packaged_model.is_dir() else "file",
            },
            "sourceModel": {
                "path": str(model_path),
                "sha256": sha256_artifact(model_path),
                "artifactType": "directory" if model_path.is_dir() else "file",
            },
            "datasetManifest": {
                "path": str(dataset_manifest_path),
                "sha256": sha256(dataset_manifest_path),
            },
            "evalSummary": {
                "path": str(eval_summary_path),
                "sha256": sha256(eval_summary_path),
            },
        },
        "metrics": {
            "imageCount": eval_summary.get("imageCount"),
            "allHold": eval_summary.get("allHold"),
            "componentRecall": eval_summary.get("componentRecall"),
            "bestRouteGroupIou": eval_summary.get("bestRouteGroupIou"),
            "autoRouteIou": eval_summary.get("autoRouteIou"),
            "runtimeMs": eval_summary.get("runtimeMs"),
            "postprocessMs": eval_summary.get("postprocessMs"),
            "endToEndMs": eval_summary.get("endToEndMs"),
            "gates": gates,
        },
        "inference": {
            "mode": "tiled" if eval_summary.get("tileSize") else "full-frame",
            "imageSize": eval_summary.get("imgsz", args.imgsz),
            "tileSize": eval_summary.get("tileSize"),
            "overlap": eval_summary.get("overlap"),
            "conf": eval_summary.get("conf"),
            "iou": eval_summary.get("iou"),
            "maxDet": eval_summary.get("maxDet"),
            "serialTiles": eval_summary.get("serialTiles", False),
        },
        "integration": {
            "offlineOnly": True,
            "fallback": "@crux/vision deterministic generateRouteMask",
            "maskVersionMethod": args.method,
            "storeModelHashWithMask": True,
            "networkRequiredForInference": False,
        },
    }
    card_path = out / "model-card.json"
    card_path.write_text(json.dumps(card, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"out": str(out), "modelCard": str(card_path), "model": str(packaged_model)}, indent=2))


if __name__ == "__main__":
    run()

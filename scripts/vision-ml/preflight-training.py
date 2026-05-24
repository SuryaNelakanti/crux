from __future__ import annotations

import json
import shutil
from pathlib import Path

from _common import build_parser, load_manifest


def parse_args():
    parser = build_parser("Check local ML training readiness without starting training.")
    parser.add_argument("--data", default=".data/vision/heidelberg-yolo/data.yaml")
    parser.add_argument("--manifest", default=".data/vision/heidelberg-yolo/crux-manifest.jsonl")
    parser.add_argument("--project", default=".models/vision/yolo-hold-seg")
    parser.add_argument("--name", default="heidelberg-yolo26x")
    parser.add_argument("--out", default="scripts/output/vision-ml/training-preflight.json")
    return parser.parse_args()


def torch_report() -> dict:
    try:
        import torch
    except ImportError:
        return {"available": False, "cudaAvailable": False, "devices": []}

    devices = []
    if torch.cuda.is_available():
        for index in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(index)
            devices.append(
                {
                    "index": index,
                    "name": props.name,
                    "totalMemoryBytes": int(props.total_memory),
                }
            )
    return {
        "available": True,
        "version": torch.__version__,
        "cudaAvailable": bool(torch.cuda.is_available()),
        "cudaVersion": torch.version.cuda,
        "deviceCount": len(devices),
        "devices": devices,
    }


def split_counts(manifest: Path) -> dict[str, int]:
    counts = {"train": 0, "val": 0, "test": 0, "all": 0}
    for entry in load_manifest(manifest):
        counts[entry.split] = counts.get(entry.split, 0) + 1
    return counts


def recommended_commands(gpu_bytes: int | None, data_path: str = ".data\\vision\\heidelberg-yolo\\data.yaml") -> list[dict[str, str]]:
    python = ".\\.venv-vision-ml\\Scripts\\python.exe"
    base = (
        f"{python} scripts\\vision-ml\\train-yolo-seg.py "
        f"--data {data_path} "
        "--epochs 160 --batch -1 --device 0"
    )
    if gpu_bytes is not None and gpu_bytes <= 7 * 1024**3:
        return [
            {
                "label": "safeFirstRun",
                "reason": "6 GB GPUs are more likely to finish with the medium model at 1024px.",
                "command": f"{base} --model yolo26m-seg.pt --name heidelberg-yolo26m --imgsz 1024 --profile accuracy",
            },
            {
                "label": "accuracyAttempt",
                "reason": "Try after the safe run if VRAM headroom is acceptable; reduce imgsz to 768 if it OOMs.",
                "command": f"{base} --model yolo26x-seg.pt --name heidelberg-yolo26x --imgsz 1024 --profile accuracy",
            },
        ]
    return [
        {
            "label": "accuracyRun",
            "reason": "GPU memory appears sufficient for the largest planned model.",
            "command": f"{base} --model yolo26x-seg.pt --name heidelberg-yolo26x --imgsz 1024 --profile accuracy",
        }
    ]


def run() -> None:
    args = parse_args()
    data = Path(args.data).resolve()
    manifest = Path(args.manifest).resolve()
    project = Path(args.project).resolve()
    run_dir = project / args.name
    issues = []
    warnings = []

    if not data.exists():
        issues.append(f"YOLO data file not found: {data}")
    if not manifest.exists():
        issues.append(f"YOLO manifest not found: {manifest}")

    counts = split_counts(manifest) if manifest.exists() else {}
    if counts and (counts.get("train", 0) == 0 or counts.get("val", 0) == 0):
        issues.append(f"train/val split is incomplete: {counts}")

    torch_info = torch_report()
    if not torch_info["available"]:
        issues.append("PyTorch is not installed in this environment")
    elif not torch_info["cudaAvailable"]:
        issues.append("PyTorch cannot access CUDA")

    gpu_bytes = None
    if torch_info.get("devices"):
        gpu_bytes = int(torch_info["devices"][0]["totalMemoryBytes"])
        if gpu_bytes <= 7 * 1024**3:
            warnings.append("Detected a 6-7 GB GPU; prefer the safe first run before yolo26x.")

    free_disk = shutil.disk_usage(project.parent if project.parent.exists() else Path.cwd()).free
    if free_disk < 8 * 1024**3:
        warnings.append("Less than 8 GB free disk space near the model output directory.")

    if run_dir.exists():
        warnings.append(f"Training output directory already exists: {run_dir}")

    report = {
        "readyForTrainingApproval": len(issues) == 0,
        "issues": issues,
        "warnings": warnings,
        "paths": {
            "data": str(data),
            "manifest": str(manifest),
            "project": str(project),
            "runDir": str(run_dir),
        },
        "splitCounts": counts,
        "torch": torch_info,
        "freeDiskBytes": free_disk,
        "recommendedCommands": recommended_commands(gpu_bytes, str(data)),
        "trainingStarted": False,
    }

    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

from __future__ import annotations

import importlib.metadata
import json
import os
import platform
import sys
from pathlib import Path

from _common import build_parser


PACKAGES = [
    "ultralytics",
    "torch",
    "torchvision",
    "onnx",
    "onnxslim",
    "onnxruntime",
    "numpy",
    "Pillow",
    "kaggle",
]


def parse_args():
    parser = build_parser("Write an environment report for local route-mask ML training/export runs.")
    parser.add_argument("--out", default="scripts/output/vision-ml/environment.json")
    return parser.parse_args()


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def torch_info() -> dict:
    try:
        import torch
    except ImportError:
        return {"available": False}

    cuda_available = bool(torch.cuda.is_available())
    devices = []
    if cuda_available:
        for index in range(torch.cuda.device_count()):
            properties = torch.cuda.get_device_properties(index)
            devices.append(
                {
                    "index": index,
                    "name": torch.cuda.get_device_name(index),
                    "totalMemoryBytes": properties.total_memory,
                    "major": properties.major,
                    "minor": properties.minor,
                }
            )
    return {
        "available": True,
        "version": getattr(torch, "__version__", None),
        "cudaAvailable": cuda_available,
        "cudaVersion": getattr(torch.version, "cuda", None),
        "deviceCount": len(devices),
        "devices": devices,
    }


def onnxruntime_info() -> dict:
    try:
        import onnxruntime
    except ImportError:
        return {"available": False}
    return {
        "available": True,
        "version": getattr(onnxruntime, "__version__", None),
        "providers": list(onnxruntime.get_available_providers()),
    }


def memory_info() -> dict:
    try:
        import psutil
    except ImportError:
        return {"available": False}
    memory = psutil.virtual_memory()
    return {
        "available": True,
        "totalBytes": memory.total,
        "availableBytes": memory.available,
    }


def build_report() -> dict:
    return {
        "python": {
            "version": sys.version,
            "executable": sys.executable,
        },
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
        },
        "cpu": {
            "count": os.cpu_count(),
        },
        "memory": memory_info(),
        "packages": {name: package_version(name) for name in PACKAGES},
        "torch": torch_info(),
        "onnxruntime": onnxruntime_info(),
    }


def run() -> None:
    args = parse_args()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    report = build_report()
    out.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

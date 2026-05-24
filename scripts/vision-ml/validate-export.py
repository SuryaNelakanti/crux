from __future__ import annotations

import json
import sys
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Validate an exported local route-mask model artifact.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--format", default="auto", choices=["auto", "onnx", "coreml", "torchscript", "engine"])
    parser.add_argument("--out", default=None)
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def detect_format(path: Path, requested: str) -> str:
    if requested != "auto":
        return requested
    suffix = path.suffix.lower()
    if suffix == ".onnx":
        return "onnx"
    if suffix == ".mlpackage":
        return "coreml"
    if suffix in {".torchscript", ".ts"}:
        return "torchscript"
    if suffix == ".engine":
        return "engine"
    return "unknown"


def validate_onnx(path: Path) -> dict:
    issues: list[str] = []
    inputs: list[dict] = []
    outputs: list[dict] = []
    providers: list[str] = []

    try:
        import onnx

        model = onnx.load(str(path))
        onnx.checker.check_model(model)
        for value in model.graph.input:
            inputs.append({"name": value.name, "type": str(value.type)})
        for value in model.graph.output:
            outputs.append({"name": value.name, "type": str(value.type)})
    except Exception as error:
        issues.append(f"onnx validation failed: {error}")

    try:
        import onnxruntime

        session = onnxruntime.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        providers = list(session.get_providers())
        if not session.get_inputs():
            issues.append("onnxruntime session has no inputs")
        if not session.get_outputs():
            issues.append("onnxruntime session has no outputs")
    except Exception as error:
        issues.append(f"onnxruntime validation failed: {error}")

    return {
        "inputs": inputs,
        "outputs": outputs,
        "providers": providers,
        "issues": issues,
    }


def validate_artifact(path: Path, format_name: str) -> dict:
    issues: list[str] = []
    if not path.exists():
        issues.append(f"model artifact not found: {path}")
        return {"valid": False, "format": format_name, "issues": issues}

    details: dict = {}
    if format_name == "onnx":
        if not path.is_file():
            issues.append("ONNX export must be a file")
        else:
            details = validate_onnx(path)
            issues.extend(details.get("issues", []))
    elif format_name == "coreml":
        if not path.is_dir():
            issues.append("CoreML export should be a .mlpackage directory")
    elif format_name in {"torchscript", "engine"}:
        if not path.is_file():
            issues.append(f"{format_name} export must be a file")
    else:
        issues.append(f"unsupported or unknown export format: {format_name}")

    return {
        "valid": len(issues) == 0,
        "format": format_name,
        "model": str(path),
        "issues": issues,
        "details": details,
    }


def run() -> None:
    args = parse_args()
    model_path = Path(args.model).resolve()
    result = validate_artifact(model_path, detect_format(model_path, args.format))
    if args.out:
        out = Path(args.out).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    if args.strict and not result["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    run()

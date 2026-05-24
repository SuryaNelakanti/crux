from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Validate a packaged Crux route-mask model card.")
    parser.add_argument("--model-card", default=".models/vision/crux-route-mask-model/model-card.json")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--out", default=None)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_artifact(path: Path) -> str:
    if path.is_file():
        return sha256_file(path)

    digest = hashlib.sha256()
    files = sorted((item for item in path.rglob("*") if item.is_file()), key=lambda item: item.relative_to(path).as_posix())
    for child in files:
        digest.update(child.relative_to(path).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(sha256_file(child).encode("ascii"))
        digest.update(b"\0")
    return digest.hexdigest()


def artifact_size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def resolve_packaged_model(model_card: Path, card: dict) -> Path:
    model_info = card.get("files", {}).get("model", {})
    model_path = model_info.get("path")
    if not isinstance(model_path, str) or not model_path:
        raise ValueError("files.model.path is required")
    return (model_card.parent / model_path).resolve()


def validate(model_card: Path) -> dict:
    issues: list[str] = []
    if not model_card.exists():
        return {
            "valid": False,
            "modelCard": str(model_card),
            "issues": [f"model card not found: {model_card}"],
        }

    card = json.loads(model_card.read_text(encoding="utf-8"))
    if card.get("schemaVersion") != 1:
        issues.append("schemaVersion must be 1")
    if not card.get("family"):
        issues.append("family is required")
    if not card.get("method"):
        issues.append("method is required")

    integration = card.get("integration", {})
    if integration.get("offlineOnly") is not True:
        issues.append("integration.offlineOnly must be true")
    if integration.get("networkRequiredForInference") is not False:
        issues.append("integration.networkRequiredForInference must be false")
    if not integration.get("fallback"):
        issues.append("integration.fallback is required")
    if integration.get("storeModelHashWithMask") is not True:
        issues.append("integration.storeModelHashWithMask must be true")

    metrics = card.get("metrics", {})
    gates = metrics.get("gates", {})
    required_gates = ["allHoldRecall", "bestRouteGroupIou", "autoRouteIou", "p90RuntimeMs"]
    for gate in required_gates:
        if gates.get(gate) is not True:
            issues.append(f"metrics.gates.{gate} must be true")
    if int(metrics.get("imageCount") or 0) <= 0:
        issues.append("metrics.imageCount must be positive")

    try:
        packaged_model = resolve_packaged_model(model_card, card)
    except ValueError as error:
        packaged_model = None
        issues.append(str(error))

    if packaged_model is not None:
        model_info = card.get("files", {}).get("model", {})
        if not packaged_model.exists():
            issues.append(f"packaged model not found: {packaged_model}")
        else:
            expected_type = "directory" if packaged_model.is_dir() else "file"
            if model_info.get("artifactType") != expected_type:
                issues.append(f"files.model.artifactType must be {expected_type}")
            if model_info.get("sha256") != sha256_artifact(packaged_model):
                issues.append("files.model.sha256 does not match packaged artifact")
            if int(model_info.get("bytes") or -1) != artifact_size(packaged_model):
                issues.append("files.model.bytes does not match packaged artifact")

    return {
        "valid": len(issues) == 0,
        "modelCard": str(model_card),
        "issues": issues,
    }


def run() -> None:
    args = parse_args()
    result = validate(Path(args.model_card).resolve())
    if args.out:
        out = Path(args.out).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    if args.strict and not result["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    run()

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Package a SAM+Crux combo route-mask model with a schemaVersion 2 model card.")
    parser.add_argument("--crux-heads", default=".models/vision/crux-combo-heads-v1/onnx/combo-heads.onnx")
    parser.add_argument("--sam-model", default=".models/vision/teachers/sam3.pt")
    parser.add_argument("--eval-summary", default="scripts/output/vision-ml/eval-combo-route/summary.json")
    parser.add_argument("--proposal-summary", default=".data/vision/heidelberg-sam3-combo-proposals/summary.json")
    parser.add_argument("--dataset-manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--out", default=".models/vision/crux-route-mask-combo-v1")
    parser.add_argument("--hold-threshold", type=float, default=0.5)
    parser.add_argument("--allow-failed-gates", action="store_true")
    parser.add_argument("--allow-missing-sam-artifact", action="store_true")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_size(path: Path) -> int:
    return path.stat().st_size


def artifact(path: Path, relative_path: str | None = None) -> dict:
    return {
        "path": relative_path or path.name,
        "sha256": sha256_file(path),
        "bytes": artifact_size(path),
        "artifactType": "file",
    }


def reference(path: Path) -> dict:
    return {"path": str(path), "sha256": sha256_file(path)}


def run() -> None:
    args = parse_args()
    crux_heads = Path(args.crux_heads).resolve()
    sam_model = Path(args.sam_model).resolve()
    eval_summary_path = Path(args.eval_summary).resolve()
    proposal_summary_path = Path(args.proposal_summary).resolve()
    dataset_manifest = Path(args.dataset_manifest).resolve()
    for label, path in [
        ("crux heads", crux_heads),
        ("evaluation summary", eval_summary_path),
        ("proposal summary", proposal_summary_path),
        ("dataset manifest", dataset_manifest),
    ]:
        if not path.is_file():
            raise FileNotFoundError(f"{label} not found: {path}")
    if not sam_model.is_file() and not args.allow_missing_sam_artifact:
        raise FileNotFoundError(f"SAM primitive not found: {sam_model}")

    eval_summary = json.loads(eval_summary_path.read_text(encoding="utf-8"))
    proposal_summary = json.loads(proposal_summary_path.read_text(encoding="utf-8"))
    gates = eval_summary.get("gates", {})
    failed = [name for name, passed in gates.items() if not passed]
    if failed and not args.allow_failed_gates:
        raise SystemExit(
            "Refusing to package combo model because promotion gates failed: "
            + ", ".join(failed)
            + ". Re-run with --allow-failed-gates only for local debugging artifacts."
        )

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    packaged_heads = out / "combo-heads.onnx"
    shutil.copy2(crux_heads, packaged_heads)
    files = {
        "cruxHeads": artifact(packaged_heads),
        "datasetManifest": reference(dataset_manifest),
        "evalSummary": reference(eval_summary_path),
        "proposalSummary": reference(proposal_summary_path),
    }
    if sam_model.is_file():
        files["samPrimitive"] = {
            **reference(sam_model),
            "bytes": artifact_size(sam_model),
            "artifactType": "file",
        }
    else:
        files["samPrimitive"] = {
            "path": str(sam_model),
            "sha256": None,
            "bytes": 0,
            "artifactType": "external-missing",
        }

    card = {
        "schemaVersion": 2,
        "family": "sam-crux-combo",
        "method": "ml-combo-v1",
        "segmentationPrimitive": {
            "family": "sam-family",
            "name": "sam3",
            "frozen": True,
            "prompt": "climbing hold",
        },
        "files": files,
        "thresholds": {"hold": args.hold_threshold},
        "metrics": {
            "imageCount": eval_summary.get("imageCount", 0),
            "proposalRecall": proposal_summary.get("proposalRecall"),
            "holdProposal": eval_summary.get("holdProposal"),
            "allHold": eval_summary.get("allHold"),
            "bestRouteGroupIou": eval_summary.get("bestRouteGroupIou"),
            "autoRouteIou": eval_summary.get("autoRouteIou"),
            "runtimeMs": eval_summary.get("runtimeMs"),
            "gates": gates,
        },
        "integration": {
            "offlineOnly": True,
            "fallbackPolicy": "none",
            "maskVersionMethod": "ml-combo-v1",
            "storeModelHashWithMask": True,
            "networkRequiredForInference": False,
        },
        "license": {
            "requiresReviewBeforeDistribution": True,
            "notes": "SAM primitive, Crux heads, and dataset terms must be reviewed before shipping weights.",
        },
    }
    card_path = out / "model-card.json"
    card_path.write_text(json.dumps(card, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"out": str(out), "modelCard": str(card_path)}, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()


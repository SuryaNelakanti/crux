from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from _common import build_parser, load_manifest
from combo_utils import (
    build_prompted_proposal_dataset_rows,
    build_proposal_dataset_rows,
    proposal_rows_from_json,
    write_proposal_dataset,
)


def parse_args():
    parser = build_parser("Build a SAM+Crux proposal training dataset from SAM-family mask proposals.")
    parser.add_argument("--manifest", default=".data/vision/heidelberg/manifest.jsonl")
    parser.add_argument("--sam-proposals", default=None, help="Existing proposals.json from propose-sam3-labels.py.")
    parser.add_argument("--raw-source", default=".data/raw/heidelberg")
    parser.add_argument("--model", default=".models/vision/teachers/sam3.pt")
    parser.add_argument("--text", default="climbing hold")
    parser.add_argument("--limit", type=int, default=120)
    parser.add_argument("--out", default=".data/vision/heidelberg-sam3-combo-proposals")
    parser.add_argument("--hold-iou", type=float, default=0.35)
    parser.add_argument("--ignore-iou", type=float, default=0.12)
    parser.add_argument(
        "--trust-prompt-labels",
        action="store_true",
        help="Use proposal manualHoldId/routeId fields directly for bbox-prompted SAM2 refinement outputs.",
    )
    parser.add_argument("--preview", action="store_true")
    return parser.parse_args()


def ensure_proposals(args) -> Path:
    if args.sam_proposals:
        path = Path(args.sam_proposals).resolve()
        if not path.exists():
            raise FileNotFoundError(f"SAM proposal file not found: {path}")
        return path

    out = Path(args.out).resolve() / "sam3-source"
    proposals = out / "proposals.json"
    if proposals.exists():
        return proposals

    model = Path(args.model).resolve()
    if not model.exists():
        raise FileNotFoundError(
            f"SAM3 checkpoint not found: {model}. Provide --sam-proposals or place the checkpoint before building."
        )
    command = [
        sys.executable,
        str(Path(__file__).with_name("propose-sam3-labels.py")),
        "--raw-source",
        str(Path(args.raw_source).resolve()),
        "--manifest",
        str(Path(args.manifest).resolve()),
        "--model",
        str(model),
        "--text",
        args.text,
        "--out",
        str(out),
        "--limit",
        str(args.limit),
    ]
    if args.preview:
        command.append("--preview")
    subprocess.run(command, check=True)
    return proposals


def run() -> None:
    args = parse_args()
    manifest = Path(args.manifest).resolve()
    entries = load_manifest(manifest)
    proposal_path = ensure_proposals(args)
    proposal_rows = proposal_rows_from_json(proposal_path)
    if args.trust_prompt_labels:
        rows, summary = build_prompted_proposal_dataset_rows(entries, proposal_rows)
    else:
        rows, summary = build_proposal_dataset_rows(
            entries,
            proposal_rows,
            hold_threshold=args.hold_iou,
            ignore_threshold=args.ignore_iou,
        )
    summary.update({"manifest": str(manifest), "proposalSource": str(proposal_path)})
    out = Path(args.out).resolve()
    write_proposal_dataset(out, rows, summary)
    print(json.dumps({"out": str(out), **summary}, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

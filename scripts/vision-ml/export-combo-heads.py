from __future__ import annotations

import json
from pathlib import Path

from _common import build_parser


def parse_args():
    parser = build_parser("Export trained SAM+Crux combo heads to ONNX.")
    parser.add_argument("--checkpoint", default=".models/vision/crux-combo-heads-v1/combo-heads.pt")
    parser.add_argument("--out", default=".models/vision/crux-combo-heads-v1/onnx")
    return parser.parse_args()


def run() -> None:
    args = parse_args()
    try:
        import torch

        from combo_torch import ComboHeads
    except ImportError as error:
        raise SystemExit("Missing Torch/ONNX export dependencies.") from error

    checkpoint_path = Path(args.checkpoint).resolve()
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    model = ComboHeads(
        int(checkpoint["inputDim"]),
        int(checkpoint["hiddenDim"]),
        int(checkpoint["embeddingDim"]),
    )
    model.load_state_dict(checkpoint["stateDict"])
    model.eval()

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    onnx_path = out / "combo-heads.onnx"
    dummy = torch.zeros(1, int(checkpoint["inputDim"]), dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        input_names=["features"],
        output_names=["scores", "embedding"],
        dynamic_axes={"features": {0: "proposal"}, "scores": {0: "proposal"}, "embedding": {0: "proposal"}},
        opset_version=17,
    )
    summary = {
        "checkpoint": str(checkpoint_path),
        "onnx": str(onnx_path),
        "inputDim": int(checkpoint["inputDim"]),
        "featureNames": checkpoint.get("featureNames", []),
    }
    (out / "export-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()


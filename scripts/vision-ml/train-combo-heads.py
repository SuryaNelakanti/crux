from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np

from _common import build_parser, read_jsonl
from combo_utils import PROPOSAL_FEATURE_NAMES, rows_by_split


def parse_args():
    parser = build_parser("Train Crux heads for the SAM+Crux combo route-mask model.")
    parser.add_argument("--proposal-rows", default=".data/vision/heidelberg-sam3-combo-proposals/proposals.jsonl")
    parser.add_argument("--out", default=".models/vision/crux-combo-heads-v1")
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--hidden-dim", type=int, default=64)
    parser.add_argument("--embedding-dim", type=int, default=8)
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--device", default=None)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--smoke", action="store_true", help="Run a short deterministic one-epoch smoke train.")
    return parser.parse_args()


def usable_rows(rows: list[dict], split: str) -> list[dict]:
    return [row for row in rows_by_split(rows, split) if float(row.get("trainWeight", 1.0)) > 0]


def features_and_targets(rows: list[dict]):
    x = np.asarray([row["features"] for row in rows], dtype=np.float32)
    y = np.asarray(
        [
            [
                float(row.get("isHold", 0)),
                float(row.get("isHold", 0)),
                float(max(0.0, min(1.0, row.get("matchedIou", 0.0)))),
            ]
            for row in rows
        ],
        dtype=np.float32,
    )
    route_ids = [str(row.get("matchedRouteId") or "") for row in rows]
    return x, y, route_ids


def batch_indices(total: int, batch_size: int) -> list[list[int]]:
    indices = list(range(total))
    random.shuffle(indices)
    return [indices[index : index + batch_size] for index in range(0, total, batch_size)]


def run() -> None:
    args = parse_args()
    try:
        import torch
        from torch import nn

        from combo_torch import ComboHeads, pairwise_embedding_loss
    except ImportError as error:
        raise SystemExit("Missing Torch. Install the CUDA ML deps documented in docs/vision-ml.md.") from error

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    rows = read_jsonl(Path(args.proposal_rows).resolve())
    train_rows = usable_rows(rows, "train")
    val_rows = usable_rows(rows, "val")
    if args.smoke:
        args.epochs = 1
        train_rows = train_rows[: min(16, len(train_rows))]
        val_rows = val_rows[: min(16, len(val_rows))]
    if not train_rows:
        raise ValueError("No train proposal rows available")

    train_x, train_y, train_routes = features_and_targets(train_rows)
    val_x, val_y, _ = features_and_targets(val_rows) if val_rows else (np.zeros((0, train_x.shape[1]), dtype=np.float32), np.zeros((0, 3), dtype=np.float32), [])
    device = torch.device(args.device or ("cuda" if torch.cuda.is_available() else "cpu"))
    model = ComboHeads(train_x.shape[1], args.hidden_dim, args.embedding_dim).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    score_loss = nn.BCELoss()

    history = []
    train_features = torch.from_numpy(train_x).to(device)
    train_targets = torch.from_numpy(train_y).to(device)
    val_features = torch.from_numpy(val_x).to(device)
    val_targets = torch.from_numpy(val_y).to(device)

    for epoch in range(args.epochs):
        model.train()
        losses = []
        for batch in batch_indices(len(train_rows), args.batch_size):
            index = torch.tensor(batch, dtype=torch.long, device=device)
            scores, embeddings = model(train_features[index])
            target = train_targets[index]
            is_hold = target[:, 0]
            routes = [train_routes[item] for item in batch]
            loss = score_loss(scores, target) + 0.12 * pairwise_embedding_loss(embeddings, routes, is_hold)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        model.eval()
        with torch.no_grad():
            val_loss = None
            if len(val_rows) > 0:
                val_scores, _ = model(val_features)
                val_loss = float(score_loss(val_scores, val_targets).detach().cpu())
        history.append({"epoch": epoch + 1, "trainLoss": sum(losses) / max(1, len(losses)), "valLoss": val_loss})

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    checkpoint = out / "combo-heads.pt"
    torch.save(
        {
            "stateDict": model.state_dict(),
            "inputDim": train_x.shape[1],
            "hiddenDim": args.hidden_dim,
            "embeddingDim": args.embedding_dim,
            "featureNames": PROPOSAL_FEATURE_NAMES,
        },
        checkpoint,
    )
    summary = {
        "checkpoint": str(checkpoint),
        "proposalRows": str(Path(args.proposal_rows).resolve()),
        "device": str(device),
        "epochs": args.epochs,
        "trainRows": len(train_rows),
        "valRows": len(val_rows),
        "featureNames": PROPOSAL_FEATURE_NAMES,
        "history": history,
    }
    (out / "training-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()


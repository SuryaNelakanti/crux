from __future__ import annotations

import torch
from torch import nn


class ComboHeads(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int = 64, embedding_dim: int = 8):
        super().__init__()
        self.backbone = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.08),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
        )
        self.scores = nn.Linear(hidden_dim, 3)
        self.embedding = nn.Linear(hidden_dim, embedding_dim)

    def forward(self, features):
        hidden = self.backbone(features)
        scores = torch.sigmoid(self.scores(hidden))
        embedding = nn.functional.normalize(self.embedding(hidden), dim=-1)
        return scores, embedding


def pairwise_embedding_loss(embeddings, route_ids, is_hold):
    hold_indices = torch.nonzero(is_hold > 0.5, as_tuple=False).flatten()
    if hold_indices.numel() < 2:
        return embeddings.sum() * 0
    selected = embeddings[hold_indices]
    selected_routes = [route_ids[int(index)] for index in hold_indices.detach().cpu().tolist()]
    losses = []
    for left in range(len(selected_routes)):
        for right in range(left + 1, len(selected_routes)):
            sim = torch.sum(selected[left] * selected[right])
            same = selected_routes[left] and selected_routes[left] == selected_routes[right]
            target = torch.tensor(1.0 if same else -1.0, device=embeddings.device)
            losses.append((sim - target).pow(2))
    if not losses:
        return embeddings.sum() * 0
    return torch.stack(losses).mean()


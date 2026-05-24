from __future__ import annotations

import html
import json
from pathlib import Path

from PIL import Image

from _common import build_parser


def parse_args():
    parser = build_parser("Render an HTML visual QA gallery from ML evaluation metrics.")
    parser.add_argument("--metrics", default="scripts/output/vision-ml/eval/metrics.jsonl")
    parser.add_argument("--out", default="scripts/output/vision-ml/eval-gallery")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--sort", default="autoRouteIou", choices=["autoRouteIou", "bestRouteGroupIou", "allHoldRecall"])
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def metric_value(row: dict, key: str) -> float:
    if key == "allHoldRecall":
        return float(row.get("allHold", {}).get("recall", 0.0))
    return float(row.get(key, 0.0))


def resolve_path(metrics_dir: Path, path_value: str) -> Path:
    path = Path(path_value)
    return path if path.is_absolute() else (metrics_dir / path).resolve()


def overlay_mask(image_path: Path, mask_path: Path, out_path: Path, color: tuple[int, int, int, int]) -> None:
    image = Image.open(image_path).convert("RGBA")
    mask = Image.open(mask_path).convert("L")
    if mask.size != image.size:
        mask = mask.resize(image.size, Image.Resampling.NEAREST)

    overlay = Image.new("RGBA", image.size, color)
    alpha = mask.point(lambda value: color[3] if value else 0)
    overlay.putalpha(alpha)
    composed = Image.alpha_composite(image, overlay).convert("RGB")
    composed.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    composed.save(out_path, quality=88)


def pct(value: float) -> str:
    return f"{round(value * 100)}%"


def card_html(row: dict, holds_file: str, selected_file: str) -> str:
    all_hold = row.get("allHold", {})
    return f"""
      <article class="card">
        <h2>{html.escape(str(row.get("id", "")))}</h2>
        <div class="grid">
          <figure><img src="{html.escape(holds_file)}" alt="All predicted holds"><figcaption>All predicted holds</figcaption></figure>
          <figure><img src="{html.escape(selected_file)}" alt="Auto-selected route"><figcaption>Auto-selected route</figcaption></figure>
        </div>
        <p>
          Auto IoU {pct(float(row.get("autoRouteIou", 0.0)))} ·
          Best IoU {pct(float(row.get("bestRouteGroupIou", 0.0)))} ·
          Hold recall {pct(float(all_hold.get("recall", 0.0)))} ·
          Instances {int(row.get("instanceCount", 0))} ·
          {round(float(row.get("runtimeMs", 0.0)))}ms
        </p>
      </article>
    """


def run() -> None:
    args = parse_args()
    metrics_path = Path(args.metrics).resolve()
    metrics_dir = metrics_path.parent
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    rows = sorted(read_jsonl(metrics_path), key=lambda row: metric_value(row, args.sort))[: args.limit]
    cards = []
    for row in rows:
        row_id = str(row["id"])
        image_path = Path(row["imagePath"]).resolve()
        holds_path = resolve_path(metrics_dir, row["predictedHoldsMaskPath"])
        selected_path = resolve_path(metrics_dir, row["selectedMaskPath"])
        holds_file = f"{row_id}-holds.jpg"
        selected_file = f"{row_id}-selected.jpg"
        overlay_mask(image_path, holds_path, out / holds_file, (255, 230, 120, 165))
        overlay_mask(image_path, selected_path, out / selected_file, (56, 191, 156, 190))
        cards.append(card_html(row, holds_file, selected_file))

    page = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Crux Vision ML Gallery</title>
  <style>
    body {{ margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #101114; color: #f5f7fb; }}
    h1 {{ margin: 0 0 18px; }}
    .card {{ margin: 0 0 28px; padding: 16px; background: #17191f; border: 1px solid #2b2f39; border-radius: 8px; }}
    .card h2 {{ margin: 0 0 12px; font-size: 16px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }}
    figure {{ margin: 0; }}
    img {{ width: 100%; height: auto; display: block; border-radius: 6px; }}
    figcaption, p {{ color: #b8bfca; font-size: 13px; }}
  </style>
</head>
<body>
  <h1>Crux Vision ML Gallery</h1>
  {''.join(cards)}
</body>
</html>"""
    index = out / "index.html"
    index.write_text(page, encoding="utf-8")
    print(f"Gallery: {index}")


if __name__ == "__main__":
    run()

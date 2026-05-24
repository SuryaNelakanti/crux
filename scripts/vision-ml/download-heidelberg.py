from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

from _common import build_parser


DATASET = "tomasslama/indoor-climbing-gym-hold-segmentation"


def parse_args():
    parser = build_parser("Download the Heidelberg/Kaggle climbing hold segmentation dataset with Kaggle credentials.")
    parser.add_argument("--out", default=".data/raw/heidelberg")
    parser.add_argument("--keep-zip", action="store_true")
    return parser.parse_args()


def run() -> None:
    args = parse_args()
    try:
        import kaggle
    except ImportError as error:
        raise SystemExit(
            "Missing Kaggle dependency. Run: python -m pip install -r scripts/vision-ml/requirements.txt"
        ) from error

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    zip_path = out / "indoor-climbing-gym-hold-segmentation.zip"

    api = kaggle.api
    api.authenticate()
    api.dataset_download_files(DATASET, path=str(out), unzip=False, quiet=False)

    downloaded = next(out.glob("*.zip"), None)
    if downloaded is None:
        raise FileNotFoundError(f"Kaggle did not produce a zip in {out}")
    if downloaded != zip_path:
        downloaded.replace(zip_path)

    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(out)

    if not args.keep_zip:
        zip_path.unlink(missing_ok=True)

    summary = {
        "dataset": DATASET,
        "out": str(out),
        "files": sum(1 for item in out.rglob("*") if item.is_file()),
        "zipKept": args.keep_zip,
    }
    (out / "download-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    run()

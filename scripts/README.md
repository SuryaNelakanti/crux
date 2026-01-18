# Mask Debug Scripts

Quick helpers for inspecting the mask pipeline on local images.

## Setup
- Install dev deps once: `pnpm add -D sharp tsx -w`

## Run
```
pnpm tsx scripts/mask-debug.ts --image "C:\\Users\\ASUS\\Downloads\\bouldering+volta.webp" --seed-x 420 --seed-y 310 --max-width 1200
```
Or use normalized coords (0..1):
```
pnpm tsx scripts/mask-debug.ts --image "C:\\Users\\ASUS\\Downloads\\bouldering+volta.webp" --seed-nx 0.42 --seed-ny 0.31 --max-width 1200
```

Outputs:
- `scripts/output/mask.png` (tinted mask)
- `scripts/output/overlay.png` (mask composited over the source)
- `scripts/output/report.json` (coverage, confidence, clusters)

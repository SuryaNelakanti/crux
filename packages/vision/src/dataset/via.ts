import type { Polygon } from '../benchmark';

export interface ViaRegion {
  filename: string;
  polygon: Polygon;
  attributes: Record<string, unknown>;
}

export interface ViaImageAnnotation {
  filename: string;
  regions: ViaRegion[];
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumberArray = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;
  const numbers = value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  return numbers.length === value.length ? numbers : null;
};

const parsePolygon = (shape: UnknownRecord): Polygon | null => {
  const allX = toNumberArray(shape.all_points_x);
  const allY = toNumberArray(shape.all_points_y);
  if (allX && allY && allX.length === allY.length && allX.length >= 3) {
    return allX.map((x, index) => ({ x, y: allY[index] }));
  }

  const x = toNumberArray(shape.x);
  const y = toNumberArray(shape.y);
  if (x && y && x.length === y.length && x.length >= 3) {
    return x.map((pointX, index) => ({ x: pointX, y: y[index] }));
  }

  return null;
};

const parseV2Image = (entry: UnknownRecord): ViaImageAnnotation | null => {
  const filename = typeof entry.filename === 'string' ? entry.filename : null;
  const regionsRaw = Array.isArray(entry.regions)
    ? entry.regions
    : isRecord(entry.regions)
      ? Object.values(entry.regions)
      : [];
  if (!filename) return null;

  const regions: ViaRegion[] = [];
  for (const regionRaw of regionsRaw) {
    if (!isRecord(regionRaw)) continue;
    const shape = isRecord(regionRaw.shape_attributes) ? regionRaw.shape_attributes : null;
    if (!shape) continue;
    const polygon = parsePolygon(shape);
    if (!polygon) continue;
    const attributes = isRecord(regionRaw.region_attributes) ? regionRaw.region_attributes : {};
    regions.push({ filename, polygon, attributes });
  }

  return { filename, regions };
};

const parseV3 = (raw: UnknownRecord): ViaImageAnnotation[] => {
  const files = isRecord(raw.file) ? raw.file : {};
  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  const filenameById = new Map<string, string>();

  for (const [id, fileRaw] of Object.entries(files)) {
    if (!isRecord(fileRaw)) continue;
    const filename =
      typeof fileRaw.fname === 'string'
        ? fileRaw.fname
        : typeof fileRaw.filename === 'string'
          ? fileRaw.filename
          : null;
    if (filename) filenameById.set(id, filename);
  }

  const grouped = new Map<string, ViaRegion[]>();
  for (const regionRaw of Object.values(metadata)) {
    if (!isRecord(regionRaw)) continue;
    const fileId = typeof regionRaw.vid === 'string' ? regionRaw.vid : null;
    const filename = fileId ? filenameById.get(fileId) : null;
    const xy = Array.isArray(regionRaw.xy) ? regionRaw.xy : null;
    if (!filename || !xy || xy[0] !== 7) continue;

    const allX = toNumberArray(xy[1]);
    const allY = toNumberArray(xy[2]);
    if (!allX || !allY || allX.length !== allY.length || allX.length < 3) continue;
    const polygon = allX.map((x, index) => ({ x, y: allY[index] }));
    const attributes = isRecord(regionRaw.av) ? regionRaw.av : {};
    const regions = grouped.get(filename) ?? [];
    regions.push({ filename, polygon, attributes });
    grouped.set(filename, regions);
  }

  return [...grouped.entries()].map(([filename, regions]) => ({ filename, regions }));
};

export function parseViaAnnotations(raw: unknown): ViaImageAnnotation[] {
  if (!isRecord(raw)) return [];

  if (isRecord(raw._via_img_metadata)) {
    return Object.values(raw._via_img_metadata)
      .map((entry) => (isRecord(entry) ? parseV2Image(entry) : null))
      .filter((entry): entry is ViaImageAnnotation => entry !== null);
  }

  if (isRecord(raw.file) && isRecord(raw.metadata)) {
    return parseV3(raw);
  }

  return Object.values(raw)
    .map((entry) => (isRecord(entry) ? parseV2Image(entry) : null))
    .filter((entry): entry is ViaImageAnnotation => entry !== null);
}

export function getRouteLabel(attributes: Record<string, unknown>): string | null {
  const preferredKeys = [
    'route',
    'route_id',
    'routeId',
    'color',
    'colour',
    'hold_color',
    'holdColor',
    'label',
    'class',
    'name',
  ];
  for (const key of preferredKeys) {
    const value = attributes[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

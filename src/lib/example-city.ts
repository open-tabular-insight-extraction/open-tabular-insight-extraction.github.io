/*
  City model for the running example (the paper's NO2 public-health officer — see landing
  page beats 2 and 3). Unlike the first draft of this file, this is real authored data, not
  a generated placeholder: borough outlines, the road network, and sensor readings are
  hand-built by Daniel and live in ../../data/example_city/*.json, on a fixed grid of
  0 <= x <= 120, 0 <= y <= 90.

  This module's job is just projection and derived metrics:
  - `project()` maps the data grid into the SVG viewBox (VIEW_W x VIEW_H) once, with
    padding, so every consumer works in the same view space and CSS constants (stroke
    widths, font sizes, dot radii) tuned for that viewBox don't need to change.
  - Table previews (sensorTablePreview, boundaryTablePreview, roadTablePreview) show the
    *raw* grid coordinates, since those are what a real sensor/boundary/road table would
    carry — the projection is a rendering detail, not part of the data.
  - Borough membership (boroughOf) is computed geometrically from raw coordinates rather
    than trusting the sensor records' own `_borough` field — that's present in the source
    JSON as an authoring/QA helper, not part of the raw sensor table the example's
    narrative is built around (the whole point of beat 2 is that the sensor table has no
    borough column and has to be joined to boundaries to get one). Road allocation
    (roadMetrics) is different: it reads each sensor's `_street` field directly, since
    which road a sensor was placed to monitor is exactly the ground truth that placement
    field records, not something a distance-to-polyline heuristic should be re-deriving.
*/

import boroughsData from '../../data/example_city/boroughs.json';
import roadsData from '../../data/example_city/roads.json';
import sensorsData from '../../data/example_city/sensors.json';
import populationData from '../../data/example_city/population.json';

const DATA_W = 120;
const DATA_H = 90;
const PADDING = 24;

// The city is scaled up ~40% from a plain "fit a 400x260 box" size — the viewBox is sized
// to the content (at this scale, with fixed padding) rather than the other way around, so
// there's no wasted margin and nothing gets clipped.
const ZOOM = 1.4;
const SCALE = Math.min((400 - PADDING * 2) / DATA_W, (260 - PADDING * 2) / DATA_H) * ZOOM;
const CONTENT_W = DATA_W * SCALE;
const CONTENT_H = DATA_H * SCALE;
const OFFSET_X = PADDING;
const OFFSET_Y = PADDING;

export const VIEW_W = CONTENT_W + PADDING * 2;
export const VIEW_H = CONTENT_H + PADDING * 2;

export interface Point {
  x: number;
  y: number;
}

// The data grid's y-axis increases upward (authored as plain Cartesian coordinates); SVG's
// increases downward, so it has to be flipped or the whole city renders upside down.
function project(p: Point): Point {
  return { x: OFFSET_X + p.x * SCALE, y: OFFSET_Y + (DATA_H - p.y) * SCALE };
}

/** Drop a polygon's closing point when it duplicates the first (the source JSON repeats it). */
function dedupeRing(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first.x === last.x && first.y === last.y ? points.slice(0, -1) : points;
}

function centroid(points: Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function pointsToPath(points: Point[]): string {
  return [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`, ...points.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`), 'Z'].join(' ');
}

/** Truncated point list, e.g. "[(23.4, 8.1), (57.7, 3.6), …]" — a real geometry column
 *  would carry the full ring/trace; this is cut off visually, same as a UI previewing a
 *  geometry column would. Shared by boundaries (rings) and roads (traces) alike. */
function formatPointList(points: Point[]): string {
  const shown = points
    .slice(0, 2)
    .map((p) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`)
    .join(', ');
  return `[${shown}, …]`;
}

// --- Boroughs -----------------------------------------------------------

export interface Borough {
  id: string;
  /** Short fictional record code, e.g. "B-01" — as a real admin_boundaries table would key rows. */
  code: string;
  name: string;
  /** SVG path in view space. */
  path: string;
  /** Boundary vertices in raw grid space (for the boundary preview table). */
  rawPoints: Point[];
  labelPoint: Point;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const boroughs: Borough[] = (boroughsData as { name: string; outline_coordinates: [number, number][] }[]).map(
  (b, i) => {
    const rawPoints = dedupeRing(b.outline_coordinates.map(([x, y]) => ({ x, y })));
    const projected = rawPoints.map(project);
    return {
      id: slugify(b.name),
      code: `B-${String(i + 1).padStart(2, '0')}`,
      name: b.name,
      path: pointsToPath(projected),
      rawPoints,
      labelPoint: project(centroid(rawPoints)),
    };
  }
);

/** Ray-casting point-in-polygon test, operating in raw grid space. */
function pointInPolygon(x: number, y: number, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const pi = points[i];
    const pj = points[j];
    const intersects =
      pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Which borough a raw grid point falls in. */
export function boroughOf(x: number, y: number): Borough {
  for (const b of boroughs) {
    if (pointInPolygon(x, y, b.rawPoints)) return b;
  }
  return boroughs[boroughs.length - 1];
}

// --- Roads ----------------------------------------------------------------

export interface Road {
  id: string;
  /** Short fictional record code, e.g. "R-01" — as a real roads table would key rows. */
  code: string;
  name: string;
  /** Trace in view space, ready to render. */
  trace: Point[];
  /** Trace in raw grid space (for the road preview table and distance calculations). */
  rawTrace: Point[];
  isMain: boolean;
}

export const roads: Road[] = (roadsData as { name: string; path_coordinates: [number, number][] }[]).map(
  (r, i) => {
    const rawTrace = r.path_coordinates.map(([x, y]) => ({ x, y }));
    return {
      id: slugify(r.name),
      code: `R-${String(i + 1).padStart(2, '0')}`,
      name: r.name,
      trace: rawTrace.map(project),
      rawTrace,
      isMain: r.name === 'Main St',
    };
  }
);

// --- Sensors ----------------------------------------------------------------

export interface Sensor {
  sensorId: string;
  /** View-space coordinates, for rendering. */
  x: number;
  y: number;
  /** Raw grid-space coordinates, for the sensor preview table. */
  rawX: number;
  rawY: number;
  no2: number;
  /** Which road this sensor was placed to monitor — used for roadMetrics only, never
   *  shown in the sensor table preview (see the file header). */
  street: string;
}

export const sensors: Sensor[] = (
  sensorsData as {
    sensor_id: string;
    coordinate_x: number;
    coordinate_y: number;
    no2_umg3: number;
    _street: string;
  }[]
).map((s) => {
  const p = project({ x: s.coordinate_x, y: s.coordinate_y });
  return {
    sensorId: s.sensor_id,
    x: p.x,
    y: p.y,
    rawX: s.coordinate_x,
    rawY: s.coordinate_y,
    no2: s.no2_umg3,
    street: s._street,
  };
});

// Shared sensor-dot size scale (small → large by reading), so both CityLayers and
// ExposureCompare render sensors identically.
const DOT_MIN_R = 1.6;
const DOT_MAX_R = 5.2;
const no2Values = sensors.map((s) => s.no2);
const no2Min = Math.min(...no2Values);
const no2Max = Math.max(...no2Values);

export function sensorDotRadius(no2: number): number {
  const t = (no2 - no2Min) / (no2Max - no2Min || 1);
  return DOT_MIN_R + t * (DOT_MAX_R - DOT_MIN_R);
}

export interface RoadMetrics {
  avg: number;
  sensorCount: number;
}

export const roadMetrics: Record<string, RoadMetrics> = Object.fromEntries(
  roads.map((r) => {
    const onRoad = sensors.filter((s) => s.street === r.name);
    const avg = onRoad.length ? onRoad.reduce((sum, s) => sum + s.no2, 0) / onRoad.length : NaN;
    return [r.id, { avg, sensorCount: onRoad.length }];
  })
);

export interface BoroughMetrics {
  /** Plain mean of the sensors that happen to fall in this borough — driven by sensor placement. */
  naiveAvg: number;
  sensorCount: number;
}

export const boroughMetrics: Record<string, BoroughMetrics> = Object.fromEntries(
  boroughs.map((b) => {
    const boroughSensors = sensors.filter((s) => boroughOf(s.rawX, s.rawY).id === b.id);
    const naiveAvg = boroughSensors.length
      ? boroughSensors.reduce((sum, s) => sum + s.no2, 0) / boroughSensors.length
      : NaN;

    return [b.id, { naiveAvg, sensorCount: boroughSensors.length }];
  })
);

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Sequential color scale between two hex colors, t clamped to [0, 1]. */
export function sequentialColor(t: number, fromHex: string, toHex: string): string {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const r = Math.round(lerp(from.r, to.r, clamped));
  const g = Math.round(lerp(from.g, to.g, clamped));
  const bch = Math.round(lerp(from.b, to.b, clamped));
  return `rgb(${r}, ${g}, ${bch})`;
}

/*
  Small "head(n)" previews of the raw tables the officer would actually be handed (beats 2
  and 3) — not the map, the tables the map gets built from. All in raw grid coordinates,
  since the projection into view space is a rendering detail, not part of the data.
*/

export interface SensorRow {
  sensor_id: string;
  x: number;
  y: number;
  no2_ugm3: number;
}

// Deliberately no borough column — the sensor table is tagged only by coordinate, which
// is exactly why boundaries and population have to be found and joined in before any
// per-borough analysis is possible.
export const sensorTablePreview: SensorRow[] = sensors.slice(0, 6).map((s) => ({
  sensor_id: s.sensorId,
  x: s.rawX,
  y: s.rawY,
  no2_ugm3: Number(s.no2.toFixed(1)),
}));

export interface BoundaryRow {
  borough_id: string;
  name: string;
  /** Truncated point list, e.g. "[(23.4, 8.1), (57.7, 3.6), …]" — a real boundary table
   *  would carry the full ring; this is cut off visually, same as it would be in a UI
   *  that previews a geometry column rather than rendering it. */
  boundary: string;
}

export const boundaryTablePreview: BoundaryRow[] = boroughs.map((b) => ({
  borough_id: b.code,
  name: b.name,
  boundary: formatPointList(b.rawPoints),
}));

export interface RoadRow {
  road_id: string;
  name: string;
  trace: string;
}

export const roadTablePreview: RoadRow[] = roads.map((r) => ({
  road_id: r.code,
  name: r.name,
  trace: formatPointList(r.rawTrace),
}));

// Population isn't part of the map/beat data above (no geometry, nothing to project) — it
// only shows up as the third source table in the Conceptual Foundation page's realization
// DAG (island #2), where the officer's realization joins sensors to boroughs and then
// weights by resident population. Fictional counts for the same five fictional boroughs,
// keyed to the same borough_id codes as boundaryTablePreview.
export interface PopulationRow {
  borough_id: string;
  name: string;
  population: number;
}

export const populationTablePreview: PopulationRow[] = (
  populationData as { name: string; population: number }[]
).map((p) => {
  const borough = boroughs.find((b) => b.name === p.name)!;
  return { borough_id: borough.code, name: p.name, population: p.population };
});

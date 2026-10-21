/*
 * Layout of the race track: the route points laid out as a winding road that
 * snakes left→right, then right→left, row by row, in SVG user units.
 * Pure geometry, so the same route always looks the same on every screen.
 */

export type TrackPoint = { x: number; y: number };

export type TrackLayout = {
  width: number;
  height: number;
  points: TrackPoint[];
  /** Smooth road through all points. */
  path: string;
  /** The same road cut at every point: segments[i] joins point i and i + 1. */
  segments: string[];
};

export const TRACK_WIDTH = 1000;
const PAD_X = 90;
const PAD_Y = 80;
const ROW = 190;

/** `width`: a narrower picture makes points and tokens bigger on a phone. */
export function layoutTrack(count: number, perRow: number, width = TRACK_WIDTH): TrackLayout {
  const cols = Math.max(2, perRow);
  const rows = Math.max(1, Math.ceil(count / cols));
  const step = (width - PAD_X * 2) / (cols - 1);
  const points: TrackPoint[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const along = row % 2 === 0 ? col : cols - 1 - col;
    // A gentle wave inside the row, so the road does not look like a ruler.
    const wave = Math.sin((along + row) * 1.7) * 26;
    points.push({ x: Math.round(PAD_X + along * step), y: Math.round(PAD_Y + row * ROW + wave) });
  }
  return {
    width,
    height: PAD_Y * 2 + (rows - 1) * ROW,
    points,
    path: smoothPath(points),
    segments: segmentPaths(points),
  };
}

/** Cubic Bézier from point i to i + 1 (Catmull-Rom tangents), without the "M". */
function curve(points: TrackPoint[], i: number): string {
  const p0 = points[i - 1] ?? points[i];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[i + 2] ?? p2;
  const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
  const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
  return `C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${p2.x} ${p2.y}`;
}

/** Catmull-Rom through the points, written as cubic Béziers. */
export function smoothPath(points: TrackPoint[]): string {
  if (points.length === 0) return "";
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) d += ` ${curve(points, i)}`;
  return d;
}

export function segmentPaths(points: TrackPoint[]): string[] {
  return points.slice(0, -1).map((p, i) => `M${p.x} ${p.y} ${curve(points, i)}`);
}

const r = (n: number) => Math.round(n * 10) / 10;

/** Offsets for several teams on one point: a small fan, so tokens never hide each other. */
export function fanOffsets(n: number, radius = 30): TrackPoint[] {
  if (n <= 1) return [{ x: 0, y: 0 }];
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (i - (n - 1) / 2) * (Math.PI / Math.max(3, n));
    return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius + radius * 0.6) };
  });
}

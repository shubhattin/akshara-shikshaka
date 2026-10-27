import type { StrokeSpec } from './schemas';

/**
 * Editing a drafted plan without the model: reverse, split and join strokes, and describe a
 * stroke's direction in words. Shared by the draft editor (client) and the server's summary of
 * an edit, so it stays free of DOM and server code.
 */

type Pt = [number, number];

export const STROKE_COLORS = [
  '#e5484d',
  '#0161fd',
  '#30a46c',
  '#f76b15',
  '#8e4ec6',
  '#12a594',
  '#d6409f',
  '#ad7f58',
  '#3e63dd',
  '#978365',
  '#e54666',
  '#46a758'
];
export const strokeColor = (index: number) => STROKE_COLORS[index % STROKE_COLORS.length]!;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round1 = (v: number) => Math.round(v * 10) / 10;

const lengthOf = (pts: readonly Pt[]) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i]!, pts[i - 1]!);
  return total;
};

/** Shoelace area of the closed polyline; on screen (y down) clockwise is positive. */
const signedArea = (pts: readonly Pt[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

/** Swap a token's loop direction and cut kind: `E4:cw` ↔ `E4:ccw`, `|to=` ↔ `|from=`. */
const reverseToken = (token: string) =>
  token
    .replace(/:(cw|ccw)\b/, (_, orient: string) => (orient === 'cw' ? ':ccw' : ':cw'))
    .replace(/\|(to|from)=/, (_, kind: string) => (kind === 'to' ? '|from=' : '|to='));

/** The same stroke drawn the other way. */
export function reverseSpec(spec: StrokeSpec): StrokeSpec {
  if ('dot' in spec) return spec;
  if ('waypoints' in spec) return { ...spec, waypoints: [...spec.waypoints].reverse() };
  return { ...spec, path: [...spec.path].reverse().map(reverseToken) };
}

/** Waypoint spacing for strokes rebuilt from their traced centreline. */
const WAYPOINT_STEP = 8;

/**
 * A freehand plan through points that already follow the glyph's centreline (a traced stroke
 * after a split or join): waypoints every few units, both ends kept.
 */
export function waypointsSpec(points: readonly Pt[], label?: string): StrokeSpec {
  const kept: Pt[] = [points[0]!];
  for (const p of points.slice(1, -1)) {
    if (dist(p, kept.at(-1)!) >= WAYPOINT_STEP) kept.push(p);
  }
  const last = points.at(-1)!;
  if (dist(last, kept.at(-1)!) < WAYPOINT_STEP / 2 && kept.length > 1) kept.pop();
  kept.push(last);
  const waypoints = kept.map(([x, y]): Pt => [round1(x), round1(y)]);
  return label ? { waypoints, label } : { waypoints };
}

/** Index of the stroke point nearest `p`, and how far it is. */
export function nearestPoint(points: readonly Pt[], p: Pt) {
  let index = 0;
  let distance = Infinity;
  points.forEach((q, i) => {
    const d = dist(p, q);
    if (d < distance) {
      distance = d;
      index = i;
    }
  });
  return { index, distance };
}

/** Each half of a split keeps at least this much of the stroke (canvas units). */
export const MIN_SPLIT_PIECE = 12;

/** The two halves of a stroke cut at point `index`, or null when one would be too short. */
export function splitPoints(points: readonly Pt[], index: number): [Pt[], Pt[]] | null {
  const first = points.slice(0, index + 1);
  const second = points.slice(index);
  if (lengthOf(first) < MIN_SPLIT_PIECE || lengthOf(second) < MIN_SPLIT_PIECE) return null;
  return [first, second];
}

/** How close one stroke's end must be to the next one's start to join them. */
export const JOIN_GAP = 16;

export const canJoin = (a: readonly Pt[], b: readonly Pt[]) =>
  a.length > 0 && b.length > 0 && dist(a.at(-1)!, b[0]!) <= JOIN_GAP;

/** One stroke through both: the second continues where the first ends. */
export function joinPoints(a: readonly Pt[], b: readonly Pt[]): Pt[] {
  const tail = dist(a.at(-1)!, b[0]!) < 1 ? b.slice(1) : b;
  return [...a, ...tail];
}

type Compass = 'right' | 'left' | 'down' | 'up' | `${'down' | 'up'}-${'right' | 'left'}`;

const compass = (dx: number, dy: number): Compass => {
  if (Math.abs(dx) > 2 * Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (Math.abs(dy) > 2 * Math.abs(dx)) return dy > 0 ? 'down' : 'up';
  return `${dy > 0 ? 'down' : 'up'}-${dx > 0 ? 'right' : 'left'}`;
};

const FROM_TO = {
  right: 'left → right',
  left: 'right → left',
  down: 'top → bottom',
  up: 'bottom → top',
  'down-right': 'top-left → bottom-right',
  'down-left': 'top-right → bottom-left',
  'up-right': 'bottom-left → top-right',
  'up-left': 'bottom-right → top-left'
} as const satisfies Record<Compass, string>;

/**
 * A stroke's direction in plain words, from its points: "top → bottom", "left → right, bowing
 * up", "loop, clockwise", "dot". Stays right after the admin reverses a stroke.
 */
export function describeDirection(points: readonly Pt[]): string {
  const length = lengthOf(points);
  if (points.length < 2 || length < 10) return 'dot';
  const start = points[0]!;
  const end = points.at(-1)!;
  const chord = dist(start, end);
  if (chord < length * 0.2) {
    return signedArea(points) > 0 ? 'loop, clockwise' : 'loop, anticlockwise';
  }
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const base = FROM_TO[compass(dx, dy)];
  // the point farthest from the chord says which way the stroke bows
  let far = 0;
  let bow: Pt = [0, 0];
  for (const p of points) {
    const offset = ((p[0] - start[0]) * dy - (p[1] - start[1]) * dx) / chord;
    if (Math.abs(offset) > Math.abs(far)) {
      far = offset;
      // unit normal to the chord, towards the point
      bow = [(dy / chord) * Math.sign(offset), (-dx / chord) * Math.sign(offset)];
    }
  }
  if (Math.abs(far) / chord < 0.15) return base;
  return `${base}, bowing ${compass(bow[0], bow[1])}`;
}

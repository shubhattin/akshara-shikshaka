import { scoreGlyphStroke } from '~/tools/stroke_data/gesture_scoring';
import type { GesturePoints } from '~/tools/stroke_data/types';
import type { ReferenceCheck, TraceStrokesOutput } from './schemas';
import type { SkeletonGraph } from './skeleton';

/**
 * Self-checks for a drafted set of strokes: does it cover the whole glyph, stay on the ink,
 * avoid drawing parts twice and hit every dot — and, when the gesture already has saved
 * strokes, how it scores against them with the practice scorer (both ways).
 */

type Pt = [number, number];

const COVERAGE_OK = 0.92;
const OFF_INK_OK = 0.08;
const RETRACE_OK = 0.1;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Samples every `step` units along a polyline. */
function samples(pts: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = dist(a, b);
    let t = carry;
    while (t <= seg) {
      out.push(seg === 0 ? a : [a[0] + ((b[0] - a[0]) * t) / seg, a[1] + ((b[1] - a[1]) * t) / seg]);
      t += step;
    }
    carry = t - seg;
  }
  return out;
}

const nearestDistance = (p: Pt, pts: readonly Pt[]) => {
  let best = Infinity;
  for (const q of pts) {
    const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
};

const toReference = (score: ReturnType<typeof scoreGlyphStroke>) => ({
  passed: score.passed,
  score: Math.round(score.score * 100) / 100,
  issue: score.issue,
  ...(score.matchedStrokeIndex !== undefined ? { matched_stroke: score.matchedStrokeIndex + 1 } : {})
});

export type DraftEvaluation = Omit<TraceStrokesOutput, 'gesture_id' | 'glyph' | 'images' | 'strokes'> & {
  perStroke: { off_ink: number; reference?: ReferenceCheck }[];
  /** Uncovered skeleton runs with their points, for drawing */
  gaps: { from: Pt; to: Pt; points: Pt[] }[];
};

export function evaluateDraft(input: {
  graph: SkeletonGraph;
  strokes: Pt[][];
  onInk: (p: Pt) => boolean;
  /** Strokes currently saved for the gesture (empty strokes ignored) */
  saved: GesturePoints[][];
}): DraftEvaluation {
  const { graph, strokes, onInk } = input;
  const tol = Math.max(4, graph.strokeWidth * 0.55);
  const junctions = graph.nodes.filter((n) => n.kind === 'junction').map((n): Pt => [n.x, n.y]);
  const nearJunction = (p: Pt) => junctions.some((j) => dist(j, p) < graph.strokeWidth * 0.9);

  let total = 0;
  let covered = 0;
  let retraceBase = 0;
  let retraced = 0;
  const uncovered: TraceStrokesOutput['uncovered'] = [];
  const gaps: DraftEvaluation['gaps'] = [];
  for (const edge of graph.edges) {
    const pts = samples(edge.points, 2);
    let edgeMissed = 0;
    let run: Pt[] = [];
    const flush = () => {
      if (run.length >= 3) {
        gaps.push({ from: run[0]!, to: run.at(-1)!, points: run });
      }
      run = [];
    };
    for (const p of pts) {
      const hits = strokes.filter((stroke) => nearestDistance(p, stroke) <= tol).length;
      total++;
      if (hits > 0) {
        covered++;
        flush();
      } else {
        edgeMissed++;
        run.push(p);
      }
      if (!nearJunction(p)) {
        retraceBase++;
        if (hits > 1) retraced++;
      }
    }
    flush();
    if (pts.length > 0 && edgeMissed / pts.length >= 0.1) {
      const missedPts = pts.filter((p) => !strokes.some((stroke) => nearestDistance(p, stroke) <= tol));
      uncovered.push({
        edge: edge.id,
        fraction: round3(edgeMissed / pts.length),
        from: missedPts[0]!,
        to: missedPts.at(-1)!
      });
    }
  }
  const coverage = total > 0 ? covered / total : 1;
  const retraceShare = retraceBase > 0 ? retraced / retraceBase : 0;

  const missedDots = graph.dots
    .filter((dot) => !strokes.some((stroke) => nearestDistance([dot.x, dot.y], stroke) <= dot.r + 5))
    .map((dot) => dot.id);

  const saved = input.saved.filter((s) => s.length > 0);
  const perStroke = strokes.map((stroke, index) => {
    const off = stroke.length > 0 ? stroke.filter((p) => !onInk(p)).length / stroke.length : 1;
    let reference: ReferenceCheck | undefined;
    if (saved.length > 0 && saved[index]) {
      reference = {
        against_saved: toReference(scoreGlyphStroke(stroke, saved, index)),
        saved_against_draft: toReference(scoreGlyphStroke(saved[index]!, strokes, index))
      };
    }
    return { off_ink: round3(off), reference };
  });

  const issues: string[] = [];
  if (coverage < COVERAGE_OK) {
    issues.push(
      `Only ${pct(coverage)} of the glyph is covered. Missing: ${uncovered
        .map((u) => `${u.edge} (${pct(u.fraction)} of it, ${u.from.map(Math.round).join(',')} → ${u.to.map(Math.round).join(',')})`)
        .join('; ')}`
    );
  }
  perStroke.forEach((s, index) => {
    if (s.off_ink > OFF_INK_OK) issues.push(`Stroke ${index + 1} leaves the glyph: ${pct(s.off_ink)} of its points are off the ink`);
  });
  if (retraceShare > RETRACE_OK) issues.push(`${pct(retraceShare)} of the glyph is drawn by two strokes; check for overlapping strokes`);
  if (missedDots.length > 0) issues.push(`Dots not drawn: ${missedDots.join(', ')}`);
  if (saved.length > 0 && saved.length !== strokes.length) {
    issues.push(`Note: the saved gesture has ${saved.length} strokes, this draft ${strokes.length}`);
  }
  perStroke.forEach((s, index) => {
    const ref = s.reference?.against_saved;
    if (ref && !ref.passed) {
      issues.push(
        `Note: stroke ${index + 1} does not match saved stroke ${index + 1} (${ref.issue}${ref.matched_stroke ? `, it matches saved stroke ${ref.matched_stroke}` : ''}, score ${ref.score})`
      );
    }
  });

  const ok =
    coverage >= COVERAGE_OK &&
    perStroke.every((s) => s.off_ink <= OFF_INK_OK) &&
    retraceShare <= RETRACE_OK &&
    missedDots.length === 0;

  return {
    ok,
    coverage: round3(coverage),
    uncovered,
    retraced: round3(retraceShare),
    missed_dots: missedDots,
    issues,
    perStroke,
    gaps
  };
}

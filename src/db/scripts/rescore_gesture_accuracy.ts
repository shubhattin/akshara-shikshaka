/*
 * Re-score stored practice attempts (`user_gesture_recording_vectors.recorded_accuracy`) with the
 * current stroke scorer and compare them with the scores stored by the scorer at the time.
 *
 * Reads the JSON dump written by `import_data.ts`. Run from this folder:
 *   bun rescore_gesture_accuracy.ts                    # local dump  (out/db_data.json)
 *   bun rescore_gesture_accuracy.ts --prod             # prod dump   (out/db_data_prod.json)
 *   bun rescore_gesture_accuracy.ts --prod --update    # also write the new scores to the prod DB
 *
 * The stored scores are taken to come from the current scorer family (passing at
 * `GESTURE_PASS_THRESHOLD`). For a dump still holding scores from the legacy scorer that was
 * replaced in Oct 2026 (passing above 0.75), add `--legacy` so the before → after pass/fail
 * comparison uses that rule. The flag changes only the report, never what is written.
 *
 * Prints statistics and saves before/after charts to `out/rescore_<mode>/`. With `--update` the
 * changed scores are written (after confirmation) only to rows still holding the score that was in
 * the dump, so anything re-scored or edited since the dump is left alone.
 */
import chalk from 'chalk';
import sharp from 'sharp';
import { sql } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { dbMode, make_dir, take_input } from '~/tools/kry.server';
import { get_script_from_id } from '~/state/lang_list';
import { user_gesture_recording_vectors } from '../schema';
import {
  GESTURE_PASS_THRESHOLD,
  scoreGlyphStroke,
  type GestureIssue
} from '~/tools/stroke_data/gesture_scoring';
import type { GesturePoints } from '~/tools/stroke_data/types';

/** The legacy scorer (replaced in Oct 2026) accepted strokes scoring strictly above this */
const LEGACY_PASS_THRESHOLD = 0.75;
/** Glyphs with fewer attempts are left out of the per-glyph table and chart */
const MIN_GLYPH_ATTEMPTS = 15;
const UPDATE_BATCH_SIZE = 500;

// ---------------------------------------------------------------------------------------------
// Flags & data

const args = process.argv.slice(2);
const mode = args.includes('--prod') ? 'PROD' : args.includes('--preview') ? 'PREVIEW' : 'LOCAL';
const shouldUpdate = args.includes('--update');

/** How the stored ("before") scores were judged by the scorer that produced them */
const BEFORE_RULE = args.includes('--legacy')
  ? {
      threshold: LEGACY_PASS_THRESHOLD,
      passed: (score: number) => score > LEGACY_PASS_THRESHOLD,
      label: `pass > ${LEGACY_PASS_THRESHOLD}`,
      source: 'legacy scorer'
    }
  : {
      threshold: GESTURE_PASS_THRESHOLD,
      passed: (score: number) => score >= GESTURE_PASS_THRESHOLD,
      label: `pass ≥ ${GESTURE_PASS_THRESHOLD}`,
      source: 'stored'
    };

const DATA_FILE = {
  PROD: 'db_data_prod.json',
  PREVIEW: 'db_data_preview.json',
  LOCAL: 'db_data.json'
}[mode];
const OUT_DIR = fileURLToPath(new URL('./out/', import.meta.url));
const CHART_DIR = `${OUT_DIR}rescore_${mode.toLowerCase()}/`;

const DumpSchema = z.object({
  text_gestures: z.array(
    z.object({
      text: z.string(),
      script_id: z.number(),
      gestures: z.array(z.object({ points: z.array(z.tuple([z.number(), z.number()])) }))
    })
  ),
  user_gesture_recordings: z.array(
    z.object({ id: z.number(), text: z.string(), script_id: z.number(), created_at: z.string() })
  ),
  user_gesture_recording_vectors: z.array(
    z.object({
      id: z.number(),
      user_gesture_recording_id: z.number(),
      index: z.number(),
      recorded_vector: z.array(z.number()),
      drawn_vector: z.array(z.number()),
      recorded_accuracy: z.number()
    })
  )
});
type Dump = z.infer<typeof DumpSchema>;

type Row = {
  id: number;
  glyph: string;
  script: string;
  before: number;
  after: number;
  passedBefore: boolean;
  passedAfter: boolean;
  issue: GestureIssue | null;
};

const groupBy = <T, K>(items: T[], key: (item: T) => K) => {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
};

const unflatten = (flat: number[]): GesturePoints[] => {
  const points: GesturePoints[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
  return points;
};

/** Score every attempt in the dump against the glyph as it was when it was practised */
const rescore = (dump: Dump): Row[] => {
  const recordings = new Map(dump.user_gesture_recordings.map((r) => [r.id, r]));
  const currentGlyphs = new Map(
    dump.text_gestures.map((g) => [`${g.text}|${g.script_id}`, g.gestures.map((s) => s.points)])
  );
  const vectorsByRecording = groupBy(
    dump.user_gesture_recording_vectors,
    (v) => v.user_gesture_recording_id
  );

  const rows: Row[] = [];
  for (const [recordingId, vectors] of vectorsByRecording) {
    const recording = recordings.get(recordingId);
    if (!recording) continue;
    // Start from the glyph's current strokes, then put back the reference strokes that were
    // actually shown (stored with each attempt) in case the glyph was re-recorded since
    const strokes: GesturePoints[][] = [
      ...(currentGlyphs.get(`${recording.text}|${recording.script_id}`) ?? [])
    ];
    for (const v of vectors) strokes[v.index] = unflatten(v.recorded_vector);
    const glyphStrokes = Array.from(strokes, (s) => s ?? []);

    for (const v of vectors) {
      const result = scoreGlyphStroke(unflatten(v.drawn_vector), glyphStrokes, v.index);
      rows.push({
        id: v.id,
        glyph: recording.text,
        script: get_script_from_id(recording.script_id) ?? String(recording.script_id),
        before: v.recorded_accuracy,
        after: result.score,
        passedBefore: BEFORE_RULE.passed(v.recorded_accuracy),
        passedAfter: result.passed,
        issue: result.issue
      });
    }
  }
  return rows;
};

// ---------------------------------------------------------------------------------------------
// Statistics

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const std = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const quantile = (xs: number[], q: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const pearson = (xs: number[], ys: number[]) => {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy || 1);
};
const ranks = (xs: number[]) => {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = Array.from({ length: xs.length }, () => 0);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
};
const spearman = (xs: number[], ys: number[]) => pearson(ranks(xs), ranks(ys));
const pct = (n: number, total: number) => `${((n / Math.max(1, total)) * 100).toFixed(1)}%`;
const fixed = (x: number) => x.toFixed(3);

const printReport = (rows: Row[], dump: Dump) => {
  const before = rows.map((r) => r.before);
  const after = rows.map((r) => r.after);
  const dates = dump.user_gesture_recordings.map((r) => r.created_at).sort();
  const heading = (s: string) => console.log(`\n${chalk.bold.cyan(s)}`);

  heading(`Re-scored ${rows.length} attempts (${mode} dump: ${DATA_FILE})`);
  console.log(
    `${new Set(rows.map((r) => r.glyph)).size} glyphs, ` +
      `${dump.user_gesture_recordings.length} practice sessions, ${dates[0]} → ${dates.at(-1)}`
  );
  console.log(
    `Before: ${BEFORE_RULE.source} scores, ${BEFORE_RULE.label}. ` +
      `After: current scorer, pass ≥ ${GESTURE_PASS_THRESHOLD}.`
  );

  heading('Score distribution');
  console.table(
    Object.fromEntries(
      (
        [
          ['before', before, rows.filter((r) => r.passedBefore).length],
          ['after', after, rows.filter((r) => r.passedAfter).length]
        ] as const
      ).map(([name, xs, passed]) => [
        name,
        {
          mean: fixed(mean(xs)),
          std: fixed(std(xs)),
          min: fixed(Math.min(...xs)),
          p10: fixed(quantile(xs, 0.1)),
          p25: fixed(quantile(xs, 0.25)),
          median: fixed(quantile(xs, 0.5)),
          p75: fixed(quantile(xs, 0.75)),
          p90: fixed(quantile(xs, 0.9)),
          max: fixed(Math.max(...xs)),
          'pass rate': pct(passed, rows.length)
        }
      ])
    )
  );

  heading('How scores moved');
  const diffs = rows.map((r) => r.after - r.before);
  console.table({
    'mean change (after − before)': fixed(mean(diffs)),
    'mean absolute change': fixed(mean(diffs.map(Math.abs))),
    'Pearson correlation': fixed(pearson(before, after)),
    'Spearman rank correlation': fixed(spearman(before, after)),
    'rose by > 0.1': pct(diffs.filter((d) => d > 0.1).length, rows.length),
    'fell by > 0.1': pct(diffs.filter((d) => d < -0.1).length, rows.length),
    'within ±0.1': pct(diffs.filter((d) => Math.abs(d) <= 0.1).length, rows.length)
  });

  heading('Pass / fail decisions (before → after)');
  const count = (b: boolean, a: boolean) =>
    rows.filter((r) => r.passedBefore === b && r.passedAfter === a).length;
  console.table({
    'pass → pass': { attempts: count(true, true), share: pct(count(true, true), rows.length) },
    'pass → FAIL': { attempts: count(true, false), share: pct(count(true, false), rows.length) },
    'fail → PASS': { attempts: count(false, true), share: pct(count(false, true), rows.length) },
    'fail → fail': { attempts: count(false, false), share: pct(count(false, false), rows.length) }
  });

  heading('Why attempts fail now');
  const failed = rows.filter((r) => !r.passedAfter);
  const issues = groupBy(failed, (r) => r.issue ?? 'unknown');
  console.table(
    Object.fromEntries(
      [...issues]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([issue, rs]) => [
          issue,
          {
            attempts: rs.length,
            share: pct(rs.length, failed.length),
            'passed before': rs.filter((r) => r.passedBefore).length
          }
        ])
    )
  );

  const groupTable = (groups: Map<string, Row[]>) =>
    Object.fromEntries(
      [...groups]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([key, rs]) => [
          key,
          {
            attempts: rs.length,
            'mean before': fixed(mean(rs.map((r) => r.before))),
            'mean after': fixed(mean(rs.map((r) => r.after))),
            'pass before': pct(rs.filter((r) => r.passedBefore).length, rs.length),
            'pass after': pct(rs.filter((r) => r.passedAfter).length, rs.length)
          }
        ])
    );

  heading('By script');
  console.table(groupTable(groupBy(rows, (r) => r.script)));

  heading(`By glyph (≥ ${MIN_GLYPH_ATTEMPTS} attempts)`);
  const glyphs = new Map(
    [...groupBy(rows, (r) => r.glyph)].filter(([, rs]) => rs.length >= MIN_GLYPH_ATTEMPTS)
  );
  console.table(groupTable(glyphs));
};

// ---------------------------------------------------------------------------------------------
// Charts (SVG rendered to PNG with sharp)

const COLORS = {
  surface: '#fcfcfb',
  text: '#0b0b0b',
  textMuted: '#52514e',
  grid: '#e4e3df',
  before: '#2a78d6',
  after: '#eb6834'
};
const FONT = `font-family="Noto Sans, Noto Sans Devanagari, Noto Sans Telugu, Noto Sans Kannada, Noto Sans Malayalam, Noto Sans Oriya, Noto Sans Tamil, Noto Sans Bengali, Noto Sans Gujarati, sans-serif"`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (x: number, y: number, s: string, attrs = '') => {
  // Defaults only where `attrs` doesn't set them: duplicate attributes make the SVG invalid
  const size = attrs.includes('font-size=') ? '' : 'font-size="13"';
  const fill = attrs.includes('fill=') ? '' : `fill="${COLORS.textMuted}"`;
  return `<text x="${x}" y="${y}" ${FONT} ${size} ${fill} ${attrs}>${esc(s)}</text>`;
};

/** Bar with only its data end rounded, anchored to the baseline */
const bar = (x: number, y: number, w: number, h: number, fill: string, end: 'top' | 'right') => {
  if (w <= 0 || h <= 0) return '';
  const r = Math.min(4, end === 'top' ? h : w, (end === 'top' ? w : h) / 2);
  return end === 'top'
    ? `<path d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z" fill="${fill}"/>`
    : `<path d="M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z" fill="${fill}"/>`;
};

const svgDoc = (w: number, h: number, title: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="${w}" height="${h}" fill="${COLORS.surface}"/>` +
  `<text x="24" y="34" ${FONT} font-size="18" font-weight="600" fill="${COLORS.text}">${esc(title)}</text>` +
  body +
  '</svg>';

/** Before/after score histograms as two panels sharing the x and y scales */
const distributionChart = (rows: Row[]) => {
  const BINS = 20;
  const W = 900;
  const PANEL_H = 220;
  const left = 64;
  const right = W - 32;
  const binOf = (x: number) => Math.min(BINS - 1, Math.max(0, Math.floor(x * BINS)));
  const histogram = (xs: number[]) => {
    const h = Array.from({ length: BINS }, () => 0);
    for (const x of xs) h[binOf(x)]++;
    return h;
  };
  const panels = [
    {
      name: `Before (${BEFORE_RULE.source} scores)`,
      color: COLORS.before,
      counts: histogram(rows.map((r) => r.before)),
      threshold: BEFORE_RULE.threshold,
      label: BEFORE_RULE.label
    },
    {
      name: 'After (current scorer)',
      color: COLORS.after,
      counts: histogram(rows.map((r) => r.after)),
      threshold: GESTURE_PASS_THRESHOLD,
      label: `pass ≥ ${GESTURE_PASS_THRESHOLD}`
    }
  ];
  const yMax = Math.max(...panels.flatMap((p) => p.counts));
  const step = (right - left) / BINS;
  const xAt = (v: number) => left + v * (right - left);

  let body = '';
  panels.forEach((p, i) => {
    const top = 64 + i * (PANEL_H + 56);
    const base = top + PANEL_H;
    body += text(left, top - 10, p.name, `font-size="14" font-weight="600" fill="${COLORS.text}"`);
    for (const t of [0, 0.5, 1]) {
      const y = base - t * PANEL_H;
      body += `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="${COLORS.grid}"/>`;
      body += text(left - 8, y + 4, String(Math.round(t * yMax)), 'text-anchor="end"');
    }
    p.counts.forEach((c, b) => {
      const h = (c / yMax) * PANEL_H;
      body += bar(left + b * step + 1, base - h, step - 2, h, p.color, 'top');
    });
    const tx = xAt(p.threshold);
    body += `<line x1="${tx}" x2="${tx}" y1="${top}" y2="${base}" stroke="${COLORS.text}" stroke-dasharray="4 4"/>`;
    body += text(tx + 6, top + 12, p.label, `fill="${COLORS.text}"`);
    for (let t = 0; t <= 10; t += 2) {
      body += text(xAt(t / 10), base + 18, (t / 10).toFixed(1), 'text-anchor="middle"');
    }
  });
  body += text(left, 2 * (PANEL_H + 56) + 54, 'Score per stroke attempt — y: number of attempts');
  return svgDoc(
    W,
    2 * (PANEL_H + 56) + 70,
    `Stroke scores before vs after (${rows.length} attempts)`,
    body
  );
};

/** Each attempt's old score against its new score, with both pass thresholds */
const scatterChart = (rows: Row[]) => {
  const S = 520;
  const left = 72;
  const top = 64;
  const x = (v: number) => left + v * S;
  const y = (v: number) => top + (1 - v) * S;
  let body = '';
  for (let t = 0; t <= 10; t += 2) {
    const v = t / 10;
    body += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + S}" stroke="${COLORS.grid}"/>`;
    body += `<line x1="${left}" x2="${left + S}" y1="${y(v)}" y2="${y(v)}" stroke="${COLORS.grid}"/>`;
    body += text(x(v), top + S + 20, v.toFixed(1), 'text-anchor="middle"');
    body += text(left - 10, y(v) + 4, v.toFixed(1), 'text-anchor="end"');
  }
  for (const r of rows) {
    body += `<circle cx="${x(r.before).toFixed(1)}" cy="${y(r.after).toFixed(1)}" r="2.5" fill="${COLORS.before}" fill-opacity="0.35"/>`;
  }
  body += `<line x1="${x(BEFORE_RULE.threshold)}" x2="${x(BEFORE_RULE.threshold)}" y1="${top}" y2="${top + S}" stroke="${COLORS.text}" stroke-dasharray="4 4"/>`;
  body += `<line x1="${left}" x2="${left + S}" y1="${y(GESTURE_PASS_THRESHOLD)}" y2="${y(GESTURE_PASS_THRESHOLD)}" stroke="${COLORS.text}" stroke-dasharray="4 4"/>`;
  const count = (b: boolean, a: boolean) =>
    rows.filter((r) => r.passedBefore === b && r.passedAfter === a).length;
  const quadrant = (qx: number, qy: number, label: string, n: number, anchor: string) =>
    text(
      qx,
      qy,
      `${label}: ${n}`,
      `text-anchor="${anchor}" font-weight="600" fill="${COLORS.text}"`
    );
  body += quadrant(x(1) - 8, top + 18, 'pass → pass', count(true, true), 'end');
  body += quadrant(x(1) - 8, top + S - 10, 'pass → fail', count(true, false), 'end');
  body += quadrant(left + 8, top + 18, 'fail → pass', count(false, true), 'start');
  body += quadrant(left + 8, top + S - 10, 'fail → fail', count(false, false), 'start');
  body += text(
    left + S / 2,
    top + S + 46,
    `Before (${BEFORE_RULE.source} scores)`,
    'text-anchor="middle"'
  );
  body += text(
    20,
    top + S / 2,
    'After (current scorer)',
    `text-anchor="middle" transform="rotate(-90 20 ${top + S / 2})"`
  );
  return svgDoc(left + S + 40, top + S + 64, 'Each attempt: score before vs after', body);
};

/** Pass rate per glyph before and after, for the most practised glyphs */
const glyphChart = (rows: Row[]) => {
  const groups = [...groupBy(rows, (r) => r.glyph)]
    .filter(([, rs]) => rs.length >= MIN_GLYPH_ATTEMPTS)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 16);
  const W = 900;
  const left = 120;
  const right = W - 80;
  const top = 92;
  const ROW_H = 40;
  const barH = 13;
  const x = (v: number) => left + v * (right - left);
  let body = '';
  // Legend
  body += bar(24, 50, 14, 12, COLORS.before, 'right') + text(44, 61, 'Before');
  body += bar(110, 50, 14, 12, COLORS.after, 'right') + text(130, 61, 'After');
  for (let t = 0; t <= 4; t++) {
    const v = t / 4;
    const bottom = top + groups.length * ROW_H;
    body += `<line x1="${x(v)}" x2="${x(v)}" y1="${top - 6}" y2="${bottom}" stroke="${COLORS.grid}"/>`;
    body += text(x(v), bottom + 18, `${v * 100}%`, 'text-anchor="middle"');
  }
  groups.forEach(([glyph, rs], i) => {
    const y = top + i * ROW_H;
    const passBefore = rs.filter((r) => r.passedBefore).length / rs.length;
    const passAfter = rs.filter((r) => r.passedAfter).length / rs.length;
    body += text(
      left - 12,
      y + barH + 6,
      `${glyph}  (${rs.length})`,
      'text-anchor="end" font-size="15"'
    );
    body += bar(left, y, x(passBefore) - left, barH, COLORS.before, 'right');
    body += bar(left, y + barH + 2, x(passAfter) - left, barH, COLORS.after, 'right');
    body += text(x(passBefore) + 6, y + 11, `${Math.round(passBefore * 100)}%`, 'font-size="11"');
    body += text(
      x(passAfter) + 6,
      y + barH + 13,
      `${Math.round(passAfter * 100)}%`,
      'font-size="11"'
    );
  });
  return svgDoc(
    W,
    top + groups.length * ROW_H + 40,
    'Pass rate per glyph (most practised; attempts in brackets)',
    body
  );
};

const saveCharts = async (rows: Row[]) => {
  await make_dir(CHART_DIR);
  const charts = {
    'score_distribution.png': distributionChart(rows),
    'before_vs_after.png': scatterChart(rows),
    'glyph_pass_rates.png': glyphChart(rows)
  };
  for (const [name, svg] of Object.entries(charts)) {
    await sharp(Buffer.from(svg), { density: 144 }).png().toFile(`${CHART_DIR}${name}`);
    console.log(`  ${chalk.green('✓')} ${CHART_DIR}${name}`);
  }
};

// ---------------------------------------------------------------------------------------------
// Update

const updateScores = async (rows: Row[]) => {
  const changed = rows.filter((r) => Math.abs(r.after - r.before) > 1e-6);
  console.log(
    `\n${chalk.bold(changed.length)} of ${rows.length} attempts have a different score ` +
      `(${rows.length - changed.length} unchanged).`
  );
  if (changed.length === 0) return;

  const answer = await take_input(
    chalk.yellow(
      `Write the new scores for ${changed.length} attempts to the ${dbMode} database? Type "yes" to continue: `
    )
  );
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted, nothing was written.');
    return;
  }

  // Connects only now, so the analysis alone never needs database credentials
  const { dbClient_ext: db, queryClient } = await import('./client');
  try {
    const updated = await db.transaction(async (tx) => {
      let total = 0;
      for (let i = 0; i < changed.length; i += UPDATE_BATCH_SIZE) {
        const batch = changed.slice(i, i + UPDATE_BATCH_SIZE);
        const values = sql.join(
          batch.map((r) => sql`(${r.id}::int, ${r.before}::real, ${r.after}::real)`),
          sql`, `
        );
        const result = await tx.execute(sql`
          update ${user_gesture_recording_vectors} set recorded_accuracy = c.after
          from (values ${values}) as c(id, before, after)
          where ${user_gesture_recording_vectors.id} = c.id
            and ${user_gesture_recording_vectors.recorded_accuracy} = c.before
          returning ${user_gesture_recording_vectors.id}`);
        total += result.length;
      }
      return total;
    });
    console.log(chalk.green(`✓ Updated ${updated} attempts in the ${dbMode} database.`));
    if (updated < changed.length) {
      console.log(
        chalk.yellow(
          `${changed.length - updated} attempts were skipped: they no longer exist or their score changed since the dump.`
        )
      );
    }
  } finally {
    await queryClient.end();
  }
};

// ---------------------------------------------------------------------------------------------

const main = async () => {
  // `client.ts` picks the database from the *first* argument only, so make sure both agree
  if (shouldUpdate && mode !== dbMode) {
    throw new Error(`Pass the mode flag first (e.g. \`--prod --update\`), got: ${args.join(' ')}`);
  }

  console.log(chalk.dim(`Reading ${OUT_DIR}${DATA_FILE} ...`));
  const dump = DumpSchema.parse(JSON.parse(await readFile(`${OUT_DIR}${DATA_FILE}`, 'utf-8')));
  const rows = rescore(dump);

  printReport(rows, dump);

  console.log(`\n${chalk.bold.cyan('Charts')}`);
  await saveCharts(rows);

  if (shouldUpdate) await updateScores(rows);
};

if (require.main === module) {
  main().catch((e) => {
    console.error(chalk.red(e instanceof Error ? e.message : e));
    process.exit(1);
  });
}

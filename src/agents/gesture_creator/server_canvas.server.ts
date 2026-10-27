import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';
import type { FontFamily } from '~/state/font_families';
import type { CanvasEnv } from './canvas_env';

/**
 * The harness canvas on the server. Font files are inlined into the server bundle (base64, loaded
 * on first use), so rendering needs neither the network nor system fonts — a Vercel function has
 * none of the latter.
 */

type FontModule = { default: string };

const GLYPH_FONTS = {
  Noto_Sans_Devanagari: () =>
    import('@fontsource-variable/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-wght-normal.woff2?inline'),
  Noto_Serif_Devanagari: () =>
    import('@fontsource-variable/noto-serif-devanagari/files/noto-serif-devanagari-devanagari-wght-normal.woff2?inline'),
  Noto_Sans_Telugu: () =>
    import('@fontsource-variable/noto-sans-telugu/files/noto-sans-telugu-telugu-wght-normal.woff2?inline'),
  Noto_Serif_Telugu: () =>
    import('@fontsource-variable/noto-serif-telugu/files/noto-serif-telugu-telugu-wght-normal.woff2?inline'),
  Noto_Sans_Kannada: () =>
    import('@fontsource-variable/noto-sans-kannada/files/noto-sans-kannada-kannada-wght-normal.woff2?inline'),
  Noto_Serif_Kannada: () =>
    import('@fontsource-variable/noto-serif-kannada/files/noto-serif-kannada-kannada-wght-normal.woff2?inline'),
  Noto_Sans_Odia: () =>
    import('@fontsource-variable/noto-sans-oriya/files/noto-sans-oriya-oriya-wght-normal.woff2?inline'),
  Noto_Serif_Odia: () =>
    import('@fontsource-variable/noto-serif-oriya/files/noto-serif-oriya-oriya-wght-normal.woff2?inline'),
  Noto_Sans_Malayalam: () =>
    import('@fontsource-variable/noto-sans-malayalam/files/noto-sans-malayalam-malayalam-wght-normal.woff2?inline'),
  Noto_Serif_Malayalam: () =>
    import('@fontsource-variable/noto-serif-malayalam/files/noto-serif-malayalam-malayalam-wght-normal.woff2?inline'),
  Nirmala_UI: () => import('~/fonts/regular/woff2/Nirmala_UI.woff2?inline'),
  Adobe_Devanagari: () => import('~/fonts/regular/woff2/Adobe_Devanagari.woff2?inline'),
  Adobe_Telugu: () => import('~/fonts/regular/woff2/Adobe_Telugu.woff2?inline')
} satisfies Record<FontFamily, () => Promise<FontModule>>;

const LABEL_FAMILY = 'HarnessLabel';
const LABEL_FONTS = [
  () => import('@fontsource/roboto/files/roboto-latin-600-normal.woff2?inline'),
  () => import('@fontsource/roboto/files/roboto-latin-700-normal.woff2?inline')
];

const isGlyphFont = (family: string): family is FontFamily => family in GLYPH_FONTS;

async function register(load: () => Promise<FontModule>, family: string) {
  const { default: dataUrl } = await load();
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (!GlobalFonts.register(Buffer.from(base64, 'base64'), family)) {
    throw new Error(`Could not load the ${family} font`);
  }
}

const loads = new Map<string, Promise<void>>();

function once(key: string, run: () => Promise<void>): Promise<void> {
  let load = loads.get(key);
  if (!load) {
    load = run();
    load.catch(() => loads.delete(key));
    loads.set(key, load);
  }
  return load;
}

const loadLabelFont = () =>
  once(LABEL_FAMILY, async () => {
    for (const load of LABEL_FONTS) await register(load, LABEL_FAMILY);
  });

export const serverCanvasEnv: CanvasEnv = {
  createCanvas(width, height) {
    // SAFETY: @napi-rs/canvas implements the HTMLCanvasElement / 2D context surface the harness
    // uses (2D context, ImageData, Path2D fills, drawImage of another canvas, toDataURL).
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Skia canvas standing in for the DOM type
    return createCanvas(width, height) as unknown as HTMLCanvasElement;
  },
  // SAFETY: same Path2D surface (constructed from SVG path data, passed to ctx.fill).
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Skia Path2D standing in for the DOM type
  createPath: (svgPath) => new Path2D(svgPath) as unknown as globalThis.Path2D,
  async loadGlyphFont(family) {
    if (!isGlyphFont(family)) throw new Error(`Unknown font family ${family}`);
    await Promise.all([once(family, () => register(GLYPH_FONTS[family], family)), loadLabelFont()]);
  },
  labelFamily: LABEL_FAMILY
};

/**
 * The canvas the harness draws with: the DOM in the browser (apply-dialog previews) and
 * @napi-rs/canvas on the server (the agent's tools). Both are Skia + HarfBuzz underneath, so the
 * glyph renders the same in either.
 */
export type CanvasEnv = {
  createCanvas(width: number, height: number): HTMLCanvasElement;
  createPath(svgPath: string): Path2D;
  /** Make a gesture font drawable under its family key (e.g. `Nirmala_UI`). */
  loadGlyphFont(family: string): Promise<void>;
  /** CSS font-family list for the labels, grid numbers and ids on the harness images. */
  labelFamily: string;
};

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return ctx;
}

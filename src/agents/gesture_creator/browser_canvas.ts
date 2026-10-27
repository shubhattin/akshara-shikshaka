import { FONT_LIST } from '~/state/font_list';
import type { CanvasEnv } from './canvas_env';

const fontLoads = new Map<string, Promise<void>>();

/** Load a gesture font as a FontFace under its family key, like the editor does. */
function loadGlyphFont(family: string): Promise<void> {
  let load = fontLoads.get(family);
  if (!load) {
    const entry = Object.values(FONT_LIST)
      .flat()
      .find((font) => font?.font_family === family);
    if (!entry) return Promise.reject(new Error(`Unknown font family ${family}`));
    load = new FontFace(family, `url(${entry.url})`).load().then((face) => {
      document.fonts.add(face);
    });
    load.catch(() => fontLoads.delete(family));
    fontLoads.set(family, load);
  }
  return load;
}

export const browserCanvasEnv: CanvasEnv = {
  createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  createPath: (svgPath) => new Path2D(svgPath),
  loadGlyphFont,
  labelFamily: 'ui-sans-serif, system-ui, sans-serif'
};

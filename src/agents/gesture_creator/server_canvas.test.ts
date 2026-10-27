import { describe, expect, it } from 'vitest';
import { createGestureHarness } from './harness';
import { rasterizeGlyph } from './glyph_raster';
import { serverCanvasEnv } from './server_canvas.server';

const KA = {
  id: 1,
  uuid: '00000000-0000-0000-0000-000000000001',
  text: 'क',
  script_id: 1,
  font_family: 'Nirmala_UI',
  font_size: 18,
  // SAFETY: literal pair matches the fixed 2-tuple shape of text_center_offset.
  text_center_offset: [0, 0] as [number, number],
  gestures: []
};

const PNG = /^data:image\/png;base64,/;

describe('server canvas', () => {
  it('renders a glyph from the bundled font, centred on the canvas', async () => {
    const mask = await rasterizeGlyph(KA, serverCanvasEnv);
    let ink = 0;
    let sx = 0;
    for (let i = 0; i < mask.data.length; i++) {
      if (!mask.data[i]) continue;
      ink++;
      sx += i % mask.width;
    }
    expect(ink).toBeGreaterThan(20_000);
    // roughly centred on the 800 px raster (the ink centroid of क sits a little off-centre)
    expect(Math.abs(sx / ink - mask.width / 2)).toBeLessThan(40);
  });

  it('runs inspect and trace end to end with images', async () => {
    const harness = createGestureHarness({
      env: serverCanvasEnv,
      loadGesture: async () => KA,
      findTrace: () => undefined
    });
    const signal = new AbortController().signal;
    const inspected = await harness.inspect({ gesture_id: 1 }, signal);
    expect(inspected.nodes.length).toBeGreaterThan(2);
    expect(inspected.edges.length).toBeGreaterThan(2);
    expect(inspected.images.glyph).toMatch(PNG);
    expect(inspected.images.skeleton).toMatch(PNG);

    const strokes = inspected.edges.map((edge) => ({ path: [edge.from, edge.id, edge.to] }));
    const traced = await harness.trace({ gesture_id: 1, strokes }, signal);
    expect(traced.strokes).toHaveLength(inspected.edges.length);
    expect(traced.coverage).toBeGreaterThan(0.9);
    expect(traced.images.strokes).toMatch(PNG);
    expect(traced.images.order).toMatch(PNG);
  });

  it('rejects a font it does not bundle', async () => {
    await expect(serverCanvasEnv.loadGlyphFont('Comic_Sans')).rejects.toThrow(
      'Unknown font family'
    );
  });
});

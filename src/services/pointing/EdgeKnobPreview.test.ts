import { describe, expect, test } from 'vitest';
import { edgeKnobPreview, sameZone, zoneRects } from './EdgeKnobPreview';

describe('EdgeKnobPreview', () => {
  test('zones follow the edge width and tile the border', () => {
    const rects = zoneRects(20);
    expect(rects).toHaveLength(8);
    const left = rects.find((r) =>
      sameZone(r.zone, { kind: 'edge', index: 0 })
    )!;
    expect(left).toMatchObject({ x0: 0, x1: 0.2, y0: 0.2, y1: 0.8 });
    const br = rects.find((r) =>
      sameZone(r.zone, { kind: 'corner', index: 3 })
    )!;
    expect(br).toMatchObject({ x0: 0.8, y0: 0.8, x1: 1, y1: 1 });
  });

  test('the selected zone and the values are shared', () => {
    edgeKnobPreview.setZone({ kind: 'corner', index: 2 });
    expect(edgeKnobPreview.get().zone).toEqual({ kind: 'corner', index: 2 });
    edgeKnobPreview.setValues(null);
    expect(edgeKnobPreview.get().values).toBeNull();
  });
});

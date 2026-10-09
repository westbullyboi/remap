import KeyModel from '../../../models/KeyModel';
import KeyboardModel from '../../../models/KeyboardModel';
import definition from '../../../../keyboards/matrix-split42/matrix-split42.json';
import {
  fitDistance,
  focusView,
  key3D,
  keyBounds,
  overviewView,
  plates,
  unionBounds,
} from './Keyboard3DGeometry';

describe('Keyboard3DGeometry', () => {
  test('a plain key is centered on its footprint', () => {
    const key = key3D(new KeyModel({ w: 2 }, '0,0', 1, 3, '#cccccc'));
    expect(key.x).toBeCloseTo(2);
    expect(key.z).toBeCloseTo(3.5);
    expect(key.w).toEqual(2);
    expect(key.d).toEqual(1);
    expect(key.angle).toEqual(0);
  });

  test('a rotated key turns around the KLE rotation origin', () => {
    // 90 degrees clockwise around (0, 0): the center (0.5, 0.5) moves to
    // (-0.5, 0.5) on screen.
    const key = key3D(new KeyModel(null, '0,0', 0, 0, '#cccccc', 90, 0, 0));
    expect(key.x).toBeCloseTo(-0.5);
    expect(key.z).toBeCloseTo(0.5);
    expect(key.angle).toBeCloseTo(-Math.PI / 2);
  });

  test('rotated footprints get wider bounds', () => {
    const key = key3D(new KeyModel({ w: 2 }, '0,0', 0, 0, '#cccccc', 90));
    const b = keyBounds(key);
    expect(b.maxX - b.minX).toBeCloseTo(1);
    expect(b.maxZ - b.minZ).toBeCloseTo(2);
  });

  test('the Matrix Split 42 gets one plate per half', () => {
    const model = new KeyboardModel(definition.layouts.keymap as any);
    const keys = model
      .getKeymap()
      .keymaps.filter((k) => !k.isDecal)
      .map(key3D);
    const list = plates(keys);
    expect(list.length).toEqual(2);
    expect(list[0].keys.length).toEqual(21);
    expect(list[1].keys.length).toEqual(21);
    expect(list[0].maxX).toBeLessThan(list[1].minX);
  });

  test('fitDistance grows with the area and the narrower aspect', () => {
    const wide = fitDistance(10, 4, 35, 2, 0.6);
    expect(fitDistance(20, 4, 35, 2, 0.6)).toBeGreaterThan(wide);
    expect(fitDistance(10, 4, 35, 1, 0.6)).toBeGreaterThan(wide);
  });

  test('the side window moves the target right and the camera back', () => {
    const bounds = unionBounds([{ minX: 0, maxX: 14, minZ: 0, maxZ: 5 }]);
    const full = overviewView(bounds, 35, 2, 0.6);
    const side = overviewView(bounds, 35, 2, 0.6, 0.4);
    expect(full.targetX).toBeCloseTo(7);
    expect(side.targetX).toBeGreaterThan(full.targetX);
    expect(side.distance).toBeGreaterThan(full.distance);
  });

  test('focusView looks at the key from closer than the overview', () => {
    const key = key3D(new KeyModel(null, '0,0', 3, 1, '#cccccc'));
    const bounds = unionBounds([{ minX: 0, maxX: 14, minZ: 0, maxZ: 5 }]);
    const focus = focusView(key, 35, 2, 0.6);
    expect(focus.targetX).toBeCloseTo(3.5);
    expect(focus.targetZ).toBeCloseTo(1.5);
    expect(focus.distance).toBeLessThan(
      overviewView(bounds, 35, 2, 0.6).distance
    );
  });
});

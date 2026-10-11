import { describe, expect, test } from 'vitest';
import { hsvToRgb, keyKind, LedKey, ledColor } from './LightingPreview';
import { RGB_MATRIX_EFFECTS } from './RgbMatrix';

const effect = (id: string) =>
  RGB_MATRIX_EFFECTS.findIndex((e) => e.id === id) + 1;
const rgb = (id: string, extra = {}) => ({
  brightness: 255,
  effect: effect(id),
  speed: 128,
  hue: 0,
  sat: 255,
  ...extra,
});
const key = (px: number, code = 0x04): LedKey => ({
  px,
  py: 0.5,
  code,
  seed: px,
});

describe('LightingPreview', () => {
  test('HSV to RGB like QMK (0-255)', () => {
    expect(hsvToRgb(0, 255, 255)).toEqual([1, 0, 0]);
    expect(hsvToRgb(85, 255, 255)[1]).toBeCloseTo(1);
    expect(hsvToRgb(0, 0, 128)).toEqual([128 / 255, 128 / 255, 128 / 255]);
  });

  test('solid color, and dark when the lighting is off', () => {
    expect(ledColor(key(0.2), 0, rgb('SOLID_COLOR'), 0, 0, null)).toEqual([
      1, 0, 0,
    ]);
    expect(
      ledColor(key(0.2), 0, { ...rgb('SOLID_COLOR'), effect: 0 }, 0, 0, null)
    ).toBeNull();
    expect(ledColor(key(0.2), 0, null, 0, 0, null)).toBeNull();
  });

  test('the layer LED color fills the keyboard; 1 is off', () => {
    const blue = ledColor(key(0.2), 0, rgb('CYCLE_ALL'), 1, 5, null)!;
    expect(blue[2]).toBeCloseTo(1);
    expect(ledColor(key(0.2), 0, rgb('CYCLE_ALL'), 1, 1, null)).toBeNull();
  });

  test('effects move over time and across the keyboard', () => {
    const cycle = rgb('CYCLE_LEFT_RIGHT');
    expect(ledColor(key(0.1), 0, cycle, 0, 0, null)).not.toEqual(
      ledColor(key(0.6), 0, cycle, 0, 0, null)
    );
    const breathing = rgb('BREATHING');
    const a = ledColor(key(0.5), 0, breathing, 0, 0, null)!;
    const b = ledColor(key(0.5), 0.7, breathing, 0, 0, null)!;
    expect(a[0]).not.toBeCloseTo(b[0]);
  });

  test('key guide: unassigned keys dim, assigned keys by kind', () => {
    const guide = { mode: 1, colorMode: 1, dim: 0 };
    // layer 0 with "while a layer is on": no guide
    expect(
      ledColor(key(0.5, 0x01), 0, rgb('SOLID_COLOR'), 0, 0, guide)
    ).toEqual([1, 0, 0]);
    // layer 1: transparent key dark, modifier blue
    expect(
      ledColor(key(0.5, 0x01), 0, rgb('SOLID_COLOR'), 1, 0, guide)
    ).toBeNull();
    const mod = ledColor(key(0.5, 0xe0), 0, rgb('SOLID_COLOR'), 1, 0, guide)!;
    expect(mod[2]).toBeCloseTo(1);
    expect(keyKind(0x5221)).toEqual('layer');
    expect(keyKind(0xa8)).toEqual('media');
  });
});

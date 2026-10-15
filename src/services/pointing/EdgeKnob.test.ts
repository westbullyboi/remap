import { describe, expect, test } from 'vitest';
import { matchPair, PAIR_PRESETS, presetKeycodes } from './EdgeKnob';

const preset = (id: string) => PAIR_PRESETS.find((p) => p.id === id)!;

describe('EdgeKnob presets', () => {
  test('volume goes up when sliding up a side edge', () => {
    // [moving up, moving down]
    expect(presetKeycodes(preset('volume'), 'sideEdge', false)).toEqual([
      0x00a9, 0x00aa,
    ]);
  });
  test('volume goes up to the right / clockwise elsewhere', () => {
    // [left or counter-clockwise, right or clockwise]
    expect(presetKeycodes(preset('volume'), 'other', false)).toEqual([
      0x00aa, 0x00a9,
    ]);
  });
  test('motion presets keep their order; reverse swaps', () => {
    expect(presetKeycodes(preset('scrollV'), 'sideEdge', false)).toEqual([
      0x00d9, 0x00da,
    ]);
    expect(presetKeycodes(preset('scrollV'), 'sideEdge', true)).toEqual([
      0x00da, 0x00d9,
    ]);
  });
  test('Ctrl + wheel zoom: counter-clockwise zooms out', () => {
    expect(presetKeycodes(preset('zoomWheel'), 'other', false)).toEqual([
      0x01da, 0x01d9,
    ]);
  });
  test('zoom uses the keypad keys (any keyboard layout)', () => {
    // Ctrl + keypad - / Ctrl + keypad +; counter-clockwise zooms out
    expect(presetKeycodes(preset('zoom'), 'other', false)).toEqual([
      0x0156, 0x0157,
    ]);
    // knobs set before still show as the US-layout zoom
    const m = matchPair([0x012d, 0x012e], 'other');
    expect(m.kind === 'preset' && m.preset.id).toBe('zoomUs');
  });
  test('stored keycodes are recognised', () => {
    expect(matchPair([0, 0], 'other')).toEqual({ kind: 'none' });
    const m = matchPair([0x00aa, 0x00a9], 'sideEdge');
    expect(m.kind === 'preset' && m.preset.id === 'volume' && m.reversed).toBe(
      true
    );
    expect(matchPair([0x0004, 0x0005], 'other').kind).toBe('custom');
  });

  test('virtual desktop presets', () => {
    expect(presetKeycodes(preset('desktops'), 'other', false)).toEqual([
      0x0950, 0x094f,
    ]);
    expect(matchPair([0x014f, 0x0150], 'other')).toEqual({
      kind: 'preset',
      preset: preset('desktopsMac'),
      reversed: true,
    });
  });
});

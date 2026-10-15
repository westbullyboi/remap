import { describe, expect, test } from 'vitest';
import { IKeyboard } from '../hid/Hid';
import { fetchKnobExtras, KnobExtras, knobExtrasWrites } from './KnobExtras';

function fakeKeyboard(values: { [id: number]: number } | null): IKeyboard {
  return {
    fetchCustomValue: async (id: number) => {
      if (!values || !(id in values)) return { success: true, unhandled: true };
      return { success: true, value: values[id] };
    },
  } as unknown as IKeyboard;
}

const base: KnobExtras = {
  modes: [
    [0, 0],
    [0, 0],
  ],
  accel: [0, 0],
  holdKc: [0, 0],
  doubleKc: [0, 0],
  holdMs: 400,
  doubleMs: 250,
  bar: true,
  layers: 4,
  switchMs: 800,
};

describe('KnobExtras', () => {
  test('reads r32 values', async () => {
    const r = await fetchKnobExtras(
      fakeKeyboard({
        0xbc: 1,
        0xbd: 2,
        0xbe: 0,
        0xbf: 0,
        0xc0: 2,
        0xc1: 0,
        0xc2: 0x00a8,
        0xc3: 0,
        0xc4: 0,
        0xc5: 0x0029,
        0xc6: 40,
        0xc7: 25,
        0xc8: 1,
        0xc9: 4,
        0xca: 80,
      })
    );
    expect(r).toEqual({
      modes: [
        [1, 2],
        [0, 0],
      ],
      accel: [2, 0],
      holdKc: [0xa8, 0],
      doubleKc: [0, 0x29],
      holdMs: 400,
      doubleMs: 250,
      bar: true,
      layers: 4,
      switchMs: 800,
    });
  });

  test('older firmware', async () => {
    expect(await fetchKnobExtras(fakeKeyboard(null))).toBe(null);
  });

  test('writes only what changed', () => {
    const to: KnobExtras = {
      ...base,
      modes: [
        [0, 2],
        [1, 0],
      ],
      holdKc: [0, 0x7a],
      holdMs: 500,
      bar: false,
    };
    expect(knobExtrasWrites(base, to)).toEqual([
      [0xbd, 2, 1],
      [0xbe, 1, 1],
      [0xc4, 0x7a, 2],
      [0xc6, 50, 1],
      [0xc8, 0, 1],
    ]);
    expect(knobExtrasWrites(base, base)).toEqual([]);
  });
});

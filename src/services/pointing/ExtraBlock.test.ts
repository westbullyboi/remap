import { describe, expect, test } from 'vitest';
import { IKeyboard } from '../hid/Hid';
import { fetchWindowHolds, windowHoldIds } from './ExtraBlock';

describe('ExtraBlock', () => {
  test('hold value IDs', () => {
    expect(windowHoldIds(0, false)).toEqual([0xd5, 0xd6]);
    expect(windowHoldIds(0, true)).toEqual([0xd7, 0xd8]);
    expect(windowHoldIds(5, true)).toEqual([0xeb, 0xec]);
  });

  test('reads the holds; null on older firmware', async () => {
    const kb = (handled: boolean) =>
      ({
        fetchCustomValue: async (id: number) =>
          handled
            ? { success: true, value: id === 0xd5 ? 0x850 : 0 }
            : { success: true, unhandled: true },
      }) as unknown as IKeyboard;
    const r = await fetchWindowHolds(kb(true), 2);
    expect(r).toEqual([
      [
        [0x850, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [0, 0],
      ],
    ]);
    expect(await fetchWindowHolds(kb(false), 2)).toBe(null);
  });
});

import { describe, expect, test } from 'vitest';
import { IKeyboard } from '../hid/Hid';
import { fetchCtrlGuiSwap, swapOffWrites } from './CtrlGuiSwap';

function fakeKeyboard(values: { [id: number]: number }): IKeyboard {
  return {
    fetchCustomValue: async (id: number) =>
      id in values
        ? { success: true, value: values[id] }
        : { success: true, unhandled: true },
  } as unknown as IKeyboard;
}

describe('CtrlGuiSwap', () => {
  test('r36: swapped by the saved setting', async () => {
    const r = await fetchCtrlGuiSwap(fakeKeyboard({ 0xa5: 0, 0xd1: 1 | 4 }));
    expect(r).toEqual({
      swapped: true,
      byOsSetting: false,
      bySavedSetting: true,
      activeSet: 0,
    });
  });

  test('before r36: the per-OS swap of the set in use', async () => {
    expect(
      await fetchCtrlGuiSwap(fakeKeyboard({ 0xa5: 0, 0xa3: 0, 0xa6: 1 }))
    ).toEqual({
      swapped: true,
      byOsSetting: true,
      bySavedSetting: null,
      activeSet: 0,
    });
    // Another set edited: not known.
    expect(
      await fetchCtrlGuiSwap(fakeKeyboard({ 0xa5: 1, 0xa3: 0, 0xa6: 1 }))
    ).toBe(null);
    // Before r22.
    expect(await fetchCtrlGuiSwap(fakeKeyboard({}))).toBe(null);
  });

  test('turning it off', () => {
    const swap = {
      swapped: true,
      byOsSetting: true,
      bySavedSetting: true,
      activeSet: 1,
    };
    expect(swapOffWrites(swap, 0)).toEqual([
      [0xa3, 1],
      [0xa6, 0],
      [0xa3, 0],
      [0xd1, 0],
    ]);
    expect(swapOffWrites({ ...swap, byOsSetting: false }, 1)).toEqual([
      [0xd1, 0],
    ]);
  });
});

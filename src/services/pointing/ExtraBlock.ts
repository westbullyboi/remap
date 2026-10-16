import { IKeyboard } from '../hid/Hid';

// Firmware r37 (matrix_pointing.c, mp_extra_t): home row marks, the screen
// lock after no input and the window keys' hold shortcuts.
export const EXTRA_REVISION = 37;
export const HOME_LED_ID = 0xd2; // % brightness, 0 = off
export const HOME_LED_COLOR_ID = 0xd3; // 0 = the lighting color, 2.. = layer colors
export const LOCK_MINUTES_ID = 0xd4; // 0 = off

// Window key `key` held, on a PC (mac false) or a Mac: two shortcuts sent
// one after the other (0 = none).
export function windowHoldIds(key: number, mac: boolean): [number, number] {
  const first = 0xd5 + (key * 2 + (mac ? 1 : 0)) * 2;
  return [first, first + 1];
}

export const LOCK_CHOICES = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

// One byte; null on older firmware. Throws when reading fails.
export async function readExtraByte(
  keyboard: IKeyboard,
  id: number
): Promise<number | null> {
  const r = await keyboard.fetchCustomValue(id, 1);
  if (!r.success) throw new Error(r.error || 'read failed');
  if (r.unhandled || r.value === undefined) return null;
  return r.value;
}

// The hold shortcuts [key][0 PC, 1 Mac] = [first, then]; null on older
// firmware.
export async function fetchWindowHolds(
  keyboard: IKeyboard,
  keys: number
): Promise<number[][][] | null> {
  const all: number[][][] = [];
  for (let k = 0; k < keys; k++) {
    const pair: number[][] = [];
    for (const mac of [false, true]) {
      const codes: number[] = [];
      for (const id of windowHoldIds(k, mac)) {
        const r = await keyboard.fetchCustomValue(id, 2);
        if (!r.success) throw new Error(r.error || 'read failed');
        if (r.unhandled || r.value === undefined) return null;
        codes.push(r.value);
      }
      pair.push(codes);
    }
    all.push(pair);
  }
  return all;
}

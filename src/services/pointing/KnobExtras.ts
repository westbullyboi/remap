import { IKeyboard } from '../hid/Hid';

// Knob settings of firmware r32 (matrix_pointing.c, mp_knob_cfg_t), values
// 0xBC..0xCA on the VIA custom channel. Knob 0 is the left knob.
export const KNOB_MODE_IDS = [
  [0xbc, 0xbd], // left: turning, while pushed
  [0xbe, 0xbf], // right
];
export const KNOB_ACCEL_IDS = [0xc0, 0xc1];
export const KNOB_HOLD_IDS = [0xc2, 0xc4];
export const KNOB_DOUBLE_IDS = [0xc3, 0xc5];
export const KNOB_HOLD_MS_ID = 0xc6;
export const KNOB_DOUBLE_MS_ID = 0xc7;
export const KNOB_BAR_ID = 0xc8;
export const KNOB_LAYERS_ID = 0xc9;
export const KNOB_SWITCH_MS_ID = 0xca;

export const KNOB_REVISION = 32;

// What turning does (MP_KNOB_*).
export const KNOB_MODES: { value: number; label: string }[] = [
  { value: 0, label: 'Send the keys' },
  { value: 1, label: 'Switch windows (Alt + Tab / Cmd + Tab)' },
  { value: 2, label: 'Select the layer' },
];

export const KNOB_ACCELS: { value: number; label: string }[] = [
  { value: 0, label: 'No acceleration' },
  { value: 1, label: 'Weak' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Strong' },
];

export type KnobExtras = {
  // [knob][0 turning, 1 while pushed]
  modes: number[][];
  accel: number[];
  holdKc: number[];
  doubleKc: number[];
  holdMs: number; // ms
  doubleMs: number; // ms
  bar: boolean;
  layers: number;
  switchMs: number; // ms
};

// The value writes for one changed field: [id, value, size].
export type KnobWrite = [number, number, 1 | 2];

// null: the firmware is older than r32. Throws when reading fails.
export async function fetchKnobExtras(
  keyboard: IKeyboard
): Promise<KnobExtras | null> {
  const read = async (id: number, size: 1 | 2) => {
    const r = await keyboard.fetchCustomValue(id, size);
    if (!r.success) throw new Error(r.error || 'read failed');
    if (r.unhandled || r.value === undefined) return null;
    return r.value;
  };
  const first = await read(KNOB_MODE_IDS[0][0], 1);
  if (first === null) return null;
  const v = async (id: number, size: 1 | 2 = 1) => (await read(id, size)) ?? 0;
  return {
    modes: [
      [first, await v(KNOB_MODE_IDS[0][1])],
      [await v(KNOB_MODE_IDS[1][0]), await v(KNOB_MODE_IDS[1][1])],
    ],
    accel: [await v(KNOB_ACCEL_IDS[0]), await v(KNOB_ACCEL_IDS[1])],
    holdKc: [await v(KNOB_HOLD_IDS[0], 2), await v(KNOB_HOLD_IDS[1], 2)],
    doubleKc: [await v(KNOB_DOUBLE_IDS[0], 2), await v(KNOB_DOUBLE_IDS[1], 2)],
    holdMs: (await v(KNOB_HOLD_MS_ID)) * 10,
    doubleMs: (await v(KNOB_DOUBLE_MS_ID)) * 10,
    bar: (await v(KNOB_BAR_ID)) === 1,
    layers: await v(KNOB_LAYERS_ID),
    switchMs: (await v(KNOB_SWITCH_MS_ID)) * 10,
  };
}

// The writes that turn `from` into `to`.
export function knobExtrasWrites(
  from: KnobExtras,
  to: KnobExtras
): KnobWrite[] {
  const w: KnobWrite[] = [];
  for (let k = 0; k < 2; k++) {
    for (let p = 0; p < 2; p++) {
      if (from.modes[k][p] !== to.modes[k][p]) {
        w.push([KNOB_MODE_IDS[k][p], to.modes[k][p], 1]);
      }
    }
    if (from.accel[k] !== to.accel[k]) {
      w.push([KNOB_ACCEL_IDS[k], to.accel[k], 1]);
    }
    if (from.holdKc[k] !== to.holdKc[k]) {
      w.push([KNOB_HOLD_IDS[k], to.holdKc[k], 2]);
    }
    if (from.doubleKc[k] !== to.doubleKc[k]) {
      w.push([KNOB_DOUBLE_IDS[k], to.doubleKc[k], 2]);
    }
  }
  const ms = (v: number) => Math.round(v / 10);
  if (from.holdMs !== to.holdMs) w.push([KNOB_HOLD_MS_ID, ms(to.holdMs), 1]);
  if (from.doubleMs !== to.doubleMs) {
    w.push([KNOB_DOUBLE_MS_ID, ms(to.doubleMs), 1]);
  }
  if (from.bar !== to.bar) w.push([KNOB_BAR_ID, to.bar ? 1 : 0, 1]);
  if (from.layers !== to.layers) w.push([KNOB_LAYERS_ID, to.layers, 1]);
  if (from.switchMs !== to.switchMs) {
    w.push([KNOB_SWITCH_MS_ID, ms(to.switchMs), 1]);
  }
  return w;
}

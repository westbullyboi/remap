import { IKeyboard } from '../hid/Hid';

// Same settings on both halves (firmware revision 24): the half with the USB
// cable copies its EEPROM (keymap, macros, lighting, Matrix settings) to the
// other half when they differ, the newer one winning. Value 0xA7 (read):
// [state, USB half: 0 left, 1 right]; 0xA8 (write) answers state 4:
// 1 keep the USB half's settings, 2 keep the other half's (the keyboard then
// restarts with them).
export const MIRROR_STATE_ID = 0xa7;
export const MIRROR_CHOICE_ID = 0xa8;

export enum MirrorState {
  Off = 0,
  Alone = 1,
  Copying = 2,
  Same = 3,
  Ask = 4,
  OtherBuild = 5,
  // Copied twice and still different (revision 25): stopped until a change.
  Stuck = 6,
}

export type MirrorStatus = { state: MirrorState; usbSide: 'left' | 'right' };

// null: the firmware does not mirror the halves.
export async function fetchMirrorStatus(
  keyboard: IKeyboard
): Promise<MirrorStatus | null> {
  const r = await keyboard.fetchCustomValue(MIRROR_STATE_ID, 2);
  if (!r.success || r.unhandled || r.value === undefined) return null;
  return {
    state: (r.value >> 8) as MirrorState,
    usbSide: (r.value & 0xff) === 1 ? 'right' : 'left',
  };
}

export async function chooseMirrorSide(
  keyboard: IKeyboard,
  keep: 'usb' | 'other'
) {
  return keyboard.updateCustomValue(
    MIRROR_CHOICE_ID,
    keep === 'usb' ? 1 : 2,
    1
  );
}

// Touchpad movement fetched from the other half in the last second
// (firmware r28, value 0xA9): null on older firmware or when the
// touchpad is on the USB half (all zero).
export const MOTION_STATS_ID = 0xa9;
export type MotionStats = { ok: number; failed: number; frames: number };
export async function fetchMotionStats(
  keyboard: IKeyboard
): Promise<MotionStats | null> {
  const r = await keyboard.fetchCustomValue(MOTION_STATS_ID, 4);
  if (!r.success || r.unhandled || r.value === undefined) return null;
  const v = r.value >>> 0;
  const stats = {
    ok: (v >>> 24) & 0xff,
    failed: (v >>> 16) & 0xff,
    frames: v & 0xffff,
  };
  return stats.ok || stats.failed ? stats : null;
}

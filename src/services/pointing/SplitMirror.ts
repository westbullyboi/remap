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

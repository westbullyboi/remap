import { useSyncExternalStore } from 'react';
import { IKeyboard, IResult } from '../hid/Hid';

// Settings per OS (firmware revision 22): the keyboard keeps a second set
// of the keycodes that differ on a Mac (touchpad edges and corners, knob
// push-and-turn, 3-finger swipes) and "swap Ctrl and Cmd", and picks the set
// from the host OS it detects when USB connects. Values on the VIA custom
// channel (see firmware/qmk/matrix_pointing/matrix_pointing.c):
export const OS_ENABLED_ID = 0xa1; // 1 = use the Mac set on a Mac
export const OS_MODE_ID = 0xa2; // 0 by the detected OS, 1 always PC, 2 always Mac
export const OS_EDIT_ID = 0xa3; // set the per-OS values read / write (0 PC, 1 Mac)
export const OS_DETECTED_ID = 0xa4; // read-only, see DETECTED_OS
export const OS_ACTIVE_ID = 0xa5; // read-only: set in use (0 PC, 1 Mac)
export const OS_SWAP_ID = 0xa6; // swap Ctrl and GUI, for the edited set

export const DETECTED_OS = ['Unknown', 'Linux', 'Windows', 'macOS', 'iOS'];

export type OsProfileState = {
  enabled: boolean;
  mode: number;
  detected: number;
  active: number;
  // Swap Ctrl and GUI, in the edited set.
  swap: boolean;
};

export type FetchOsProfileResult = IResult & {
  // false: the firmware has no settings per OS.
  supported?: boolean;
  state?: OsProfileState;
};

async function read(keyboard: IKeyboard, id: number): Promise<number> {
  const r = await keyboard.fetchCustomValue(id, 1);
  if (!r.success) throw r;
  if (r.unhandled) throw { unhandled: true };
  return r.value!;
}

export async function fetchOsProfiles(
  keyboard: IKeyboard,
  edit: number
): Promise<FetchOsProfileResult> {
  try {
    const detected = await read(keyboard, OS_DETECTED_ID);
    const state: OsProfileState = {
      enabled: (await read(keyboard, OS_ENABLED_ID)) === 1,
      mode: await read(keyboard, OS_MODE_ID),
      detected,
      active: await read(keyboard, OS_ACTIVE_ID),
      swap: false,
    };
    // Make sure the keyboard edits the set shown (it starts with PC).
    await write(keyboard, OS_EDIT_ID, edit);
    state.swap = (await read(keyboard, OS_SWAP_ID)) === 1;
    return { success: true, supported: true, state };
  } catch (e) {
    const r = e as IResult & { unhandled?: boolean };
    if (r.unhandled) return { success: true, supported: false };
    return { success: false, error: r.error, cause: r.cause };
  }
}

async function write(keyboard: IKeyboard, id: number, value: number) {
  const r = await keyboard.updateCustomValue(id, value, 1);
  if (!r.success) throw r;
}

// Writes and saves one value.
export async function writeOsValue(
  keyboard: IKeyboard,
  id: number,
  value: number
): Promise<IResult> {
  const r = await keyboard.updateCustomValue(id, value, 1);
  if (!r.success) return r;
  return keyboard.saveCustomValues();
}

// Which set the settings windows edit, per connected keyboard (a keyboard
// starts with PC): the per-OS values read and written from the windows go
// to this set, and they reload when it changes.
let current: { keyboard: IKeyboard | null; edit: number } = {
  keyboard: null,
  edit: 0,
};
const listeners = new Set<() => void>();
export const osEditStore = {
  get: (keyboard: IKeyboard | null) =>
    current.keyboard === keyboard ? current.edit : 0,
  set(keyboard: IKeyboard | null, edit: number) {
    if (current.keyboard === keyboard && current.edit === edit) return;
    current = { keyboard, edit };
    listeners.forEach((l) => l());
  },
};
export function useOsEdit(keyboard: IKeyboard | null): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => osEditStore.get(keyboard)
  );
}

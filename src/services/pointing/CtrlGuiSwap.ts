import { IKeyboard } from '../hid/Hid';
import { OS_ACTIVE_ID, OS_EDIT_ID, OS_SWAP_ID } from './OsProfiles';

// Whether the keyboard swaps Ctrl with GUI (Win / Cmd): then a key set to
// Win sends Ctrl and the other way round. Two settings do it: the per-OS
// "Swap Ctrl and Cmd (Win)" (0xA6, firmware r22) and QMK's own swap saved
// in the keyboard (magic keycodes such as CG_SWAP), which firmware r36
// reports (0xD1: bit 0 swapped now, 1 by the per-OS setting, 2 by QMK's
// saved setting) and turns off (writing 0xD1).
export const SWAP_STATUS_ID = 0xd1;

export type CtrlGuiSwap = {
  swapped: boolean;
  byOsSetting: boolean;
  // null: the firmware cannot tell (before r36).
  bySavedSetting: boolean | null;
  // The per-OS set in use (0 PC, 1 Mac), for turning its swap off.
  activeSet: number;
};

async function readByte(keyboard: IKeyboard, id: number) {
  const r = await keyboard.fetchCustomValue(id, 1);
  if (!r.success || r.unhandled || r.value === undefined) return null;
  return r.value;
}

// null: not known (not Matrix firmware, or before r22).
export async function fetchCtrlGuiSwap(
  keyboard: IKeyboard
): Promise<CtrlGuiSwap | null> {
  const active = await readByte(keyboard, OS_ACTIVE_ID);
  if (active === null) return null;
  const status = await readByte(keyboard, SWAP_STATUS_ID);
  if (status !== null) {
    return {
      swapped: (status & 1) !== 0,
      byOsSetting: (status & 2) !== 0,
      bySavedSetting: (status & 4) !== 0,
      activeSet: active,
    };
  }
  // Before r36: the per-OS swap of the set in use (0xA6 reads the edited
  // set, so only when it is the one in use).
  const edit = await readByte(keyboard, OS_EDIT_ID);
  if (edit !== active) return null;
  const swap = await readByte(keyboard, OS_SWAP_ID);
  if (swap === null) return null;
  return {
    swapped: swap === 1,
    byOsSetting: swap === 1,
    bySavedSetting: null,
    activeSet: active,
  };
}

// The writes that turn the swap off: [id, value] in order.
export function swapOffWrites(
  swap: CtrlGuiSwap,
  editedSet: number
): [number, number][] {
  const writes: [number, number][] = [];
  if (swap.byOsSetting) {
    // 0xA6 writes the edited set: edit the set in use, then go back.
    if (editedSet !== swap.activeSet) {
      writes.push([OS_EDIT_ID, swap.activeSet]);
    }
    writes.push([OS_SWAP_ID, 0]);
    if (editedSet !== swap.activeSet) writes.push([OS_EDIT_ID, editedSet]);
  }
  if (swap.bySavedSetting) writes.push([SWAP_STATUS_ID, 0]);
  return writes;
}

export async function turnCtrlGuiSwapOff(
  keyboard: IKeyboard,
  swap: CtrlGuiSwap
): Promise<boolean> {
  const edit = (await readByte(keyboard, OS_EDIT_ID)) ?? 0;
  for (const [id, value] of swapOffWrites(swap, edit)) {
    const r = await keyboard.updateCustomValue(id, value, 1);
    if (!r.success) return false;
  }
  const saved = await keyboard.saveCustomValues();
  return saved.success;
}

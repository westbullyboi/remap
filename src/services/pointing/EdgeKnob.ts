import { IKeyboard, IResult } from '../hid/Hid';

// Touchpad edge sliders / corner taps and knob press-and-turn (Matrix
// firmware revision 12, values 0x80..0x91 on the custom channel). Keycodes
// are QMK keycodes (quantum/keycodes.h); the firmware sends plain keys with
// modifiers ((mods << 8) | key: Ctrl 1, Shift 2, Alt 4, GUI 8).

export const EDGE_WIDTH_ID = 0x80;
export const EDGE_STEP_ID = 0x81;
// Edges as the user sees the pad: 0 left, 1 right, 2 top, 3 bottom.
// Per edge two keycodes: [moving up / left, moving down / right].
export const EDGES = ['left', 'right', 'top', 'bottom'] as const;
export type Edge = (typeof EDGES)[number];
export const edgeKeycodeIds = (edge: number): [number, number] => [
  0x82 + edge * 2,
  0x83 + edge * 2,
];
// Corners: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
export const CORNERS = [
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight',
] as const;
export type Corner = (typeof CORNERS)[number];
export const cornerKeycodeId = (corner: number) => 0x8a + corner;
// Knobs: 0 left, 1 right. [counter-clockwise, clockwise] while pushed.
export const knobKeycodeIds = (knob: number): [number, number] => [
  0x8e + knob * 2,
  0x8f + knob * 2,
];

const CTL = 0x0100;
const SFT = 0x0200;
const GUI = 0x0800;

// A pair of keycodes for a slider or a knob.
// 'value' presets ([decrease, increase]) go up on a side edge moving up, and
// to the right / clockwise elsewhere; 'motion' presets ([back, forward]) go
// back moving up / left / counter-clockwise.
export type PairPreset = {
  id: string;
  label: string; // i18n key
  kind: 'value' | 'motion';
  pair: [number, number];
};

export const PAIR_PRESETS: PairPreset[] = [
  {
    id: 'volume',
    label: 'Volume',
    kind: 'value',
    pair: [0x00aa, 0x00a9],
  },
  {
    id: 'brightness',
    label: 'Screen brightness',
    kind: 'value',
    pair: [0x00be, 0x00bd],
  },
  {
    id: 'scrollV',
    label: 'Scroll up / down',
    kind: 'motion',
    pair: [0x00d9, 0x00da],
  },
  {
    id: 'scrollH',
    label: 'Scroll left / right',
    kind: 'motion',
    pair: [0x00db, 0x00dc],
  },
  // Ctrl + wheel zooms in browsers and most Windows apps on any keyboard
  // layout. Firmware r15+ holds Ctrl while it sends one whole notch.
  {
    id: 'zoomWheel',
    label: 'Zoom (Ctrl + wheel, firmware r15+)',
    kind: 'value',
    pair: [CTL | 0x00da, CTL | 0x00d9],
  },
  // Keypad + / - are the same on every keyboard layout (Ctrl + "=" is "^"
  // on a Japanese layout, so it did not zoom in there).
  {
    id: 'zoom',
    label: 'Zoom (Ctrl + keypad + / -)',
    kind: 'value',
    pair: [CTL | 0x0056, CTL | 0x0057],
  },
  {
    id: 'zoomUs',
    label: 'Zoom (Ctrl + = / -, US layout only)',
    kind: 'value',
    pair: [CTL | 0x002d, CTL | 0x002e],
  },
  {
    id: 'tabs',
    label: 'Switch tabs (Ctrl+Tab)',
    kind: 'motion',
    pair: [CTL | SFT | 0x002b, CTL | 0x002b],
  },
  // Virtual desktops: Windows' Ctrl + Win + arrows, macOS' Mission Control
  // "Move left / right a space" (Ctrl + arrows).
  {
    id: 'desktops',
    label: 'Virtual desktops (Ctrl+Win+← / →)',
    kind: 'motion',
    pair: [CTL | GUI | 0x0050, CTL | GUI | 0x004f],
  },
  {
    id: 'desktopsMac',
    label: 'Virtual desktops, Mac (Ctrl+← / →)',
    kind: 'motion',
    pair: [CTL | 0x0050, CTL | 0x004f],
  },
  {
    id: 'undo',
    label: 'Undo / redo (Ctrl+Z / Ctrl+Y)',
    kind: 'motion',
    pair: [CTL | 0x001d, CTL | 0x001c],
  },
  {
    id: 'undoMac',
    label: 'Undo / redo (Cmd+Z / Cmd+Shift+Z)',
    kind: 'motion',
    pair: [GUI | 0x001d, GUI | SFT | 0x001d],
  },
  {
    id: 'tracks',
    label: 'Previous / next track',
    kind: 'motion',
    pair: [0x00ac, 0x00ab],
  },
  {
    id: 'arrowsV',
    label: 'Arrow keys up / down',
    kind: 'motion',
    pair: [0x0052, 0x0051],
  },
  {
    id: 'arrowsH',
    label: 'Arrow keys left / right',
    kind: 'motion',
    pair: [0x0050, 0x004f],
  },
  {
    id: 'pages',
    label: 'Page up / down',
    kind: 'motion',
    pair: [0x004b, 0x004e],
  },
];

export type PairOrientation = 'sideEdge' | 'other';

// The two keycodes to store for a preset ([up/left/ccw, down/right/cw]).
export function presetKeycodes(
  preset: PairPreset,
  orientation: PairOrientation,
  reversed: boolean
): [number, number] {
  let [a, b] = preset.pair;
  if (preset.kind === 'value' && orientation === 'sideEdge') [a, b] = [b, a];
  return reversed ? [b, a] : [a, b];
}

export type PairChoice =
  | { kind: 'none' }
  | { kind: 'preset'; preset: PairPreset; reversed: boolean }
  | { kind: 'custom'; keycodes: [number, number] };

export function matchPair(
  keycodes: [number, number],
  orientation: PairOrientation
): PairChoice {
  if (keycodes[0] === 0 && keycodes[1] === 0) return { kind: 'none' };
  for (const preset of PAIR_PRESETS) {
    for (const reversed of [false, true]) {
      const [a, b] = presetKeycodes(preset, orientation, reversed);
      if (a === keycodes[0] && b === keycodes[1]) {
        return { kind: 'preset', preset, reversed };
      }
    }
  }
  return { kind: 'custom', keycodes };
}

// Single keycodes for corner taps.
export const CORNER_OPTIONS: { code: number; label: string }[] = [
  { code: 0x0000, label: 'None' },
  { code: 0x0029, label: 'Esc' },
  { code: 0x00a8, label: 'Mute' },
  { code: 0x00ae, label: 'Play / pause' },
  { code: 0x00d3, label: 'Middle click' },
  { code: 0x00d2, label: 'Right click' },
  { code: 0x00b6, label: 'Browser back' },
  { code: 0x00b7, label: 'Browser forward' },
  { code: CTL | 0x0006, label: 'Copy (Ctrl+C)' },
  { code: CTL | 0x0019, label: 'Paste (Ctrl+V)' },
  { code: GUI | 0x0006, label: 'Copy (Cmd+C)' },
  { code: GUI | 0x0019, label: 'Paste (Cmd+V)' },
  { code: GUI | 0x0007, label: 'Show desktop' },
  { code: GUI | 0x002b, label: 'Task view' },
  { code: CTL | 0x0052, label: 'Mission Control' },
];

export type EdgeKnobValues = {
  edgeWidth: number; // % of the pad
  edgeStep: number; // % of the pad per keycode
  edges: [number, number][]; // per edge
  corners: number[];
  knobs: [number, number][];
};

export type FetchEdgeKnobResult = IResult & { values?: EdgeKnobValues };

export async function fetchEdgeKnob(
  keyboard: IKeyboard
): Promise<FetchEdgeKnobResult> {
  const read = async (id: number, size: 1 | 2) => {
    const r = await keyboard.fetchCustomValue(id, size);
    if (!r.success) throw r;
    if (r.unhandled) throw { success: false, error: 'unhandled' };
    return r.value!;
  };
  try {
    const values: EdgeKnobValues = {
      edgeWidth: await read(EDGE_WIDTH_ID, 1),
      edgeStep: await read(EDGE_STEP_ID, 1),
      edges: [],
      corners: [],
      knobs: [],
    };
    for (let e = 0; e < EDGES.length; e++) {
      const [a, b] = edgeKeycodeIds(e);
      values.edges.push([await read(a, 2), await read(b, 2)]);
    }
    for (let c = 0; c < CORNERS.length; c++) {
      values.corners.push(await read(cornerKeycodeId(c), 2));
    }
    for (let k = 0; k < 2; k++) {
      const [a, b] = knobKeycodeIds(k);
      values.knobs.push([await read(a, 2), await read(b, 2)]);
    }
    return { success: true, values };
  } catch (e) {
    const r = e as IResult;
    return { success: false, error: r.error, cause: r.cause };
  }
}

// Writes the given values (not saved until saveCustomValues()).
export async function writeEdgeKnobValues(
  keyboard: IKeyboard,
  entries: [number, number, 1 | 2][]
): Promise<IResult> {
  for (const [id, value, size] of entries) {
    const r = await keyboard.updateCustomValue(id, value, size);
    if (!r.success) return r;
  }
  return { success: true };
}

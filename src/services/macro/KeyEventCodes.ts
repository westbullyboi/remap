// KeyboardEvent.code → HID keyboard usage (USB HID Usage Tables, Keyboard /
// Keypad page 0x07), which is also the QMK basic keycode. For recording
// keys that do not type a character (modifiers, Enter, arrows, F keys...).
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const TABLE: { [code: string]: number } = {
  Enter: 0x28,
  NumpadEnter: 0x58,
  Escape: 0x29,
  Backspace: 0x2a,
  Tab: 0x2b,
  Space: 0x2c,
  Minus: 0x2d,
  Equal: 0x2e,
  BracketLeft: 0x2f,
  BracketRight: 0x30,
  Backslash: 0x31,
  Semicolon: 0x33,
  Quote: 0x34,
  Backquote: 0x35,
  Comma: 0x36,
  Period: 0x37,
  Slash: 0x38,
  CapsLock: 0x39,
  PrintScreen: 0x46,
  ScrollLock: 0x47,
  Pause: 0x48,
  Insert: 0x49,
  Home: 0x4a,
  PageUp: 0x4b,
  Delete: 0x4c,
  End: 0x4d,
  PageDown: 0x4e,
  ArrowRight: 0x4f,
  ArrowLeft: 0x50,
  ArrowDown: 0x51,
  ArrowUp: 0x52,
  ContextMenu: 0x65,
  IntlRo: 0x87,
  KanaMode: 0x88,
  IntlYen: 0x89,
  Convert: 0x8a,
  NonConvert: 0x8b,
  Lang1: 0x90,
  Lang2: 0x91,
  ControlLeft: 0xe0,
  ShiftLeft: 0xe1,
  AltLeft: 0xe2,
  MetaLeft: 0xe3,
  ControlRight: 0xe4,
  ShiftRight: 0xe5,
  AltRight: 0xe6,
  MetaRight: 0xe7,
};

export function hidUsageOf(code: string): number | null {
  if (code in TABLE) return TABLE[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return 0x04 + LETTERS.indexOf(m[1]);
  m = /^Digit([0-9])$/.exec(code);
  if (m) return m[1] === '0' ? 0x27 : 0x1e + Number(m[1]) - 1;
  m = /^F([0-9]+)$/.exec(code);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 12) return 0x3a + n - 1;
    if (n >= 13 && n <= 24) return 0x68 + n - 13;
  }
  return null;
}

export const isModifierUsage = (usage: number) =>
  usage >= 0xe0 && usage <= 0xe7;

// Names of the HID usages, for showing shortcuts (Ctrl + ←, ⌘M...).
const NAMES: { [usage: number]: string } = {
  0x28: 'Enter',
  0x29: 'Esc',
  0x2a: 'Backspace',
  0x2b: 'Tab',
  0x2c: 'Space',
  0x2d: '-',
  0x2e: '=',
  0x2f: '[',
  0x30: ']',
  0x31: '\\',
  0x33: ';',
  0x34: "'",
  0x35: '`',
  0x36: ',',
  0x37: '.',
  0x38: '/',
  0x39: 'Caps Lock',
  0x46: 'Print Screen',
  0x47: 'Scroll Lock',
  0x48: 'Pause',
  0x49: 'Insert',
  0x4a: 'Home',
  0x4b: 'Page Up',
  0x4c: 'Delete',
  0x4d: 'End',
  0x4e: 'Page Down',
  0x4f: '→',
  0x50: '←',
  0x51: '↓',
  0x52: '↑',
  0x58: 'Keypad Enter',
  0x65: 'Menu',
  0x87: 'Ro',
  0x88: 'Kana',
  0x89: 'Yen',
  0x8a: 'Henkan',
  0x8b: 'Muhenkan',
  0x90: 'Lang 1',
  0x91: 'Lang 2',
};

export function usageName(usage: number): string {
  if (usage >= 0x04 && usage <= 0x1d) return LETTERS[usage - 0x04];
  if (usage >= 0x1e && usage <= 0x26) return String(usage - 0x1e + 1);
  if (usage === 0x27) return '0';
  if (usage >= 0x3a && usage <= 0x45) return `F${usage - 0x3a + 1}`;
  if (usage >= 0x68 && usage <= 0x73) return `F${usage - 0x68 + 13}`;
  if (usage in NAMES) return NAMES[usage];
  return `0x${usage.toString(16).toUpperCase().padStart(2, '0')}`;
}

// Keys a shortcut can end with (no modifiers), in keyboard order.
export const SHORTCUT_KEY_USAGES: number[] = (() => {
  const list: number[] = [];
  for (let u = 0x04; u <= 0x27; u++) list.push(u); // A-Z, 1-0
  for (let u = 0x3a; u <= 0x45; u++) list.push(u); // F1-F12
  for (let u = 0x68; u <= 0x73; u++) list.push(u); // F13-F24
  list.push(0x50, 0x4f, 0x52, 0x51); // arrows
  list.push(0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x4c, 0x49, 0x4a, 0x4d, 0x4b, 0x4e);
  for (let u = 0x2d; u <= 0x38; u++) if (u !== 0x32) list.push(u);
  list.push(0x39, 0x46, 0x47, 0x48, 0x65, 0x58);
  list.push(0x87, 0x88, 0x89, 0x8a, 0x8b, 0x90, 0x91);
  return list;
})();

// QMK modifier bits of a shortcut keycode (modifiers << 8 | key).
export const MOD_CTRL = 0x01;
export const MOD_SHIFT = 0x02;
export const MOD_ALT = 0x04;
export const MOD_GUI = 0x08;

// A shortcut from a key press (KeyboardEvent fields); null when the key is
// a modifier alone or has no HID usage.
export function shortcutFromEvent(e: {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): number | null {
  const usage = hidUsageOf(e.code);
  if (usage === null || isModifierUsage(usage)) return null;
  let mods = 0;
  if (e.ctrlKey) mods |= MOD_CTRL;
  if (e.shiftKey) mods |= MOD_SHIFT;
  if (e.altKey) mods |= MOD_ALT;
  if (e.metaKey) mods |= MOD_GUI;
  return (mods << 8) | usage;
}

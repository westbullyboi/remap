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

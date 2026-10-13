import { IKeyboard, IResult } from '../hid/Hid';

// Feature flags declared in a keyboard definition's `customFeatures`.
// The editor only talks to the custom channel when the definition declares
// the feature, because a firmware without the handler answers `id_unhandled`
// and the request would never be matched.
export const FEATURE_TOUCHPAD = 'matrix_touchpad';
export const FEATURE_AUTO_MOUSE_LAYER = 'matrix_auto_mouse_layer';

// Value 0x00 is read-only and identifies firmware that implements this
// protocol. Any other answer (id_unhandled, or another custom handler that
// happens to use channel 0) means "not supported": nothing is read or written.
export const PROTOCOL_MAGIC_VALUE_ID = 0x00;
export const PROTOCOL_MAGIC = 0x4d58; // 'MX'

export type ProtocolSupport = 'supported' | 'unsupported' | 'error';

export async function probeProtocol(
  keyboard: IKeyboard
): Promise<ProtocolSupport> {
  const result = await keyboard.fetchCustomValue(PROTOCOL_MAGIC_VALUE_ID, 2);
  if (!result.success) return 'error';
  if (result.unhandled || result.value !== PROTOCOL_MAGIC) return 'unsupported';
  return 'supported';
}

// Writing any value to 0x7F asks the firmware to reboot into its bootloader
// (RP2040: BOOTSEL), so new firmware can be written over WebUSB.
export const BOOTLOADER_VALUE_ID = 0x7f;

export async function requestBootloader(
  keyboard: IKeyboard
): Promise<ProtocolSupport> {
  const support = await probeProtocol(keyboard);
  if (support !== 'supported') return support;
  const result = await keyboard.updateCustomValue(BOOTLOADER_VALUE_ID, 1, 1);
  return result.success ? 'supported' : 'error';
}

// 'keycode': a 16-bit QMK keycode (basic keycode with modifiers).
export type PointingSettingKind = 'switch' | 'range' | 'choice' | 'keycode';

export interface IPointingSettingDef<K extends string = string> {
  key: K;
  // Value ID on the VIA custom channel (channel 0).
  valueId: number;
  // Byte size on the wire (big endian when 2).
  size: 1 | 2;
  kind: PointingSettingKind;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
}

const def = <K extends string>(
  key: K,
  valueId: number,
  kind: PointingSettingKind,
  min: number,
  max: number,
  defaultValue: number,
  size: 1 | 2 = 1,
  step?: number
): IPointingSettingDef<K> => ({
  key,
  valueId,
  size,
  kind,
  min,
  max,
  step,
  defaultValue,
});

export const TOUCHPAD_SETTINGS = [
  def('cpi', 0x01, 'range', 100, 3200, 800, 2, 50),
  def('acceleration', 0x02, 'switch', 0, 1, 1),
  def('glide', 0x03, 'switch', 0, 1, 0),
  // 0: 0deg, 1: 90deg, 2: 180deg, 3: 270deg
  def('rotation', 0x04, 'choice', 0, 3, 0),
  def('invertX', 0x05, 'switch', 0, 1, 0),
  def('invertY', 0x06, 'switch', 0, 1, 0),
  def('tapToClick', 0x07, 'switch', 0, 1, 1),
  def('twoFingerTap', 0x08, 'switch', 0, 1, 1),
  def('tapDrag', 0x09, 'switch', 0, 1, 0),
  def('tapTerm', 0x0a, 'range', 100, 400, 200, 2, 10),
  // 0: two finger, 1: circular, 2: edge
  def('scrollMode', 0x0b, 'choice', 0, 2, 0),
  def('scrollDivisor', 0x0c, 'range', 1, 32, 8, 1, 1),
  def('naturalScroll', 0x0d, 'switch', 0, 1, 0),
  def('horizontalScroll', 0x0e, 'switch', 0, 1, 1),
  // 0: 1x, 1: 2x, 2: 3x, 3: 4x
  def('sensitivity', 0x0f, 'choice', 0, 3, 1),
  // Multitouch fork: 1 = Windows precision touchpad, 0 = always a mouse.
  def('precisionTouchpad', 0x10, 'switch', 0, 1, 0),
] as const;

export const AUTO_MOUSE_SETTINGS = [
  def('enabled', 0x20, 'switch', 0, 1, 1),
  def('layer', 0x21, 'choice', 1, 31, 3),
  def('threshold', 0x22, 'range', 1, 50, 10, 1, 1),
  def('timeout', 0x23, 'range', 200, 3000, 650, 2, 50),
  def('activationDelay', 0x24, 'range', 0, 1000, 200, 2, 50),
  def('debounce', 0x25, 'range', 0, 100, 25, 1, 5),
  def('exitOnOtherKey', 0x26, 'switch', 0, 1, 1),
  def('holdWithModifiers', 0x27, 'switch', 0, 1, 1),
] as const;

// Firmware protocol version 2 (matrix_pointing MP_VERSION 2): tap-hold
// timing for LT / MT keys and 3-finger swipe keycodes.
export const TIMING_SETTINGS = [
  def('tappingTerm', 0x30, 'range', 100, 400, 200, 2, 5),
  // 0: hold preferred, 1: balanced, 2: tap preferred (QMK default)
  def('holdMode', 0x31, 'choice', 0, 2, 2),
  def('swipeLeft', 0x40, 'keycode', 0, 0xffff, 0x00d3, 2),
  def('swipeRight', 0x41, 'keycode', 0, 0xffff, 0x00d4, 2),
  def('swipeUp', 0x42, 'keycode', 0, 0xffff, 0x00e3, 2),
  def('swipeDown', 0x43, 'keycode', 0, 0xffff, 0x0029, 2),
] as const;

export const TAPPING_TERM_PRESETS = [150, 175, 200, 250, 300];

// Firmware protocol version 3: LED color per layer (RGB Matrix), layers 0-7.
// 0 = keep the lighting effect, 1 = off, 2.. = the colors below.
export const LED_LAYER_COUNT = 8;
export const LED_SETTINGS = [0, 1, 2, 3, 4, 5, 6, 7].map((layer) =>
  def(`led${layer}`, 0x50 + layer, 'choice', 0, 8, 0)
);
export const LED_COLORS: { value: number; label: string; css: string }[] = [
  { value: 0, label: 'Lighting effect', css: 'transparent' },
  { value: 1, label: 'Off', css: '#1f2023' },
  { value: 2, label: 'Red', css: '#e5484d' },
  { value: 3, label: 'Green', css: '#30a46c' },
  { value: 4, label: 'Yellow', css: '#f5d90a' },
  { value: 5, label: 'Blue', css: '#3e63dd' },
  { value: 6, label: 'Magenta', css: '#d6409f' },
  { value: 7, label: 'Cyan', css: '#05a2c2' },
  { value: 8, label: 'White', css: '#ffffff' },
];

// Read-only value 0x7E (protocol version 3): which settings the firmware
// actually applies. null = older firmware that does not say (assume all).
export const CAPABILITIES_VALUE_ID = 0x7e;
export const CAP_TIMING = 1 << 16;
export const CAP_SWIPE = 1 << 17;
export const CAP_LAYER_LED = 1 << 18;
export const CAP_COMBOS = 1 << 19;
export const CAP_PRECISION_TOUCHPAD = 1 << 20;
export const CAP_SPLIT_INFO = 1 << 21;
export const CAP_RGB_EFFECT_COUNT = 1 << 22;
export const CAP_EDGE_ZONES = 1 << 23;
export const CAP_KNOB_PRESS_TURN = 1 << 24;
export const CAP_SMOOTHING = 1 << 25;
export const CAP_SENSOR_TUNING = 1 << 26;
export const CAP_ACCEL_TUNING = 1 << 27;
export const CAP_PRECISION_MODE = 1 << 28;
export const CAP_TOUCH_GLOW = 1 << 29;
export const CAP_TOUCH_GLOW_SHAPE = 1 << 30;
// Bit 31: written as a number so it stays positive.
export const CAP_KEY_GUIDE = 0x80000000;

export async function fetchCapabilities(
  keyboard: IKeyboard
): Promise<number | null> {
  const result = await keyboard.fetchCustomValue(CAPABILITIES_VALUE_ID, 4);
  if (!result.success || result.unhandled) return null;
  return result.value! >>> 0;
}

// Whether the firmware applies the setting with this value ID.
export function isSettingApplied(
  capabilities: number | null,
  valueId: number
): boolean {
  if (capabilities === null) return true;
  if (valueId >= 0x01 && valueId <= 0x0f) {
    return (capabilities & (1 << (valueId - 1))) !== 0;
  }
  if (valueId === 0x10) {
    return (capabilities & CAP_PRECISION_TOUCHPAD) !== 0;
  }
  if (valueId === 0x30 || valueId === 0x31) {
    return (capabilities & CAP_TIMING) !== 0;
  }
  if (valueId >= 0x40 && valueId <= 0x43) {
    return (capabilities & CAP_SWIPE) !== 0;
  }
  if (valueId >= 0x50 && valueId <= 0x57) {
    return (capabilities & CAP_LAYER_LED) !== 0;
  }
  return true;
}

export type TouchpadSettingKey = (typeof TOUCHPAD_SETTINGS)[number]['key'];
export type AutoMouseSettingKey = (typeof AUTO_MOUSE_SETTINGS)[number]['key'];
export type TouchpadSettings = Record<TouchpadSettingKey, number>;
export type AutoMouseSettings = Record<AutoMouseSettingKey, number>;

export function hasFeature(
  customFeatures: string[] | undefined | null,
  feature: string
): boolean {
  return !!customFeatures && customFeatures.includes(feature);
}

export function defaultValues<K extends string>(
  defs: readonly IPointingSettingDef<K>[]
): Record<K, number> {
  return defs.reduce(
    (acc, d) => {
      acc[d.key] = d.defaultValue;
      return acc;
    },
    {} as Record<K, number>
  );
}

export function clampValue(d: IPointingSettingDef, value: number): number {
  if (Number.isNaN(value)) return d.defaultValue;
  return Math.min(d.max, Math.max(d.min, Math.round(value)));
}

export interface IFetchSettingsResult<K extends string> extends IResult {
  values?: Record<K, number>;
  // The firmware answered id_unhandled: it predates these values.
  outdated?: boolean;
}

export async function fetchSettings<K extends string>(
  keyboard: IKeyboard,
  defs: readonly IPointingSettingDef<K>[]
): Promise<IFetchSettingsResult<K>> {
  const values = defaultValues(defs);
  for (const d of defs) {
    const result = await keyboard.fetchCustomValue(d.valueId, d.size);
    if (!result.success) {
      return { success: false, error: result.error, cause: result.cause };
    }
    if (result.unhandled) {
      return {
        success: false,
        outdated: true,
        error: 'The firmware does not support this setting',
      };
    }
    values[d.key] = clampValue(d, result.value!);
  }
  return { success: true, values };
}

// Sends only the values that differ from `current`, then persists them
// (id_custom_save) when anything was sent.
export async function applySettings<K extends string>(
  keyboard: IKeyboard,
  defs: readonly IPointingSettingDef<K>[],
  current: Record<K, number>,
  next: Record<K, number>
): Promise<IResult> {
  let changed = false;
  for (const d of defs) {
    const value = clampValue(d, next[d.key]);
    if (current[d.key] === value) continue;
    const result = await keyboard.updateCustomValue(d.valueId, value, d.size);
    if (!result.success) return result;
    changed = true;
  }
  if (!changed) return { success: true };
  return keyboard.saveCustomValues();
}

// Revision of the matrix_pointing firmware module (value 0x7C). Firmware
// before revision 9 does not report it (0 here).
export const FIRMWARE_REVISION_VALUE_ID = 0x7c;
export const LATEST_FIRMWARE_REVISION = 28;

export async function fetchFirmwareRevision(
  keyboard: IKeyboard
): Promise<number> {
  const result = await keyboard.fetchCustomValue(FIRMWARE_REVISION_VALUE_ID, 2);
  if (!result.success || result.unhandled) return 0;
  return result.value!;
}

import { useSyncExternalStore } from 'react';
import { RGB_MATRIX_EFFECTS, RgbMatrixState } from './RgbMatrix';

// The keyboard's lighting as the 3D keyboard shows it while the Lighting
// settings are open: the RGB Matrix effect, the LED color of the layer and
// the "assigned keys only" guide. The firmware's effects are recreated
// approximately from their settings (effect, color, brightness, speed).

export type KeyGuidePreview = {
  mode: number; // 0 off, 1 on layers above the base, 2 always
  colorMode: number; // 0 keep the colors, 1 color by kind
  dim: number; // brightness of unassigned keys, %
};

export type LightingPreviewState = {
  rgb: RgbMatrixState | null;
  guide: KeyGuidePreview | null;
};

let state: LightingPreviewState = { rgb: null, guide: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const lightingPreview = {
  get: () => state,
  setRgb(rgb: RgbMatrixState | null) {
    state = { ...state, rgb };
    emit();
  },
  setGuide(guide: KeyGuidePreview | null) {
    state = { ...state, guide };
    emit();
  },
};

export function useLightingPreview(): LightingPreviewState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

export type Rgb = [number, number, number]; // 0-1 each

// QMK's HSV (all 0-255) to RGB 0-1.
export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const hh = ((((h % 256) + 256) % 256) / 256) * 6;
  const ss = Math.max(0, Math.min(255, s)) / 255;
  const vv = Math.max(0, Math.min(255, v)) / 255;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = vv * (1 - ss);
  const q = vv * (1 - ss * f);
  const t = vv * (1 - ss * (1 - f));
  switch (i % 6) {
    case 0:
      return [vv, t, p];
    case 1:
      return [q, vv, p];
    case 2:
      return [p, vv, t];
    case 3:
      return [p, q, vv];
    case 4:
      return [t, p, vv];
    default:
      return [vv, p, q];
  }
}

// Kinds of keys, as the firmware's key guide sorts them.
export type KeyKind =
  | 'none'
  | 'key'
  | 'mod'
  | 'layer'
  | 'media'
  | 'mouse'
  | 'other';

const inRange = (c: number, a: number, b: number) => c >= a && c <= b;

export function keyKind(code: number): KeyKind {
  if (code === 0x0000 || code === 0x0001) return 'none'; // KC_NO, KC_TRNS
  if (
    inRange(code, 0xe0, 0xe7) ||
    inRange(code, 0x2000, 0x3fff) ||
    inRange(code, 0x52a0, 0x52bf)
  )
    return 'mod';
  if (inRange(code, 0x4000, 0x529f) || inRange(code, 0x52c0, 0x52ff))
    return 'layer';
  if (inRange(code, 0xa5, 0xc2)) return 'media';
  if (inRange(code, 0xcd, 0xdf) || inRange(code, 0x7e00, 0x7e3f))
    return 'mouse';
  if (inRange(code, 0x04, 0xa4)) return 'key';
  return 'other';
}

// Hue / saturation of the layer LED colors (index 2..8) and of the key
// guide's kinds, as in the firmware (matrix_pointing.c).
const LAYER_HS: [number, number][] = [
  [0, 255],
  [85, 255],
  [43, 255],
  [170, 255],
  [213, 255],
  [128, 255],
  [0, 0],
];
const KIND_HS: Record<Exclude<KeyKind, 'none'>, [number, number]> = {
  key: [0, 0],
  mod: [170, 255],
  layer: [213, 255],
  media: [85, 255],
  mouse: [43, 255],
  other: [128, 255],
};

export type LedKey = {
  // Position on the keyboard, 0-1 across its width and depth.
  px: number;
  py: number;
  // Keycode on the shown layer.
  code: number;
  // Stable per key, for the random-looking effects.
  seed: number;
};

const frac = (x: number) => x - Math.floor(x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const noise = (a: number, b: number) =>
  frac(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

// Color of one key's LED at time `t` (seconds), null when it is dark.
export function ledColor(
  key: LedKey,
  t: number,
  rgb: RgbMatrixState | null,
  layer: number,
  layerColor: number,
  guide: KeyGuidePreview | null
): Rgb | null {
  const val = rgb ? rgb.brightness : 0;
  let color: Rgb | null = null;
  if (layerColor >= 1) {
    // The layer's LED color fills the keyboard (1 = off).
    const hs = LAYER_HS[layerColor - 2];
    color = hs ? hsvToRgb(hs[0], hs[1], val || 255) : [0, 0, 0];
  } else if (rgb && rgb.effect > 0) {
    color = effectColor(key, t, rgb);
  }
  // Key guide: unassigned keys dim, assigned keys keep or color by kind.
  const guideOn =
    !!guide && (guide.mode === 2 || (guide.mode === 1 && layer !== 0));
  if (guideOn && rgb) {
    const kind = keyKind(key.code);
    if (kind === 'none') {
      const base = color || [0, 0, 0];
      color = base.map((c) => (c * guide!.dim) / 100) as Rgb;
    } else if (guide!.colorMode === 1) {
      const hs = KIND_HS[kind];
      color = hsvToRgb(hs[0], hs[1], val);
    }
  }
  if (!color || Math.max(...color) < 0.01) return null;
  return color;
}

function effectColor(key: LedKey, t: number, rgb: RgbMatrixState): Rgb {
  const { hue: h, sat: s, brightness: v, speed } = rgb;
  const id = RGB_MATRIX_EFFECTS[rgb.effect - 1]?.id || 'SOLID_COLOR';
  // Turns per second, faster with the speed setting.
  const phase = t * (0.08 + (speed / 255) * 0.9);
  const { px, py } = key;
  const dx = px - 0.5;
  const dy = py - 0.5;
  const dist = Math.min(1, Math.hypot(dx * 1.6, dy) * 1.4);
  const angle = (Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1;
  const band = (x: number) =>
    clamp01(1 - Math.abs((((x % 1) + 1.5) % 1) - 0.5) * 6);
  const slot = Math.floor(t * (1 + speed / 64));
  switch (id) {
    case 'ALPHAS_MODS':
      return keyKind(key.code) === 'mod'
        ? hsvToRgb(h + speed, s, v)
        : hsvToRgb(h, s, v);
    case 'GRADIENT_UP_DOWN':
      return hsvToRgb(h + py * 64, s, v);
    case 'GRADIENT_LEFT_RIGHT':
      return hsvToRgb(h + px * 64, s, v);
    case 'BREATHING':
      return hsvToRgb(
        h,
        s,
        v * (0.15 + 0.85 * (0.5 + 0.5 * Math.sin(phase * 2 * Math.PI)))
      );
    case 'BAND_SAT':
      return hsvToRgb(h, s * band(px - phase), v);
    case 'BAND_VAL':
      return hsvToRgb(h, s, v * band(px - phase));
    case 'BAND_PINWHEEL_SAT':
      return hsvToRgb(h, s * band(angle - phase), v);
    case 'BAND_PINWHEEL_VAL':
      return hsvToRgb(h, s, v * band(angle - phase));
    case 'BAND_SPIRAL_SAT':
      return hsvToRgb(h, s * band(angle + dist - phase), v);
    case 'BAND_SPIRAL_VAL':
      return hsvToRgb(h, s, v * band(angle + dist - phase));
    case 'CYCLE_ALL':
      return hsvToRgb(h + phase * 256, s, v);
    case 'CYCLE_LEFT_RIGHT':
      return hsvToRgb(h + (px - phase) * 256, s, v);
    case 'CYCLE_UP_DOWN':
      return hsvToRgb(h + (py - phase) * 256, s, v);
    case 'RAINBOW_MOVING_CHEVRON':
      return hsvToRgb(h + (px + Math.abs(dy) - phase) * 256, s, v);
    case 'CYCLE_OUT_IN':
      return hsvToRgb(h + (dist - phase) * 256, s, v);
    case 'CYCLE_OUT_IN_DUAL':
      return hsvToRgb(
        h +
          (Math.min(Math.hypot(px - 0.25, dy), Math.hypot(px - 0.75, dy)) * 2 -
            phase) *
            256,
        s,
        v
      );
    case 'CYCLE_PINWHEEL':
    case 'RAINBOW_PINWHEELS':
      return hsvToRgb(h + (angle - phase) * 256, s, v);
    case 'CYCLE_SPIRAL':
      return hsvToRgb(h + (angle + dist - phase) * 256, s, v);
    case 'DUAL_BEACON':
      return hsvToRgb(h + Math.cos((angle - phase) * 2 * Math.PI) * 32, s, v);
    case 'RAINBOW_BEACON':
      return hsvToRgb(h + (angle - phase) * 256 + px * 32, s, v);
    case 'HUE_BREATHING':
      return hsvToRgb(h + Math.sin(phase * 2 * Math.PI) * 16, s, v);
    case 'HUE_PENDULUM':
      return hsvToRgb(
        h + Math.sin(phase * 2 * Math.PI) * (px - 0.5) * 64,
        s,
        v
      );
    case 'HUE_WAVE':
      return hsvToRgb(h + Math.sin((px - phase) * 2 * Math.PI) * 24, s, v);
    case 'RAINDROPS':
      return hsvToRgb(h + (noise(key.seed, slot) - 0.5) * 64, s, v);
    case 'JELLYBEAN_RAINDROPS':
      return hsvToRgb(
        noise(key.seed, slot) * 256,
        noise(slot, key.seed) * 128 + 127,
        v
      );
    case 'PIXEL_RAIN':
    case 'PIXEL_FRACTAL':
      return noise(key.seed, slot) > 0.6
        ? hsvToRgb(noise(slot, key.seed) * 256, s, v)
        : [0, 0, 0];
    case 'PIXEL_FLOW':
      return hsvToRgb(noise(Math.floor((px - phase) * 12), slot) * 256, s, v);
    case 'DIGITAL_RAIN':
      return hsvToRgb(85, 255, v * band(py - phase * 2 + noise(key.seed, 0)));
    case 'TYPING_HEATMAP':
      return [0, 0, 0]; // lights the keys being typed
    case 'SOLID_REACTIVE_SIMPLE':
    case 'SOLID_REACTIVE':
    case 'SOLID_REACTIVE_WIDE':
    case 'SOLID_REACTIVE_MULTIWIDE':
    case 'SOLID_REACTIVE_CROSS':
    case 'SOLID_REACTIVE_MULTICROSS':
    case 'SOLID_REACTIVE_NEXUS':
    case 'SOLID_REACTIVE_MULTINEXUS':
    case 'SPLASH':
    case 'MULTISPLASH':
    case 'SOLID_SPLASH':
    case 'SOLID_MULTISPLASH':
      // React to key presses: a dim base until a key is pressed.
      return hsvToRgb(h, s, v * 0.25);
    default:
      return hsvToRgb(h, s, v);
  }
}

import KeyModel from '../../../models/KeyModel';

// Geometry of the 3D keyboard, in key units (1u = one key pitch).
// The keyboard lies on the X-Z plane: X goes right and Z goes towards the
// viewer, matching the 2D layout's x (right) and y (down).

export type Key3D = {
  model: KeyModel;
  // Center of the keycap.
  x: number;
  z: number;
  // Size of the keycap footprint.
  w: number;
  d: number;
  // Rotation around the Y axis in radians (KLE rotation is clockwise on
  // screen, which is a negative rotation around Y).
  angle: number;
};

export type Bounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

// A group of keys close to each other: one half of a split keyboard.
export type Plate = Bounds & {
  keys: Key3D[];
};

export function key3D(model: KeyModel): Key3D {
  const rad = (model.rotate * Math.PI) / 180;
  const cx = model.x + model.w / 2;
  const cy = model.y + model.h / 2;
  const dx = cx - model.rx;
  const dy = cy - model.ry;
  return {
    model,
    x: model.rx + dx * Math.cos(rad) - dy * Math.sin(rad),
    z: model.ry + dx * Math.sin(rad) + dy * Math.cos(rad),
    w: model.w,
    d: model.h,
    angle: rad === 0 ? 0 : -rad,
  };
}

// Axis-aligned bounds of a (possibly rotated) keycap footprint.
export function keyBounds(key: Key3D): Bounds {
  const c = Math.cos(key.angle);
  const s = Math.sin(key.angle);
  const hw = key.w / 2;
  const hd = key.d / 2;
  const ex = Math.abs(hw * c) + Math.abs(hd * s);
  const ez = Math.abs(hw * s) + Math.abs(hd * c);
  return {
    minX: key.x - ex,
    maxX: key.x + ex,
    minZ: key.z - ez,
    maxZ: key.z + ez,
  };
}

export function unionBounds(list: Bounds[]): Bounds {
  return list.reduce(
    (b, k) => ({
      minX: Math.min(b.minX, k.minX),
      maxX: Math.max(b.maxX, k.maxX),
      minZ: Math.min(b.minZ, k.minZ),
      maxZ: Math.max(b.maxZ, k.maxZ),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  );
}

function near(a: Bounds, b: Bounds, gap: number): boolean {
  return (
    a.minX - gap <= b.maxX &&
    b.minX - gap <= a.maxX &&
    a.minZ - gap <= b.maxZ &&
    b.minZ - gap <= a.maxZ
  );
}

// Groups the keys into plates: keys closer than `gap` share a plate, so a
// split keyboard gets one plate per half.
export function plates(keys: Key3D[], gap = 0.5): Plate[] {
  const parent = keys.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const bounds = keys.map(keyBounds);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (near(bounds[i], bounds[j], gap)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  keys.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) || []), i]);
  });
  const result = Array.from(groups.values())
    .map((idx) => ({
      ...unionBounds(idx.map((i) => bounds[i])),
      keys: idx.map((i) => keys[i]),
    }))
    .sort((a, b) => a.minX - b.minX);
  return result.length === 1 ? splitHalves(result[0]) : result;
}

// Split keyboards whose halves come close (thumb keys turned towards each
// other, like the Dilemma) end up in one plate. Split it where a vertical
// line passes between the keys with balanced halves on both sides.
const MIN_SPLIT_GAP = 0.1;
const MIN_HALF_SHARE = 0.35;

function splitHalves(plate: Plate): Plate[] {
  const items = plate.keys
    .map((key) => ({ key, b: keyBounds(key) }))
    .sort((a, b) => a.b.minX - b.b.minX);
  let reach = -Infinity;
  let best: { at: number; gap: number } | null = null;
  for (let i = 0; i < items.length; i++) {
    const gap = items[i].b.minX - reach;
    const left = i;
    const right = items.length - i;
    if (
      i > 0 &&
      gap >= MIN_SPLIT_GAP &&
      Math.min(left, right) >= items.length * MIN_HALF_SHARE &&
      (!best || gap > best.gap)
    ) {
      best = { at: i, gap };
    }
    reach = Math.max(reach, items[i].b.maxX);
  }
  if (!best) return [plate];
  const halves = [items.slice(0, best.at), items.slice(best.at)];
  return halves.map((half) => ({
    ...unionBounds(half.map((h) => h.b)),
    keys: half.map((h) => h.key),
  }));
}

export type CameraView = {
  // Point the camera looks at.
  targetX: number;
  targetZ: number;
  // Distance from the target.
  distance: number;
};

// Distance at which a `width` x `depth` area fits a perspective camera with
// the given vertical field of view (degrees), aspect ratio and tilt (radians
// from straight down).
export function fitDistance(
  width: number,
  depth: number,
  fovDeg: number,
  aspect: number,
  tilt: number
): number {
  const half = Math.tan((fovDeg * Math.PI) / 360);
  const byHeight = (depth * Math.cos(tilt)) / 2 / half;
  const byWidth = width / 2 / (half * Math.max(aspect, 0.1));
  return Math.max(byHeight, byWidth);
}

// View of the whole keyboard. `side` is the share of the stage covered by
// the settings window on the right: the keyboard is centered in the rest.
export function overviewView(
  bounds: Bounds,
  fovDeg: number,
  aspect: number,
  tilt: number,
  side = 0
): CameraView {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const visible = 1 - side;
  const distance =
    fitDistance(width, depth, fovDeg, aspect * visible, tilt) * 1.12;
  const cx = (bounds.minX + bounds.maxX) / 2;
  return {
    targetX: cx + shift(distance, fovDeg, aspect, side),
    targetZ: (bounds.minZ + bounds.maxZ) / 2,
    distance,
  };
}

// Close-up of one key, shown left of the settings window.
export function focusView(
  key: Key3D,
  fovDeg: number,
  aspect: number,
  tilt: number,
  side = 0
): CameraView {
  const distance = fitDistance(6, 4, fovDeg, aspect * (1 - side), tilt);
  return {
    targetX: key.x + shift(distance, fovDeg, aspect, side),
    targetZ: key.z,
    distance,
  };
}

// How far right the target moves so the subject sits in the middle of the
// part of the stage that the window does not cover.
function shift(
  distance: number,
  fovDeg: number,
  aspect: number,
  side: number
): number {
  const visibleWidth =
    2 * distance * Math.tan((fovDeg * Math.PI) / 360) * aspect;
  return (visibleWidth * side) / 2;
}

// Margin of the base plate around its keys.
export const PLATE_PAD = 0.28;

// The touchpad of the Dilemma / Corne Procyon36 (and keyboards declaring
// the Matrix touchpad): on the right half, inside the innermost column of
// the three main rows, above the thumb keys. It is about 2.4 keys wide.
const TOUCHPAD_WIDTH = 2.4;
const TOUCHPAD_MARGIN = 0.15;
// Space kept between the base plates of the two halves.
const PLATE_SEPARATION = 0.6;

export type Layout3D = {
  keys: Key3D[];
  plates: Plate[];
  bounds: Bounds;
  // Where the touchpad is drawn (null: none).
  touchpad: Bounds | null;
};

// The 3D layout of the keyboard. With a touchpad, the right half moves
// right when the keymap leaves too little room between the halves for it
// (layouts often draw the halves closer than they are).
export function layout3D(keys: Key3D[], touchpad: boolean): Layout3D {
  const list = plates(keys);
  const area = touchpad ? touchpadArea(list) : null;
  if (!area) {
    return { keys, plates: list, bounds: unionBounds(list), touchpad: null };
  }
  const left = list[list.length - 2];
  const right = list[list.length - 1];
  const shift = Math.max(
    0,
    left.maxX + 2 * PLATE_PAD + PLATE_SEPARATION - area.minX
  );
  const moved = new Map<Key3D, Key3D>(
    right.keys.map((k) => [k, { ...k, x: k.x + shift }])
  );
  const pad: Bounds = {
    ...area,
    minX: area.minX + shift,
    maxX: area.maxX + shift,
  };
  const rightKeys = right.keys.map((k) => moved.get(k)!);
  const newRight: Plate = {
    ...unionBounds([...rightKeys.map(keyBounds), pad]),
    keys: rightKeys,
  };
  const newPlates = [...list.slice(0, -1), newRight];
  return {
    keys: keys.map((k) => moved.get(k) || k),
    plates: newPlates,
    bounds: unionBounds(newPlates),
    touchpad: pad,
  };
}

// Inside the innermost column of the right half's three main rows.
function touchpadArea(list: Plate[]): Bounds | null {
  if (list.length < 2) return null;
  const right = list[list.length - 1];
  const main0 = right.keys.filter((k) => k.angle === 0 && !k.model.isEncoder);
  if (main0.length === 0) return null;
  const top = Math.min(...main0.map((k) => k.z - k.d / 2));
  const main = main0.filter((k) => k.z - k.d / 2 < top + 3);
  const innerX = Math.min(...main.map((k) => k.x - k.w / 2));
  const inner = main.filter((k) => Math.abs(k.x - k.w / 2 - innerX) < 0.01);
  const maxX = innerX - TOUCHPAD_MARGIN;
  return {
    minX: maxX - TOUCHPAD_WIDTH,
    maxX,
    minZ: Math.min(...inner.map((k) => k.z - k.d / 2)),
    maxZ: Math.max(...inner.map((k) => k.z + k.d / 2)),
  };
}

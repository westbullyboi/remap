import type { Bounds, Key3D } from './Keyboard3DGeometry';

// Outline of a base plate that follows its keys, like the PCB / case of a
// split keyboard: every key footprint grown by `pad` with rounded corners,
// gaps narrower than `2 * close` filled (between the thumb keys and the
// main rows, the steps of a column stagger), holes filled. Computed on a
// grid and returned as a polygon of (x, z) points in key units.

export type Outline = [number, number][];

const CELL = 0.05; // grid step in key units

export function plateOutline(
  keys: Key3D[],
  extra: Bounds[] = [],
  pad = 0.28,
  close = 0.6
): Outline {
  if (keys.length === 0 && extra.length === 0) return [];
  // Grid covering everything plus the growth.
  const margin = pad + close + CELL * 4;
  const boxes = [
    ...keys.map((k) => {
      const r = Math.hypot(k.w, k.d) / 2;
      return { minX: k.x - r, maxX: k.x + r, minZ: k.z - r, maxZ: k.z + r };
    }),
    ...extra,
  ];
  const x0 = Math.min(...boxes.map((b) => b.minX)) - margin;
  const z0 = Math.min(...boxes.map((b) => b.minZ)) - margin;
  const cols = Math.ceil(
    (Math.max(...boxes.map((b) => b.maxX)) + margin - x0) / CELL
  );
  const rows = Math.ceil(
    (Math.max(...boxes.map((b) => b.maxZ)) + margin - z0) / CELL
  );
  const at = (i: number, j: number) => j * cols + i;

  // The footprints themselves.
  const solid = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const z = z0 + (j + 0.5) * CELL;
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * CELL;
      if (
        keys.some((k) => insideKey(k, x, z)) ||
        extra.some(
          (b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
        )
      ) {
        solid[at(i, j)] = 1;
      }
    }
  }

  // Grow by pad + close, then shrink by close (a morphological closing).
  const grown = threshold(
    distance(solid, cols, rows, true),
    (d) => d <= (pad + close) / CELL
  );
  const shape = threshold(
    distance(grown, cols, rows, false),
    (d) => d > close / CELL
  );
  fillHoles(shape, cols, rows);

  const loop = outerLoop(shape, cols, rows);
  const points: Outline = loop.map(([gi, gj]) => [
    x0 + gi * CELL,
    z0 + gj * CELL,
  ]);
  return simplify(points, CELL * 2.4);
}

function insideKey(k: Key3D, x: number, z: number): boolean {
  // Into the key's own frame (the key turned by k.angle around Y).
  const dx = x - k.x;
  const dz = z - k.z;
  const c = Math.cos(k.angle);
  const s = Math.sin(k.angle);
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  return Math.abs(u) <= k.w / 2 && Math.abs(v) <= k.d / 2;
}

function threshold(d: Float32Array, keep: (v: number) => boolean): Uint8Array {
  const out = new Uint8Array(d.length);
  for (let n = 0; n < d.length; n++) out[n] = keep(d[n]) ? 1 : 0;
  return out;
}

// Chamfer (3-4) distance in cells to the nearest cell that is `target`
// (1 when `toSolid`, else 0). Outside the grid counts as empty.
function distance(
  grid: Uint8Array,
  cols: number,
  rows: number,
  toSolid: boolean
): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(cols * rows);
  for (let n = 0; n < d.length; n++) {
    d[n] = (grid[n] === 1) === toSolid ? 0 : INF;
  }
  if (!toSolid) {
    // The border of the grid is empty space.
    for (let i = 0; i < cols; i++) {
      d[i] = Math.min(d[i], 1);
      d[(rows - 1) * cols + i] = Math.min(d[(rows - 1) * cols + i], 1);
    }
    for (let j = 0; j < rows; j++) {
      d[j * cols] = Math.min(d[j * cols], 1);
      d[j * cols + cols - 1] = Math.min(d[j * cols + cols - 1], 1);
    }
  }
  const a = 1;
  const b = 4 / 3;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const n = j * cols + i;
      let v = d[n];
      if (i > 0) v = Math.min(v, d[n - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[n - cols] + a);
        if (i > 0) v = Math.min(v, d[n - cols - 1] + b);
        if (i < cols - 1) v = Math.min(v, d[n - cols + 1] + b);
      }
      d[n] = v;
    }
  }
  for (let j = rows - 1; j >= 0; j--) {
    for (let i = cols - 1; i >= 0; i--) {
      const n = j * cols + i;
      let v = d[n];
      if (i < cols - 1) v = Math.min(v, d[n + 1] + a);
      if (j < rows - 1) {
        v = Math.min(v, d[n + cols] + a);
        if (i < cols - 1) v = Math.min(v, d[n + cols + 1] + b);
        if (i > 0) v = Math.min(v, d[n + cols - 1] + b);
      }
      d[n] = v;
    }
  }
  return d;
}

// Empty cells not connected to the border become solid.
function fillHoles(grid: Uint8Array, cols: number, rows: number) {
  const seen = new Uint8Array(cols * rows);
  const stack: number[] = [];
  const push = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return;
    const n = j * cols + i;
    if (seen[n] || grid[n]) return;
    seen[n] = 1;
    stack.push(n);
  };
  for (let i = 0; i < cols; i++) {
    push(i, 0);
    push(i, rows - 1);
  }
  for (let j = 0; j < rows; j++) {
    push(0, j);
    push(cols - 1, j);
  }
  while (stack.length) {
    const n = stack.pop()!;
    const i = n % cols;
    const j = (n - i) / cols;
    push(i + 1, j);
    push(i - 1, j);
    push(i, j + 1);
    push(i, j - 1);
  }
  for (let n = 0; n < grid.length; n++) if (!grid[n] && !seen[n]) grid[n] = 1;
}

// The longest boundary loop between solid and empty cells, as grid corner
// points, walked with the solid side on the right.
function outerLoop(
  grid: Uint8Array,
  cols: number,
  rows: number
): [number, number][] {
  const solidAt = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < cols && j < rows && grid[j * cols + i] === 1;
  const next = new Map<string, [number, number][]>();
  const add = (a: [number, number], b: [number, number]) => {
    const key = `${a[0]},${a[1]}`;
    next.set(key, [...(next.get(key) || []), b]);
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!solidAt(i, j)) continue;
      if (!solidAt(i, j - 1)) add([i, j], [i + 1, j]); // top
      if (!solidAt(i + 1, j)) add([i + 1, j], [i + 1, j + 1]); // right
      if (!solidAt(i, j + 1)) add([i + 1, j + 1], [i, j + 1]); // bottom
      if (!solidAt(i - 1, j)) add([i, j + 1], [i, j]); // left
    }
  }
  let best: [number, number][] = [];
  const used = new Set<string>();
  next.forEach((targets, start) => {
    targets.forEach((first) => {
      const edge = `${start}>${first[0]},${first[1]}`;
      if (used.has(edge)) return;
      const [si, sj] = start.split(',').map(Number);
      const loop: [number, number][] = [[si, sj]];
      let from = start;
      let to = first;
      for (let guard = 0; guard < grid.length * 4; guard++) {
        used.add(`${from}>${to[0]},${to[1]}`);
        const key = `${to[0]},${to[1]}`;
        if (key === start) break;
        loop.push(to);
        const options = (next.get(key) || []).filter(
          (t) => !used.has(`${key}>${t[0]},${t[1]}`)
        );
        if (options.length === 0) break;
        from = key;
        to = options[0];
      }
      if (loop.length > best.length) best = loop;
    });
  });
  return best;
}

// Ramer-Douglas-Peucker on a closed polygon.
function simplify(points: Outline, tolerance: number): Outline {
  if (points.length < 4) return points;
  // Split the loop at its two farthest-apart points.
  let far = 0;
  let farD = -1;
  points.forEach((p, n) => {
    const d = Math.hypot(p[0] - points[0][0], p[1] - points[0][1]);
    if (d > farD) {
      farD = d;
      far = n;
    }
  });
  const a = rdp(points.slice(0, far + 1), tolerance);
  const b = rdp([...points.slice(far), points[0]], tolerance);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function rdp(points: Outline, tolerance: number): Outline {
  if (points.length < 3) return points;
  const [ax, az] = points[0];
  const [bx, bz] = points[points.length - 1];
  const len = Math.hypot(bx - ax, bz - az) || 1;
  let index = 0;
  let maxD = 0;
  for (let n = 1; n < points.length - 1; n++) {
    const [px, pz] = points[n];
    const d = Math.abs((bx - ax) * (az - pz) - (ax - px) * (bz - az)) / len;
    if (d > maxD) {
      maxD = d;
      index = n;
    }
  }
  if (maxD <= tolerance) return [points[0], points[points.length - 1]];
  const left = rdp(points.slice(0, index + 1), tolerance);
  const right = rdp(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

// Whether (x, z) is inside the polygon (even-odd rule).
export function insideOutline(outline: Outline, x: number, z: number): boolean {
  let inside = false;
  for (let n = 0, m = outline.length - 1; n < outline.length; m = n++) {
    const [xi, zi] = outline[n];
    const [xj, zj] = outline[m];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

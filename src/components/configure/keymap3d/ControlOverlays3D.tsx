/* eslint-disable react/no-unknown-property */
// react-three-fiber props (transparent, depthTest, ...) are not DOM
// attributes, which this rule cannot tell.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Bounds, Key3D } from './Keyboard3DGeometry';

// What the touchpad's zones and the knobs do, drawn on the 3D keyboard while
// their settings are open. Drawn after the 1-bit dithering (layer 1), in
// color, like the LEDs.

export type TouchpadZoneOverlay = {
  id: string;
  kind: 'edge' | 'corner';
  // 0-1 across the pad (x to the right, y down).
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // The left and right edges run up and down the pad.
  vertical: boolean;
  // Actions at the start (left / bottom) and the end (right / top) of the
  // zone; a corner has only `start`.
  start: string;
  end: string;
  set: boolean;
  selected: boolean;
  title: string;
  detail: string[];
};

export type KnobActionsOverlay = {
  // Matches Key3D.model.encoderId.
  encoderId: number;
  // [counter-clockwise, clockwise] when turned, and while pushed (null:
  // the firmware has no push-and-turn).
  turn: [string, string];
  push: [string, string] | null;
  // The knob was dragged or picked (brings it up close).
  onTouch?: () => void;
};

const PX = 220; // canvas pixels per key unit
const EDGE_COLOR = '#3f6fe0';
const CORNER_COLOR = '#8a5cf0';
const UNSET_COLOR = 'rgba(120, 124, 136, 0.28)';
const FONT = "'IBM Plex Sans JP', Inter, system-ui, sans-serif";

function useCanvasTexture(
  width: number,
  height: number,
  // eslint-disable-next-line no-unused-vars
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[]
): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(8, Math.round(width * PX));
    canvas.height = Math.max(8, Math.round(height * PX));
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx, canvas.width, canvas.height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [width, height, ...deps]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------- touchpad

// The zones on the touch surface, a card naming what the selected zone does
// floating above the pad.
export function TouchpadZones3D(props: {
  area: Bounds;
  // Height of the touch surface.
  y: number;
  zones: TouchpadZoneOverlay[];
}) {
  const { area } = props;
  const inset = 0.08; // the surface is a little smaller than the pad
  const minX = area.minX + inset;
  const minZ = area.minZ + inset;
  const w = area.maxX - area.minX - inset * 2;
  const d = area.maxZ - area.minZ - inset * 2;
  const selected = props.zones.find((z) => z.selected);
  return (
    <group>
      {props.zones.map((z) => (
        <ZonePlane
          key={z.id}
          zone={z}
          x={minX + ((z.x0 + z.x1) / 2) * w}
          z={minZ + ((z.y0 + z.y1) / 2) * d}
          y={props.y}
          width={(z.x1 - z.x0) * w}
          depth={(z.y1 - z.y0) * d}
        />
      ))}
      {selected && (
        <ZoneCard
          zone={selected}
          x={(area.minX + area.maxX) / 2}
          z={area.minZ - 0.75}
          // Points at the zone.
          toX={minX + ((selected.x0 + selected.x1) / 2) * w}
          toZ={minZ + ((selected.y0 + selected.y1) / 2) * d}
          y={props.y}
        />
      )}
    </group>
  );
}

function ZonePlane(props: {
  zone: TouchpadZoneOverlay;
  x: number;
  z: number;
  y: number;
  width: number;
  depth: number;
}) {
  const { zone } = props;
  // Drawn as a horizontal strip, turned for the side edges: the start of
  // the strip is then the bottom of the pad.
  const length = zone.vertical ? props.depth : props.width;
  const thick = zone.vertical ? props.width : props.depth;
  const texture = useCanvasTexture(
    length,
    thick,
    (ctx, cw, ch) => drawZone(ctx, cw, ch, zone),
    [zone.start, zone.end, zone.set, zone.selected, zone.kind]
  );
  if (length <= 0.01 || thick <= 0.01) return null;
  return (
    <group
      position={[props.x, props.y, props.z]}
      rotation={[0, zone.vertical ? Math.PI / 2 : 0, 0]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} layers={1} renderOrder={-1}>
        <planeGeometry args={[length - 0.02, thick - 0.02]} />
        <meshBasicMaterial
          map={texture}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function drawZone(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  zone: TouchpadZoneOverlay
) {
  ctx.clearRect(0, 0, w, h);
  const color = zone.set
    ? zone.kind === 'edge'
      ? EDGE_COLOR
      : CORNER_COLOR
    : UNSET_COLOR;
  ctx.globalAlpha = zone.set ? (zone.selected ? 0.95 : 0.72) : 1;
  ctx.fillStyle = color;
  const r = Math.min(w, h) * 0.3;
  roundRect(ctx, 2, 2, w - 4, h - 4, r);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (zone.selected) {
    ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.08);
    ctx.strokeStyle = '#ffffff';
    roundRect(
      ctx,
      ctx.lineWidth,
      ctx.lineWidth,
      w - ctx.lineWidth * 2,
      h - ctx.lineWidth * 2,
      r
    );
    ctx.stroke();
  }
  if (!zone.set) return;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  const size = Math.max(8, Math.min(h * 0.5, 30));
  ctx.font = `700 ${Math.round(size)}px ${FONT}`;
  const pad = size * 0.5;
  if (zone.kind === 'corner') {
    ctx.textAlign = 'center';
    ctx.fillText(zone.start, w / 2, h / 2, w - pad);
    return;
  }
  // ◀ start ... end ▶ (along the strip).
  const half = w / 2 - pad * 1.5;
  ctx.textAlign = 'left';
  if (zone.start) ctx.fillText(`◀ ${zone.start}`, pad, h / 2, half);
  ctx.textAlign = 'right';
  if (zone.end) ctx.fillText(`${zone.end} ▶`, w - pad, h / 2, half);
}

const CARD_W = 3.4;
const CARD_H = 1.0;

function ZoneCard(props: {
  zone: TouchpadZoneOverlay;
  x: number;
  z: number;
  toX: number;
  toZ: number;
  y: number;
}) {
  const { zone } = props;
  const lines = [zone.title, ...zone.detail];
  const texture = useCanvasTexture(
    CARD_W,
    CARD_H,
    (ctx, w, h) => drawCard(ctx, w, h, lines, true),
    [lines.join('\n')]
  );
  const lift = 0.5;
  // A leader line from the card down to the zone.
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(props.x, props.y + lift, props.z + CARD_H / 2),
      new THREE.Vector3(props.toX, props.y + 0.01, props.toZ),
    ]);
    return g;
  }, [props.x, props.y, props.z, props.toX, props.toZ]);
  useEffect(() => () => line.dispose(), [line]);
  return (
    <group>
      <mesh
        position={[props.x, props.y + lift, props.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        layers={1}
        renderOrder={10}
      >
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial
          map={texture}
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <lineSegments geometry={line} layers={1} renderOrder={9}>
        <lineBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.9}
          depthTest={false}
        />
      </lineSegments>
    </group>
  );
}

// A rounded card: the first line bold, the rest smaller.
function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lines: string[],
  dark: boolean,
  accent?: string
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = dark ? 'rgba(14, 14, 16, 0.92)' : 'rgba(255, 255, 255, 0.95)';
  roundRect(ctx, 3, 3, w - 6, h - 6, h * 0.22);
  ctx.fill();
  if (accent) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent;
    roundRect(ctx, 6, 6, w - 12, h - 12, h * 0.2);
    ctx.stroke();
  }
  const rows = lines.filter((l) => l.length > 0);
  if (rows.length === 0) return;
  const pad = h * 0.14;
  const big = Math.min((h - pad * 2) / (rows.length * 1.15 + 0.1), 46);
  const small = big * 0.82;
  const heights = rows.map((_, i) => (i === 0 ? big : small) * 1.18);
  let y = (h - heights.reduce((a, b) => a + b, 0)) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  rows.forEach((row, i) => {
    const size = i === 0 ? big : small;
    ctx.font = `${i === 0 ? 700 : 500} ${Math.round(size)}px ${FONT}`;
    ctx.fillStyle = dark
      ? i === 0
        ? '#ffffff'
        : 'rgba(255,255,255,0.78)'
      : i === 0
        ? '#0e0e10'
        : 'rgba(14,14,16,0.7)';
    ctx.fillText(row, pad * 1.4, y + heights[i] / 2, w - pad * 2.8);
    y += heights[i];
  });
}

// ------------------------------------------------------------------- knobs

const KNOB_CARD_W = 2.3;
const KNOB_CARD_H = 0.82;
// One detent of the knob while dragging (pixels and turn).
const DRAG_STEP_PX = 22;
const NOTCH = Math.PI / 10;
const FLASH_SECONDS = 0.6;

// Arrows around a knob for its two directions, with cards naming what
// turning (and pushing and turning) does. Dragging the knob sideways turns
// it (Shift: pushed) and lights the direction it went.
export function KnobActions3D(props: {
  knob: Key3D;
  actions: KnobActionsOverlay;
  capHeight: number;
  // A click without dragging picks the knob like any key.
  // eslint-disable-next-line no-unused-vars
  onPick: (pos: string) => void;
}) {
  const { knob, actions, capHeight } = props;
  const radius = Math.min(knob.w - 0.1, knob.d - 0.1) * 0.46;
  const [flash, setFlash] = useState<{
    dir: 0 | 1;
    pushed: boolean;
    at: number;
  } | null>(null);
  const turned = useRef(0); // notches, + clockwise
  const pointer = useRef(turned.current);
  const indicator = useRef<THREE.Group>(null);
  const drag = useRef<{ x: number; acc: number; moved: boolean } | null>(null);

  useFrame((_, delta) => {
    const el = indicator.current;
    if (!el) return;
    // Clockwise seen from above is negative around +Y.
    const goal = -pointer.current * NOTCH;
    el.rotation.y += (goal - el.rotation.y) * (1 - Math.exp(-delta * 18));
  });
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [flash]);

  const turn = (dir: 0 | 1, pushed: boolean) => {
    turned.current += dir === 1 ? 1 : -1;
    pointer.current = turned.current;
    setFlash({ dir, pushed, at: performance.now() });
  };

  const ccwLines = [
    `↺ ${actions.turn[0] || '—'}`,
    ...(actions.push ? [actions.push[0]] : []),
  ];
  const cwLines = [
    `↻ ${actions.turn[1] || '—'}`,
    ...(actions.push ? [actions.push[1]] : []),
  ];
  const ccwHot = flash?.dir === 0;
  const cwHot = flash?.dir === 1;
  const gapX = radius + 0.32 + KNOB_CARD_W / 2;

  return (
    <group position={[knob.x, 0, knob.z]}>
      {/* Arrows on the plate around the knob. */}
      <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ArcArrow
          radius={radius + 0.16}
          from={(110 / 180) * Math.PI}
          to={(250 / 180) * Math.PI}
          color={ccwHot ? '#ffffff' : EDGE_COLOR}
        />
        <ArcArrow
          radius={radius + 0.16}
          from={(70 / 180) * Math.PI}
          to={(-70 / 180) * Math.PI}
          color={cwHot ? '#ffffff' : EDGE_COLOR}
        />
      </group>
      {/* The knob's pointer: turns with the drags. */}
      <group ref={indicator} position={[0, capHeight + 0.004, 0]}>
        <mesh
          position={[0, 0, -radius * 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          layers={1}
        >
          <planeGeometry args={[0.07, radius * 0.8]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      </group>
      {/* Invisible disc over the knob that takes the drags. */}
      <mesh
        position={[0, capHeight + 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          (e.target as unknown as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, acc: 0, moved: false };
          actions.onTouch?.();
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          const d = drag.current;
          if (!d) return;
          d.acc += e.clientX - d.x;
          d.x = e.clientX;
          if (Math.abs(d.acc) > 4) d.moved = true;
          while (Math.abs(d.acc) >= DRAG_STEP_PX) {
            const dir = d.acc > 0 ? 1 : 0;
            d.acc -= dir === 1 ? DRAG_STEP_PX : -DRAG_STEP_PX;
            turn(dir, e.shiftKey);
          }
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          const moved = drag.current?.moved;
          drag.current = null;
          if (!moved && knob.model.pos) props.onPick(knob.model.pos);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = 'ew-resize';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <circleGeometry args={[radius + 0.08, 32]} />
        <meshBasicMaterial transparent colorWrite={false} depthWrite={false} />
      </mesh>
      <KnobCard
        x={-gapX}
        y={capHeight + 0.3}
        lines={ccwLines}
        hot={ccwHot}
        pushed={!!flash?.pushed}
      />
      <KnobCard
        x={gapX}
        y={capHeight + 0.3}
        lines={cwLines}
        hot={cwHot}
        pushed={!!flash?.pushed}
      />
    </group>
  );
}

function KnobCard(props: {
  x: number;
  y: number;
  lines: string[];
  hot: boolean;
  pushed: boolean;
}) {
  // While lit after pushing and turning, that action comes first.
  const shown =
    props.hot && props.pushed && props.lines.length > 1
      ? [props.lines[1], props.lines[0]]
      : props.lines;
  const texture = useCanvasTexture(
    KNOB_CARD_W,
    KNOB_CARD_H,
    (ctx, w, h) =>
      drawCard(ctx, w, h, shown, props.hot, props.hot ? EDGE_COLOR : undefined),
    [shown.join('\n'), props.hot]
  );
  return (
    <mesh
      position={[props.x, props.y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      layers={1}
      renderOrder={10}
    >
      <planeGeometry args={[KNOB_CARD_W, KNOB_CARD_H]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// A flat arc from angle `from` to `to` (radians, counter-clockwise from +X
// in the XY plane) with an arrowhead at `to`.
function ArcArrow(props: {
  radius: number;
  from: number;
  to: number;
  color: string;
}) {
  const { radius, from, to } = props;
  const width = 0.07;
  const start = Math.min(from, to);
  const length = Math.abs(to - from);
  const forward = to > from ? 1 : -1;
  // Tangent at the end, in the direction of travel.
  const headAngle = to + (forward * Math.PI) / 2;
  const head = 0.13;
  return (
    <group>
      <mesh layers={1} renderOrder={-1}>
        <ringGeometry
          args={[radius - width / 2, radius + width / 2, 40, 1, start, length]}
        />
        <meshBasicMaterial
          color={props.color}
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        layers={1}
        renderOrder={-1}
        position={[Math.cos(to) * radius, Math.sin(to) * radius, 0]}
        rotation={[0, 0, headAngle]}
      >
        <circleGeometry args={[head, 3]} />
        <meshBasicMaterial
          color={props.color}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

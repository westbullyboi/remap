/* eslint-disable react/no-unknown-property */
// react-three-fiber props (roughness, map, transparent, ...) are not DOM
// attributes, which this rule cannot tell.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense } from 'react';
import { VanillaDither } from './VanillaDither';
import {
  ledColor,
  LedKey,
  LightingPreviewState,
} from '../../../services/lighting/LightingPreview';

import {
  Bounds,
  CameraView,
  Key3D,
  Plate3D,
  focusView,
  overviewView,
} from './Keyboard3DGeometry';

// The 3D keyboard of Key Config. Loaded lazily (see Keymap3DView) so that
// three.js and WebGL problems never break the editor.

export type Keymap3DKey = {
  key: Key3D;
  label: string;
  // Not yet written to the keyboard.
  changed: boolean;
  encoder: boolean;
};

type Keymap3DProps = {
  keys: Keymap3DKey[];
  plates: Plate3D[];
  bounds: Bounds;
  // Where the touchpad of the right half is drawn (null: none).
  touchpad: Bounds | null;
  // Clicking the touchpad opens its settings.
  onTouchpad: () => void;
  selectedPos: string | null;
  // The key the camera zooms to (null: the whole keyboard).
  focusPos: string | null;
  // Share of the stage covered by the settings window (0 when closed).
  side: number;
  // eslint-disable-next-line no-unused-vars
  onPick: (pos: string) => void;
  onMiss: () => void;
  // The LEDs as they light up (Lighting settings open), null: not shown.
  lighting?: LedPreview | null;
  // The layer shown: changing it flips the keys over to the new legends.
  layer?: number;
  // Layer stack view: the keys of every layer, one keyboard per layer
  // stacked upwards (layer 0 at the bottom), `stackGap` apart.
  stack?: Keymap3DKey[][] | null;
  stackGap?: number;
  stackNames?: string[];
  // A key picked in the stack view, with its layer.
  // eslint-disable-next-line no-unused-vars
  onPickInLayer?: (layer: number, pos: string) => void;
  // A keycode dragged from the palette was dropped on the key at `pos`.
  // eslint-disable-next-line no-unused-vars
  onDropKey?: (pos: string) => void;
};

export type LedPreview = {
  state: LightingPreviewState;
  layer: number;
  // LED color index of the layer (0: the lighting effect).
  layerColor: number;
  // Keycode at each key position on the layer.
  codes: { [pos: string]: number };
};

const FOV = 32;
const TILT = 0.62; // radians from straight down
const STACK_TILT = 0.98; // more from the side for the layer stack
// Flip of the keys on a layer change: length and left-to-right spread.
const FLIP_SECONDS = 0.42;
const FLIP_SPREAD = 0.32;
const CAP_HEIGHT = 0.42;
const CAP_GAP = 0.1;

export default function Keymap3D(props: Keymap3DProps) {
  // The key under a keycode being dragged over the keyboard.
  const [dropPos, setDropPos] = useState<string | null>(null);
  const stack = props.stack && props.stack.length > 0 ? props.stack : null;
  const gap = props.stackGap ?? 1.4;
  const flipOn = useMemo(
    () =>
      !(
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ),
    []
  );
  return (
    <Canvas
      className="keymap3d-canvas"
      camera={{ fov: FOV, near: 0.1, far: 200, position: [0, 12, 10] }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={props.onMiss}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[-4, 10, 6]} intensity={1.6} />
      <directionalLight position={[6, 4, -4]} intensity={0.35} />
      <CameraRig
        keys={props.keys}
        bounds={props.bounds}
        focusPos={props.focusPos}
        side={props.side}
        stackHeight={stack ? (stack.length - 1) * gap : 0}
        focusY={stack ? (props.layer ?? 0) * gap : 0}
      />
      {stack ? (
        <AnimatedKeyboard>
          {stack.map((keys, layer) => (
            <group key={layer} position={[0, layer * gap, 0]}>
              {props.plates.map((plate, i) => (
                <PlateMesh key={i} plate={plate} />
              ))}
              <LayerTag
                bounds={props.bounds}
                text={`L${layer}  ${props.stackNames?.[layer] || ''}`}
                current={layer === props.layer}
              />
              {keys.map((k) => (
                <Keycap3D
                  key={k.key.model.location}
                  data={k}
                  selected={
                    layer === props.layer &&
                    !!k.key.model.pos &&
                    k.key.model.pos === props.selectedPos
                  }
                  onPick={(pos) => props.onPickInLayer?.(layer, pos)}
                />
              ))}
            </group>
          ))}
        </AnimatedKeyboard>
      ) : (
        <AnimatedKeyboard>
          {props.plates.map((plate, i) => (
            <PlateMesh key={i} plate={plate} />
          ))}
          {props.touchpad && (
            <TouchpadMesh area={props.touchpad} onPick={props.onTouchpad} />
          )}
          {props.lighting && (
            <LedOverlay
              keys={props.keys}
              bounds={props.bounds}
              lighting={props.lighting}
            />
          )}
          {props.keys.map((k) => (
            <Keycap3D
              key={k.key.model.location}
              data={k}
              selected={
                !!k.key.model.pos && k.key.model.pos === props.selectedPos
              }
              dropTarget={!!k.key.model.pos && k.key.model.pos === dropPos}
              onPick={props.onPick}
              flip={
                flipOn
                  ? {
                      token: props.layer ?? 0,
                      delay: flipDelay(k.key.x, props.bounds),
                    }
                  : undefined
              }
            />
          ))}
        </AnimatedKeyboard>
      )}
      {props.onDropKey && (
        <DropTarget onHover={setDropPos} onDrop={props.onDropKey} />
      )}
      <VanillaDither />
    </Canvas>
  );
}

function AnimatedKeyboard({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (group.current) {
      const t = clock.getElapsedTime();
      group.current.rotation.y = Math.sin(t * 0.3) * 0.08;
      group.current.rotation.x = Math.sin(t * 0.4) * 0.03;
      group.current.position.y = Math.sin(t * 0.5) * 0.15;
    }
  });
  return <group ref={group}>{children}</group>;
}

// The touchpad: a flat pad on the plate, lower than the keycaps.
function TouchpadMesh(props: { area: Bounds; onPick: () => void }) {
  const { area } = props;
  const [hover, setHover] = useState(false);
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  const w = area.maxX - area.minX;
  const d = area.maxZ - area.minZ;
  const cx = (area.minX + area.maxX) / 2;
  const cz = (area.minZ + area.maxZ) / 2;
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        props.onPick();
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      <RoundedBox
        args={[w, 0.2, d]}
        radius={0.08}
        smoothness={4}
        position={[cx, 0.08, cz]}
      >
        <meshStandardMaterial
          color="#888888"
          roughness={0.65}
          metalness={0.1}
        />
      </RoundedBox>
      {/* Touch surface */}
      <RoundedBox
        args={[w - 0.16, 0.03, d - 0.16]}
        radius={0.04}
        smoothness={2}
        position={[cx, 0.19, cz]}
      >
        <meshStandardMaterial
          color={hover ? '#c4c6cc' : '#aaaaaa'}
          roughness={0.9}
        />
      </RoundedBox>
    </group>
  );
}

// The keys' LEDs, drawn in color over the keycap tops after the 1-bit
// dithering (layer 1), recalculated every frame for the moving effects.
function LedOverlay(props: {
  keys: Keymap3DKey[];
  bounds: Bounds;
  lighting: LedPreview;
}) {
  const leds = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = props.bounds;
    return props.keys
      .filter((k) => k.key.model.pos && !k.encoder)
      .map((k, i) => ({
        key: k.key,
        pos: k.key.model.pos,
        px: (k.key.x - minX) / Math.max(maxX - minX, 1),
        py: (k.key.z - minZ) / Math.max(maxZ - minZ, 1),
        seed: i + 1,
      }));
  }, [props.keys, props.bounds]);
  const materials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const lighting = useRef(props.lighting);
  lighting.current = props.lighting;

  useFrame(({ clock }) => {
    const { state, layer, layerColor, codes } = lighting.current;
    const t = clock.getElapsedTime();
    leds.forEach((led, i) => {
      const material = materials.current[i];
      if (!material) return;
      const key: LedKey = {
        px: led.px,
        py: led.py,
        code: codes[led.pos] ?? 0x04,
        seed: led.seed,
      };
      const color = ledColor(key, t, state.rgb, layer, layerColor, state.guide);
      if (!color) {
        material.visible = false;
        return;
      }
      material.visible = true;
      // Brighter LEDs read as more opaque light on the cap.
      const level = Math.max(...color);
      material.color.setRGB(
        color[0] / level,
        color[1] / level,
        color[2] / level
      );
      material.opacity = 0.25 + 0.55 * level;
    });
  });

  return (
    <>
      {leds.map((led, i) => (
        <group
          key={led.pos}
          position={[led.key.x, CAP_HEIGHT + 0.0015, led.key.z]}
          rotation={[0, led.key.angle, 0]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]} layers={1} renderOrder={-1}>
            <planeGeometry
              args={[
                Math.max(led.key.w - CAP_GAP - 0.05, 0.25),
                Math.max(led.key.d - CAP_GAP - 0.05, 0.25),
              ]}
            />
            <meshBasicMaterial
              ref={(m) => {
                materials.current[i] = m;
              }}
              transparent
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

// Drops of keycodes dragged from the palette (HTML drag and drop) onto the
// 3D keys: the key under the pointer is found by casting a ray into the
// scene and reading the `pos` the key's group carries.
function DropTarget(props: {
  // eslint-disable-next-line no-unused-vars
  onHover: (pos: string | null) => void;
  // eslint-disable-next-line no-unused-vars
  onDrop: (pos: string) => void;
}) {
  const { gl, camera, scene } = useThree();
  const handlers = useRef(props);
  handlers.current = props;
  useEffect(() => {
    const el = gl.domElement;
    // Listen on the whole stage: overlays above the canvas get the events.
    const area: HTMLElement =
      el.closest<HTMLElement>('.mx-stage') || el.parentElement || el;
    const raycaster = new THREE.Raycaster();
    const keyAt = (e: DragEvent): string | null => {
      // Not through the settings windows or the stage's buttons.
      const target = e.target as Element | null;
      if (target?.closest?.('.mx-win, .mx-float')) return null;
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1
        ),
        camera
      );
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
          if (o.userData && o.userData.pos) return o.userData.pos;
        }
      }
      return null;
    };
    let last: string | null = null;
    const hover = (pos: string | null) => {
      if (pos !== last) {
        last = pos;
        handlers.current.onHover(pos);
      }
    };
    const onOver = (e: DragEvent) => {
      const pos = keyAt(e);
      if (pos) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      }
      hover(pos);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const pos = keyAt(e);
      hover(null);
      if (pos) handlers.current.onDrop(pos);
    };
    const onLeave = () => hover(null);
    area.addEventListener('dragover', onOver);
    area.addEventListener('drop', onDrop);
    area.addEventListener('dragleave', onLeave);
    return () => {
      area.removeEventListener('dragover', onOver);
      area.removeEventListener('drop', onDrop);
      area.removeEventListener('dragleave', onLeave);
    };
  }, [gl, camera, scene]);
  return null;
}

// Keys flip one after the other from left to right.
function flipDelay(x: number, bounds: Bounds): number {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  return ((x - bounds.minX) / width) * FLIP_SPREAD;
}

// Name of a layer beside its keyboard in the stack view (drawn after the
// dithering, like the legends).
function LayerTag(props: { bounds: Bounds; text: string; current: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = props.current ? '#0e0e10' : 'rgba(255,255,255,0.92)';
    const r = 40;
    ctx.beginPath();
    ctx.moveTo(r, 4);
    ctx.arcTo(508, 4, 508, 92, r);
    ctx.arcTo(508, 92, 4, 92, r);
    ctx.arcTo(4, 92, 4, 4, r);
    ctx.arcTo(4, 4, 508, 4, r);
    ctx.fill();
    ctx.fillStyle = props.current ? '#ffffff' : '#0e0e10';
    ctx.font = '600 44px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.text.slice(0, 18), 32, 50);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [props.text, props.current]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh
      position={[props.bounds.minX - 2.4, 0.05, props.bounds.minZ + 0.5]}
      rotation={[-Math.PI / 2, 0, 0]}
      layers={1}
    >
      <planeGeometry args={[3.6, 0.68]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

// Eases the camera to the overview or to the focused key.
function CameraRig(props: {
  keys: Keymap3DKey[];
  bounds: Bounds;
  focusPos: string | null;
  side: number;
  // Stack view: height of the stack and the height of the shown layer.
  stackHeight?: number;
  focusY?: number;
}) {
  const { camera, size } = useThree();
  const stackHeight = props.stackHeight || 0;
  // Look at a stack more from the side, so the layers come apart.
  const tilt = stackHeight > 0 ? STACK_TILT : TILT;
  const aspect = size.width / Math.max(size.height, 1);
  const view: CameraView = useMemo(() => {
    const focused = props.focusPos
      ? props.keys.find((k) => k.key.model.pos === props.focusPos)
      : undefined;
    return focused
      ? focusView(focused.key, FOV, aspect, tilt, props.side)
      : overviewView(props.bounds, FOV, aspect, tilt, props.side);
  }, [props.keys, props.bounds, props.focusPos, props.side, aspect, tilt]);
  const focused = !!props.focusPos;
  const targetY = focused ? props.focusY || 0 : stackHeight / 2;
  const distance = focused ? view.distance : view.distance + stackHeight * 1.1;

  const target = useRef(new THREE.Vector3(view.targetX, 0, view.targetZ));
  const first = useRef(true);
  useFrame((_, delta) => {
    const goal = new THREE.Vector3(view.targetX, targetY, view.targetZ);
    const goalPos = goal
      .clone()
      .add(
        new THREE.Vector3(
          0,
          distance * Math.cos(tilt),
          distance * Math.sin(tilt)
        )
      );
    // Jump on the first frame, then ease (about 0.8s to settle).
    const k = first.current ? 1 : 1 - Math.exp(-delta * 5);
    first.current = false;
    target.current.lerp(goal, k);
    camera.position.lerp(goalPos, k);
    camera.lookAt(target.current);
  });
  return null;
}

// Base plate: the plate's outline, extruded down from just below the keys.
const PLATE_THICKNESS = 0.36;
const PLATE_TOP = -0.02;

function PlateMesh(props: { plate: Plate3D }) {
  const { outline } = props.plate;
  const geometry = useMemo(() => {
    if (outline.length < 3) return null;
    // Shape in the X-Y plane with y = -z, laid flat by turning it -90
    // degrees around X; the extrusion then goes up.
    const shape = new THREE.Shape(
      outline.map(([x, z]) => new THREE.Vector2(x, -z))
    );
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: PLATE_THICKNESS - 0.08,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
      curveSegments: 4,
    });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [outline]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh
      geometry={geometry}
      position={[0, PLATE_TOP - PLATE_THICKNESS + 0.04, 0]}
    >
      <meshStandardMaterial color="#888888" roughness={0.65} metalness={0.1} />
    </mesh>
  );
}

function Keycap3D(props: {
  data: Keymap3DKey;
  selected: boolean;
  // A dragged keycode would land on this key.
  dropTarget?: boolean;
  // eslint-disable-next-line no-unused-vars
  onPick: (pos: string) => void;
  // Flips over when `token` (the layer) changes, after `delay` seconds.
  flip?: { token: number; delay: number };
}) {
  const { key, changed, encoder } = props.data;
  // The legend shown: on a layer change it switches halfway through the
  // flip, otherwise at once.
  const [label, setLabel] = useState(props.data.label);
  const latest = useRef(props.data.label);
  latest.current = props.data.label;
  const flipToken = props.flip?.token;
  const lastToken = useRef(flipToken);
  const flipStart = useRef<number | null>(null);
  const swapped = useRef(true);
  const flipper = useRef<THREE.Group>(null);
  useEffect(() => {
    if (flipToken !== lastToken.current && props.flip) {
      lastToken.current = flipToken;
      flipStart.current = performance.now() / 1000 + props.flip.delay;
      swapped.current = false;
      return;
    }
    if (flipStart.current === null) setLabel(props.data.label);
  }, [props.data.label, flipToken]);
  useFrame(() => {
    const el = flipper.current;
    if (!el || flipStart.current === null) return;
    const p = (performance.now() / 1000 - flipStart.current) / FLIP_SECONDS;
    if (p < 0) return;
    if (p >= 0.5 && !swapped.current) {
      swapped.current = true;
      setLabel(latest.current);
    }
    if (p >= 1) {
      el.rotation.x = 0;
      flipStart.current = null;
      setLabel(latest.current);
      return;
    }
    el.rotation.x = p < 0.5 ? p * Math.PI : (p - 1) * Math.PI;
  });
  const pos = key.model.pos;
  const [hover, setHover] = useState(false);
  const group = useRef<THREE.Group>(null);
  const w = Math.max(key.w - CAP_GAP, 0.3);
  const d = Math.max(key.d - CAP_GAP, 0.3);
  const lift = props.selected ? 0.14 : hover || props.dropTarget ? 0.08 : 0;
  const texture = useLabelTexture(label, w, d, props.selected);

  // Eases the cap up when hovered or selected.
  useFrame((_, delta) => {
    if (!group.current) return;
    const y = group.current.position.y;
    group.current.position.y = y + (lift - y) * (1 - Math.exp(-delta * 14));
  });

  const pickable = !!pos;
  const handlers = pickable
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          props.onPick(pos);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          setHover(false);
          document.body.style.cursor = '';
        },
      }
    : {};

  const capColor = props.selected ? '#18191d' : '#f4f5f7';
  return (
    <group position={[key.x, 0, key.z]} rotation={[0, key.angle, 0]}>
      <group ref={group} userData={pos ? { pos } : {}} {...handlers}>
        <group ref={flipper} position={[0, CAP_HEIGHT / 2, 0]}>
          <group position={[0, -CAP_HEIGHT / 2, 0]}>
            {encoder ? (
              <mesh position={[0, CAP_HEIGHT / 2, 0]}>
                <cylinderGeometry
                  args={[
                    Math.min(w, d) * 0.46,
                    Math.min(w, d) * 0.48,
                    CAP_HEIGHT,
                    40,
                  ]}
                />
                <meshStandardMaterial
                  color={props.selected ? '#18191d' : '#454952'}
                  roughness={0.5}
                />
              </mesh>
            ) : (
              <RoundedBox
                args={[w, CAP_HEIGHT, d]}
                radius={0.08}
                smoothness={3}
                position={[0, CAP_HEIGHT / 2, 0]}
              >
                <meshStandardMaterial color={capColor} roughness={0.45} />
              </RoundedBox>
            )}
            <mesh
              position={[0, CAP_HEIGHT + 0.002, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              layers={1}
            >
              <planeGeometry args={[w * 0.92, d * 0.92]} />
              <meshBasicMaterial map={texture} transparent toneMapped={false} />
            </mesh>
            {props.selected && (
              <mesh
                position={[0, 0.01, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                layers={1}
              >
                <planeGeometry args={[w + 0.16, d + 0.16]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.65} />
              </mesh>
            )}
            {changed && (
              <mesh
                position={[w / 2 - 0.12, CAP_HEIGHT + 0.01, -d / 2 + 0.12]}
                layers={1}
              >
                <sphereGeometry args={[0.08, 16, 16]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}

// The key label, drawn on a canvas and used as the texture of the top face.
function useLabelTexture(
  label: string,
  w: number,
  d: number,
  selected: boolean
): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const px = 128;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(px * w);
    canvas.height = Math.round(px * d);
    const ctx = canvas.getContext('2d');
    if (ctx) drawLabel(ctx, canvas.width, canvas.height, label, selected);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [label, w, d, selected]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  label: string,
  selected: boolean
) {
  ctx.clearRect(0, 0, width, height);
  const lines = (label || '').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return;
  ctx.fillStyle = selected ? '#ffffff' : '#1d1e22';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(
    height / (lines.length + 1.2),
    (width * 0.9) / Math.max(longest * 0.62, 1),
    46
  );
  ctx.font = `700 ${Math.round(size)}px 'IBM Plex Sans JP', system-ui, sans-serif`;
  const lineHeight = size * 1.15;
  const top = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, top + i * lineHeight, width * 0.92);
  });
}

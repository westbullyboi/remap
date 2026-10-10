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
  Bounds,
  CameraView,
  Key3D,
  Plate,
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
  plates: Plate[];
  bounds: Bounds;
  selectedPos: string | null;
  // The key the camera zooms to (null: the whole keyboard).
  focusPos: string | null;
  // Share of the stage covered by the settings window (0 when closed).
  side: number;
  // eslint-disable-next-line no-unused-vars
  onPick: (pos: string) => void;
  onMiss: () => void;
};

const FOV = 32;
const TILT = 0.62; // radians from straight down
const CAP_HEIGHT = 0.42;
const CAP_GAP = 0.1;

export default function Keymap3D(props: Keymap3DProps) {
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
      />
      <AnimatedKeyboard>
        {props.plates.map((plate, i) => (
          <PlateMesh key={i} plate={plate} />
        ))}
        <TouchpadMesh keys={props.keys} />
        {props.keys.map((k) => (
          <Keycap3D
            key={k.key.model.location}
            data={k}
            selected={
              !!k.key.model.pos && k.key.model.pos === props.selectedPos
            }
            onPick={props.onPick}
          />
        ))}
      </AnimatedKeyboard>
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

function TouchpadMesh(props: { keys: Keymap3DKey[] }) {
  // Find keys on the right half (x > 8)
  const rightKeys = props.keys.filter((k) => k.key.x > 8);
  if (rightKeys.length === 0) return null;

  // The user says: "タッチパッドの位置は右キーボードの下部に存在する左端キーの上にタッチパッドが存在するのが正しい"
  // Let's find the leftmost key (minX).
  const minX = Math.min(...rightKeys.map((k) => k.key.x));
  const minXKeys = rightKeys.filter((k) => Math.abs(k.key.x - minX) < 0.1);
  // Among them, find the one at the bottom (maxZ).
  const maxZ = Math.max(...minXKeys.map((k) => k.key.z));
  const targetKey = minXKeys.find((k) => Math.abs(k.key.z - maxZ) < 0.1);

  if (!targetKey) return null;

  // Trackpad dimensions, slightly larger than a 1u keycap
  const w = 1.3;
  const d = 1.3;

  // Center exactly on the target key
  const cx = targetKey.key.x;
  const cz = targetKey.key.z;

  return (
    <group>
      {/* Base that covers the keycap completely */}
      <RoundedBox
        args={[w, 0.55, d]}
        radius={0.1}
        smoothness={4}
        position={[cx, 0.275, cz]}
      >
        <meshStandardMaterial
          color="#888888"
          roughness={0.65}
          metalness={0.1}
        />
      </RoundedBox>
      {/* Touchpad surface */}
      <RoundedBox
        args={[w - 0.2, 0.04, d - 0.2]}
        radius={0.05}
        smoothness={2}
        position={[cx, 0.57, cz]}
      >
        <meshStandardMaterial color="#aaaaaa" roughness={0.9} />
      </RoundedBox>
    </group>
  );
}

// Eases the camera to the overview or to the focused key.
function CameraRig(props: {
  keys: Keymap3DKey[];
  bounds: Bounds;
  focusPos: string | null;
  side: number;
}) {
  const { camera, size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const view: CameraView = useMemo(() => {
    const focused = props.focusPos
      ? props.keys.find((k) => k.key.model.pos === props.focusPos)
      : undefined;
    return focused
      ? focusView(focused.key, FOV, aspect, TILT, props.side)
      : overviewView(props.bounds, FOV, aspect, TILT, props.side);
  }, [props.keys, props.bounds, props.focusPos, props.side, aspect]);

  const target = useRef(new THREE.Vector3(view.targetX, 0, view.targetZ));
  const first = useRef(true);
  useFrame((_, delta) => {
    const goal = new THREE.Vector3(view.targetX, 0, view.targetZ);
    const goalPos = goal
      .clone()
      .add(
        new THREE.Vector3(
          0,
          view.distance * Math.cos(TILT),
          view.distance * Math.sin(TILT)
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

function PlateMesh(props: { plate: Plate }) {
  const { plate } = props;
  const pad = 0.28;
  const w = plate.maxX - plate.minX + pad * 2;
  const d = plate.maxZ - plate.minZ + pad * 2;
  return (
    <RoundedBox
      args={[w, 0.36, d]}
      radius={0.16}
      smoothness={4}
      position={[
        (plate.minX + plate.maxX) / 2,
        -0.2,
        (plate.minZ + plate.maxZ) / 2,
      ]}
    >
      <meshStandardMaterial color="#888888" roughness={0.65} metalness={0.1} />
    </RoundedBox>
  );
}

function Keycap3D(props: {
  data: Keymap3DKey;
  selected: boolean;
  // eslint-disable-next-line no-unused-vars
  onPick: (pos: string) => void;
}) {
  const { key, label, changed, encoder } = props.data;
  const pos = key.model.pos;
  const [hover, setHover] = useState(false);
  const group = useRef<THREE.Group>(null);
  const w = Math.max(key.w - CAP_GAP, 0.3);
  const d = Math.max(key.d - CAP_GAP, 0.3);
  const lift = props.selected ? 0.14 : hover ? 0.06 : 0;
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
      <group ref={group} {...handlers}>
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

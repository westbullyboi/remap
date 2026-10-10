import React, { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Bounds } from './Keyboard3DGeometry';

export function CustomModel(props: { bounds: Bounds }) {
  const [scene, setScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loader = new GLTFLoader();
    loader.load('/3D/white_mesh.glb', (gltf) => {
      if (isMounted) {
        setScene(gltf.scene);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Clone and scale/rotate the model as necessary for Remap
  const clone = useMemo(() => {
    if (!scene) return null;
    const cloned = scene.clone();

    // trimesh usually exports with Z-up, so we rotate it to Y-up
    cloned.rotation.x = -Math.PI / 2;
    cloned.updateMatrixWorld(true);

    cloned.traverse((node: any) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        // Since trimesh GLB might lack materials or have pure white,
        // we enforce a nice default material so it reacts well to the dithering.
        node.material = new THREE.MeshStandardMaterial({
          color: '#cccccc',
          roughness: 0.6,
        });
      }
    });

    // Compute bounding box of the GLB model AFTER rotation
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Compute bounding box of the keycaps
    const w = props.bounds.maxX - props.bounds.minX;
    const d = props.bounds.maxZ - props.bounds.minZ;
    const cx = (props.bounds.minX + props.bounds.maxX) / 2;
    const cz = (props.bounds.minZ + props.bounds.maxZ) / 2;

    // Scale model to match the width or depth of the keycaps, whichever is more constrained
    // This prevents the model from stretching out of bounds if proportions don't exactly match
    const padding = 1.1;
    const scaleX = (w * padding) / size.x;
    const scaleZ = (d * padding) / size.z;
    const scale = Math.max(scaleX, scaleZ); // Ensure it encompasses all keys

    cloned.scale.set(scale, scale, scale);
    cloned.updateMatrixWorld(true);

    // Recompute bounding box after scaling to properly align Y
    const scaledBox = new THREE.Box3().setFromObject(cloned);

    // Center the model under the keycaps
    // offset so the top of the case is slightly below the keys (y = -0.1)
    cloned.position.set(
      cx - center.x * scale,
      -0.1 - scaledBox.max.y,
      cz - center.z * scale
    );

    return cloned;
  }, [scene, props.bounds]);

  if (!clone) return null;

  return <primitive object={clone} />;
}

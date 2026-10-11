import React, { useMemo, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, RenderPass, EffectPass } from 'postprocessing';
import { DitheringEffect } from './DitheringEffect';

export function VanillaDither() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    if (!composerRef.current) {
      composerRef.current = new EffectComposer(gl);
    }
    const composer = composerRef.current;
    composer.removeAllPasses();

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // One dot per CSS pixel: the finest 1-bit dithering that stays crisp
    // (gridSize is in render pixels, so it follows the device pixel ratio).
    const ditherEffect = new DitheringEffect({
      gridSize: Math.max(1, Math.round(gl.getPixelRatio())),
      pixelSizeRatio: 1.0,
      grayscaleOnly: true,
      // A little pixel glitch, not with reduced motion.
      glitch:
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : 1,
    });

    composer.addPass(new EffectPass(camera, ditherEffect));

    composer.setSize(size.width, size.height);
  }, [gl, scene, camera, size]);

  useFrame(() => {
    if (!composerRef.current) return;

    // Render Layer 0 (Models, Keycap bodies) to composer with dithering
    camera.layers.set(0);
    composerRef.current.render();

    // Render Layer 1 (Text Labels, overlays) cleanly on top without dithering
    camera.layers.set(1);
    gl.autoClear = false;
    gl.clearDepth(); // Prevents dithered objects from obscuring text
    gl.render(scene, camera);
    gl.autoClear = true;

    // Restore layer to 0 for raycasting (picking keys)
    camera.layers.set(0);
  }, 1);

  return null;
}

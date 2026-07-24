"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import type { AudioApi } from "@/hooks/useAudioAnalyser";
import type { SystemTheme } from "@/hooks/useSystemTheme";
import { getDotTexture } from "./dotTexture";

const BAR_COUNT = 56; // angular slices around the ring
const POINTS_PER_BAR = 34; // vertical density of one column of dots
const RADIUS = 2.6;
// Small tangential wobble applied per point so a column reads as a soft
// cluster of dots rather than a rigid rod — kept well under the angular gap
// between neighboring bars (circumference / BAR_COUNT ≈ 0.29 at this
// radius) so columns stay visually distinct instead of bleeding together.
const JITTER = 0.045;

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

// Same point-cloud technique as OrbScene: a shared BufferGeometry rewritten
// every frame from precomputed base layout, soft round sprites instead of
// hard-edged squares, vertex colors, and (in light theme) a second additive
// glow layer underneath — no meshes, no scene lights. Each of the BAR_COUNT
// angular slices gets a column of POINTS_PER_BAR points; a point's Y is
// `frac * thatColumn'sCurrentHeight` (frac = its fixed slot within the
// column, 0 at the base, 1 at the tip), so raising a column's height reveals
// points climbing up it — a particle "fill level" instead of an extruded box.
export default function TerrainScene({
  audio,
  particleColors,
  theme,
}: {
  audio: AudioApi;
  particleColors: { bass: string; treble: string };
  theme: SystemTheme;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const heightsRef = useRef(new Float32Array(BAR_COUNT));
  const noise3D = useMemo(() => createNoise3D(), []);
  const dotMap = useMemo(() => getDotTexture(), []);

  const bassRgb = useMemo(() => hexToRgb(particleColors.bass), [particleColors.bass]);
  const trebleRgb = useMemo(() => hexToRgb(particleColors.treble), [particleColors.treble]);

  const { barIndex, angle, frac, baseX, baseZ, positions, colors, count } =
    useMemo(() => {
      const n = BAR_COUNT * POINTS_PER_BAR;
      const barIndexArr = new Float32Array(n);
      const angleArr = new Float32Array(n);
      const fracArr = new Float32Array(n);
      const baseXArr = new Float32Array(n);
      const baseZArr = new Float32Array(n);
      const positionsArr = new Float32Array(n * 3);
      const colorsArr = new Float32Array(n * 3);

      let idx = 0;
      for (let b = 0; b < BAR_COUNT; b++) {
        const a = (b / BAR_COUNT) * Math.PI * 2;
        const x = Math.cos(a) * RADIUS;
        const z = Math.sin(a) * RADIUS;
        for (let p = 0; p < POINTS_PER_BAR; p++) {
          const f = p / (POINTS_PER_BAR - 1);
          barIndexArr[idx] = b;
          angleArr[idx] = a;
          fracArr[idx] = f;
          baseXArr[idx] = x;
          baseZArr[idx] = z;
          // Seeded at the resting (near-silent) height, not the origin —
          // otherwise every point would flash bunched at (0,0,0) for the
          // one frame before useFrame first runs.
          positionsArr[idx * 3] = x;
          positionsArr[idx * 3 + 1] = f * 0.15;
          positionsArr[idx * 3 + 2] = z;
          idx++;
        }
      }

      return {
        barIndex: barIndexArr,
        angle: angleArr,
        frac: fracArr,
        baseX: baseXArr,
        baseZ: baseZArr,
        positions: positionsArr,
        colors: colorsArr,
        count: n,
      };
    }, []);

  // One real geometry shared by both the solid point layer and (in light
  // theme) the additive glow layer beneath it — see the identical comment
  // in OrbScene.
  const sharedGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    const points = pointsRef.current;
    if (!group || !points) return;

    const spectrum = audio.getSpectrum(BAR_COUNT);
    const heights = heightsRef.current;
    let energy = 0;

    // Same height curve the old mesh bars used: a floor plus spectrum
    // scaled up, eased toward the target rather than snapping straight to
    // it so a hit doesn't pop instantaneously.
    for (let b = 0; b < BAR_COUNT; b++) {
      const target = 0.15 + spectrum[b] * 2.4;
      heights[b] = THREE.MathUtils.lerp(heights[b], target, 0.3);
      energy += spectrum[b];
    }

    // Read through the ref rather than the `sharedGeometry` variable
    // directly — see the identical comment in OrbScene's useFrame for why
    // (keeps the React Compiler lint rule against mutating a hook's return
    // value from firing on these in-place array writes).
    const posAttr = points.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    const colorAttr = points.geometry.getAttribute(
      "color"
    ) as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colorArr = colorAttr.array as Float32Array;

    const t = state.clock.elapsedTime;
    const [bassR, bassG, bassB] = bassRgb;
    const [trebleR, trebleG, trebleB] = trebleRgb;

    for (let i = 0; i < count; i++) {
      const b = barIndex[i];
      const h = heights[b];
      const f = frac[i];
      const ix = i * 3;

      const wobble =
        noise3D(baseX[i] * 0.6, baseZ[i] * 0.6, t * 0.4 + f * 3) * JITTER;
      const tangent = angle[i] + Math.PI / 2;
      posArr[ix] = baseX[i] + Math.cos(tangent) * wobble;
      posArr[ix + 1] = f * h;
      posArr[ix + 2] = baseZ[i] + Math.sin(tangent) * wobble;

      const level = THREE.MathUtils.clamp(spectrum[b], 0, 1);
      // Points near a column's tip run hotter than its base even at the
      // same overall level, so a tall spike looks like it's catching fire
      // at the top instead of being one flat color end to end.
      const factor = THREE.MathUtils.clamp(level * 0.8 + f * 0.35, 0, 1);
      colorArr[ix] = bassR + (trebleR - bassR) * factor;
      colorArr[ix + 1] = bassG + (trebleG - bassG) * factor;
      colorArr[ix + 2] = bassB + (trebleB - bassB) * factor;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    group.rotation.y += delta * (0.05 + (energy / BAR_COUNT) * 0.25);
  });

  const isLight = theme === "light";

  return (
    <group ref={groupRef}>
      {isLight && (
        <points geometry={sharedGeometry}>
          <pointsMaterial
            map={dotMap}
            size={0.09}
            sizeAttenuation
            vertexColors
            transparent
            opacity={0.16}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}
      <points ref={pointsRef} geometry={sharedGeometry}>
        <pointsMaterial
          map={dotMap}
          size={isLight ? 0.06 : 0.045}
          sizeAttenuation
          vertexColors
          transparent
          opacity={isLight ? 1 : 0.9}
          blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending}
          depthWrite={isLight}
        />
      </points>
    </group>
  );
}

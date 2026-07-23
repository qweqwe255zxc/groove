"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import type { AudioApi } from "@/hooks/useAudioAnalyser";
import type { Palette } from "../palettes";

const DETAIL = 34; // icosahedron subdivision — ~10*DETAIL^2+2 points, dense enough to read as a solid cloud
const BASE_RADIUS = 1.6;

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export default function OrbScene({
  audio,
  palette,
}: {
  audio: AudioApi;
  palette: Palette;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const noise3D = useMemo(() => createNoise3D(), []);

  // A pristine copy of the sphere's resting positions/normals — every frame
  // displaces *from* this, never from the previous frame's already-displaced
  // positions, or the cloud would drift outward instead of pulsing in place.
  const { basePositions, normals, positions, colors, count } = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(BASE_RADIUS, DETAIL);
    const base = new Float32Array(geo.attributes.position.array);
    const n = base.length / 3;
    const normalArr = new Float32Array(base.length);

    for (let i = 0; i < n; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const z = base[i * 3 + 2];
      const len = Math.hypot(x, y, z) || 1;
      normalArr[i * 3] = x / len;
      normalArr[i * 3 + 1] = y / len;
      normalArr[i * 3 + 2] = z / len;
    }

    geo.dispose();
    return {
      basePositions: base,
      normals: normalArr,
      positions: new Float32Array(base),
      colors: new Float32Array(base.length),
      count: n,
    };
  }, []);

  useFrame((state, delta) => {
    const { bass, treble, overall } = audio.getBands();
    const points = pointsRef.current;
    if (!points) return;

    const posAttr = points.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    const colorAttr = points.geometry.getAttribute(
      "color"
    ) as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colorArr = colorAttr.array as Float32Array;

    const t = state.clock.elapsedTime;
    const strength = 0.12 + bass * 0.85;
    const [bassR, bassG, bassB] = hexToRgb(palette.bass);
    const [trebleR, trebleG, trebleB] = hexToRgb(palette.treble);

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const iy = ix + 1;
      const iz = ix + 2;
      const nx = normals[ix];
      const ny = normals[iy];
      const nz = normals[iz];

      const n = noise3D(nx * 1.1 + t * 0.15, ny * 1.1 + t * 0.15, nz * 1.1 + t * 0.15);
      const disp = n * strength;

      posArr[ix] = basePositions[ix] + nx * disp;
      posArr[iy] = basePositions[iy] + ny * disp;
      posArr[iz] = basePositions[iz] + nz * disp;

      // Points pushed furthest out by the noise field read as "hotter" —
      // lerp per-point from the bass color toward the treble color.
      const factor = THREE.MathUtils.clamp((n + 1) / 2 + treble * 0.4, 0, 1);
      colorArr[ix] = bassR + (trebleR - bassR) * factor;
      colorArr[iy] = bassG + (trebleG - bassG) * factor;
      colorArr[iz] = bassB + (trebleB - bassB) * factor;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * (0.08 + overall * 0.25);
      groupRef.current.rotation.x += delta * 0.02;
    }
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.022}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

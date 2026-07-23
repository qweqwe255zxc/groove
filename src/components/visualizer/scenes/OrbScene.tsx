"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import type { AudioApi } from "@/hooks/useAudioAnalyser";
import type { Palette } from "../palettes";

const DETAIL = 34; // icosahedron subdivision — ~10*DETAIL^2+2 points, dense enough to read as a solid cloud
const BASE_RADIUS = 1.6;
// How many frequency slices get wrapped around the sphere's equator — enough
// bands to read as "different regions responding to different frequencies"
// without looking like per-point noise. Bins blend into their neighbor (see
// binPositions below) so there's no hard seam between adjacent slices.
const SPECTRUM_BINS = 10;

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
  // `binPositions` assigns each point a fixed (fractional) frequency-bin
  // index based on its longitude around the Y axis — since the geometry
  // itself never moves (only the whole group rotates), the same physical
  // points stay locked to the same bin, so a slice of sphere reads as
  // "always the bass region," another as "always the treble region," and
  // the whole pattern only turns as the group's own rotation carries it.
  const { basePositions, normals, binPositions, positions, colors, count } =
    useMemo(() => {
      const geo = new THREE.IcosahedronGeometry(BASE_RADIUS, DETAIL);
      const base = new Float32Array(geo.attributes.position.array);
      const n = base.length / 3;
      const normalArr = new Float32Array(base.length);
      const binArr = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        const z = base[i * 3 + 2];
        const len = Math.hypot(x, y, z) || 1;
        const nx = x / len;
        const ny = y / len;
        const nz = z / len;
        normalArr[i * 3] = nx;
        normalArr[i * 3 + 1] = ny;
        normalArr[i * 3 + 2] = nz;

        const longitude = Math.atan2(nz, nx); // -PI..PI
        binArr[i] = ((longitude + Math.PI) / (Math.PI * 2)) * SPECTRUM_BINS;
      }

      geo.dispose();
      return {
        basePositions: base,
        normals: normalArr,
        binPositions: binArr,
        positions: new Float32Array(base),
        colors: new Float32Array(base.length),
        count: n,
      };
    }, []);

  useFrame((state, delta) => {
    const { bass, overall } = audio.getBands();
    const spectrum = audio.getSpectrum(SPECTRUM_BINS);
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
    const [bassR, bassG, bassB] = hexToRgb(palette.bass);
    const [trebleR, trebleG, trebleB] = hexToRgb(palette.treble);

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const iy = ix + 1;
      const iz = ix + 2;
      const nx = normals[ix];
      const ny = normals[iy];
      const nz = normals[iz];

      // Blend this point's two nearest frequency bins so the sphere reads
      // as continuous bands rather than a hard-edged pie-slice pattern.
      const binPos = binPositions[i];
      const bin0 = Math.floor(binPos) % SPECTRUM_BINS;
      const bin1 = (bin0 + 1) % SPECTRUM_BINS;
      const frac = binPos - Math.floor(binPos);
      const freq = spectrum[bin0] + (spectrum[bin1] - spectrum[bin0]) * frac;
      // Raising to a power (rather than a linear blend) is what actually
      // produces "one side barely moves, the opposite side goes off" — a
      // quiet bin (freq ~0.1) gets crushed toward ~0, a loud one (freq ~1.5)
      // gets pushed well past 1, so the gap between a quiet and a loud
      // region widens far more than the raw spectrum values would alone.
      const regional = Math.pow(freq / 1.4, 1.8);

      const n = noise3D(nx * 1.1 + t * 0.15, ny * 1.1 + t * 0.15, nz * 1.1 + t * 0.15);
      // FLOOR keeps a "barely moves" region from going perfectly static
      // (reads as dead/frozen otherwise); the small shared bass term is what
      // keeps every region on roughly the same underlying wave/beat even
      // while `regional` is what actually drives the huge point-to-point
      // spread in amplitude.
      const FLOOR = 0.05;
      const strength = FLOOR + bass * 0.15 + regional * 1.9;
      const disp = n * strength;

      posArr[ix] = basePositions[ix] + nx * disp;
      posArr[iy] = basePositions[iy] + ny * disp;
      posArr[iz] = basePositions[iz] + nz * disp;

      // Color follows the same regional signal, with the same exaggerated
      // curve — a region that's barely moving stays close to the bass color,
      // one that's going wild swings hard toward the treble color, so shape
      // and color read as the same cause rather than two separate effects.
      const factor = THREE.MathUtils.clamp(regional * 0.85 + (n + 1) * 0.08, 0, 1);
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

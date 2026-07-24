"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AudioApi } from "@/hooks/useAudioAnalyser";
import type { SystemTheme } from "@/hooks/useSystemTheme";
import type { Palette } from "../palettes";

const BAR_COUNT = 56;
const RADIUS = 2.6;

export default function TerrainScene({
  audio,
  palette,
  theme,
}: {
  audio: AudioApi;
  palette: Palette;
  theme: SystemTheme;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const barsRef = useRef<THREE.Mesh[]>([]);
  const heightsRef = useRef(new Float32Array(BAR_COUNT));

  const layout = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const angle = (i / BAR_COUNT) * Math.PI * 2;
      return {
        angle,
        x: Math.cos(angle) * RADIUS,
        z: Math.sin(angle) * RADIUS,
      };
    });
  }, []);

  // Reused across every bar/frame instead of `new THREE.Color(...)`-ing
  // inside the loop, which would otherwise allocate ~3k objects a second.
  const bassColor = useMemo(() => new THREE.Color(palette.bass), [palette.bass]);
  const trebleColor = useMemo(() => new THREE.Color(palette.treble), [palette.treble]);
  const mixColor = useRef(new THREE.Color());
  // The point lights below were tuned for a near-black scene, where they add
  // mood without any risk of overexposure. Against the light theme's already
  // bright backdrop, the same intensities plus the emissive bars blew the
  // whole frame out to solid white under Bloom — scaled down here so the
  // lights still shape the bars without themselves being the thing blooming.
  const isLight = theme === "light";

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const spectrum = audio.getSpectrum(BAR_COUNT);
    const heights = heightsRef.current;
    let energy = 0;

    for (let i = 0; i < BAR_COUNT; i++) {
      const bar = barsRef.current[i];
      if (!bar) continue;

      const level = Math.min(spectrum[i], 1);
      const target = 0.15 + spectrum[i] * 2.4;
      heights[i] = THREE.MathUtils.lerp(heights[i], target, 0.3);
      energy += spectrum[i];

      bar.scale.y = heights[i];
      bar.position.y = heights[i] / 2;

      const material = bar.material as THREE.MeshStandardMaterial;
      mixColor.current.lerpColors(bassColor, trebleColor, level);
      material.color.copy(mixColor.current);
      material.emissive.copy(mixColor.current);
      material.emissiveIntensity = isLight ? 0.1 + level * 0.9 : 0.15 + level * 1.4;
    }

    group.rotation.y += delta * (0.05 + (energy / BAR_COUNT) * 0.25);
  });

  return (
    <>
      <ambientLight intensity={isLight ? 0.6 : 0.35} />
      <pointLight position={[0, 5, 0]} intensity={isLight ? 3 : 25} color={palette.bass} />
      <pointLight position={[0, -2, -4]} intensity={isLight ? 1.5 : 12} color={palette.treble} />
      <directionalLight position={[3, 4, 5]} intensity={isLight ? 0.9 : 0.6} />
      <group ref={groupRef}>
        {layout.map((pos, i) => (
          <mesh
            key={i}
            ref={(el) => {
              if (el) barsRef.current[i] = el;
            }}
            position={[pos.x, 0.1, pos.z]}
            rotation={[0, -pos.angle, 0]}
          >
            <boxGeometry args={[0.18, 1, 0.18]} />
            <meshStandardMaterial
              color={palette.bass}
              emissive={palette.bass}
              roughness={0.35}
              metalness={0.2}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}

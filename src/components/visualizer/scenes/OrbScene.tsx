"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import type { AudioApi } from "@/hooks/useAudioAnalyser";
import type { SystemTheme } from "@/hooks/useSystemTheme";
import { getDotTexture } from "./dotTexture";

const DETAIL = 34; // icosahedron subdivision — ~10*DETAIL^2+2 points, dense enough to read as a solid cloud
const BASE_RADIUS = 1.6;
// How many frequency slices get wrapped around the sphere's equator — enough
// bands to read as "different regions responding to different frequencies"
// without looking like per-point noise. Bins blend into their neighbor (see
// binPositions below) so there's no hard seam between adjacent slices. Now
// that useAudioAnalyser's getSpectrum buckets are log-spaced (each bin
// actually corresponds to a distinct, musically meaningful range instead of
// several bins all sitting inside the same near-silent top octave), more
// bins stay meaningfully different from each other instead of just
// duplicating their neighbor.
const SPECTRUM_BINS = 12;
// Both the drag handler and the momentum coast clamp tilt to this, stopping
// just short of viewing the orb from directly overhead/underneath.
const TILT_LIMIT = Math.PI / 2 - 0.15;

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export default function OrbScene({
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
  const noise3D = useMemo(() => createNoise3D(), []);
  const gl = useThree((s) => s.gl);

  // Drag-to-spin: press and drag anywhere on the canvas to rotate the orb by
  // hand. `velocity` is the angular speed (rad/sec) the drag was moving at
  // the moment it's released — carried over as momentum so the orb keeps
  // coasting and decays back down to the idle auto-rotation, rather than
  // cutting straight from "under your cursor" to "auto-rotate" with no
  // handoff.
  const isDragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0, time: 0 });
  const velocity = useRef({ rotX: 0, rotY: 0 });
  const momentum = useRef({ rotX: 0, rotY: 0 });

  // Memoized rather than `new THREE.Color(hex)`-ing inside the useFrame loop
  // below, which would allocate two objects every single frame instead of
  // only when the palette actually changes. `particleColors` rather than a
  // `Palette`'s `bass`/`treble` — see the comment on getParticleColors in
  // palettes.ts for why a point cloud can't just reuse the colors tuned for
  // Bloom against a solid fill.
  const bassRgb = useMemo(() => hexToRgb(particleColors.bass), [particleColors.bass]);
  const trebleRgb = useMemo(() => hexToRgb(particleColors.treble), [particleColors.treble]);
  const dotMap = useMemo(() => getDotTexture(), []);

  useEffect(() => {
    const el = gl.domElement;
    const ROTATE_SPEED = 0.008; // radians of orbit rotation per pixel of drag

    function handlePointerDown(e: PointerEvent) {
      isDragging.current = true;
      momentum.current = { rotX: 0, rotY: 0 };
      // Also reset velocity, not just momentum — a plain click (down+up with
      // no move in between) never touches `velocity.current` in
      // handlePointerMove, so without this it still held whatever speed the
      // *previous* drag ended at, and handlePointerUp below would hand that
      // stale value straight to momentum, spinning the orb from a click that
      // never dragged at all.
      velocity.current = { rotX: 0, rotY: 0 };
      lastPointer.current = { x: e.clientX, y: e.clientY, time: performance.now() };
      el.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: PointerEvent) {
      const group = groupRef.current;
      if (!isDragging.current || !group) return;

      const now = performance.now();
      const dt = Math.max((now - lastPointer.current.time) / 1000, 1 / 120);
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      const rotY = dx * ROTATE_SPEED;
      const rotX = dy * ROTATE_SPEED;

      group.rotation.y += rotY;
      group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + rotX, -TILT_LIMIT, TILT_LIMIT);

      velocity.current = { rotX: rotX / dt, rotY: rotY / dt };
      lastPointer.current = { x: e.clientX, y: e.clientY, time: now };
    }

    function handlePointerUp(e: PointerEvent) {
      if (!isDragging.current) return;
      isDragging.current = false;
      momentum.current = { ...velocity.current };
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    }

    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    el.addEventListener("pointercancel", handlePointerUp);
    // touch-action: none stops the browser from also trying to scroll/
    // pinch-zoom the page from the same drag — background scroll is already
    // locked while the visualizer is open, but this keeps the drag itself
    // from fighting any native touch gesture handling.
    const prevTouchAction = el.style.touchAction;
    const prevCursor = el.style.cursor;
    Object.assign(el.style, { touchAction: "none", cursor: "grab" });

    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      el.removeEventListener("pointercancel", handlePointerUp);
      Object.assign(el.style, { touchAction: prevTouchAction, cursor: prevCursor });
    };
  }, [gl]);

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

  // One real geometry shared by both the solid point layer and (in light
  // theme) the additive glow layer beneath it, so a single needsUpdate per
  // frame below keeps both in sync — there's only one underlying GPU
  // buffer, just two materials/draw calls reading it.
  const sharedGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  useFrame((state, delta) => {
    const { bass, overall } = audio.getBands();
    const spectrum = audio.getSpectrum(SPECTRUM_BINS);
    const points = pointsRef.current;
    if (!points) return;

    // Read through the ref (rather than the `sharedGeometry` variable
    // directly) — same underlying THREE.BufferGeometry either way (it's
    // passed as the `geometry` prop on the ref'd <points> below), but going
    // through `points.geometry` here is what keeps the React Compiler's
    // lint rule against mutating a hook's return value from firing on the
    // in-place array writes below.
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
      // Exponent bumped from 1.8 → 2.2 (and the multiplier below, 1.9 → 2.3)
      // specifically so a single hot bin — a vocal ad-lib holding a note
      // while everything else sits quiet, say — reads as one region
      // spiking hard rather than a gentle bump, now that log-spaced bins
      // actually let one bin be hot while its neighbors stay quiet.
      const regional = Math.pow(freq / 1.4, 2.2);

      const n = noise3D(nx * 1.1 + t * 0.15, ny * 1.1 + t * 0.15, nz * 1.1 + t * 0.15);
      // FLOOR keeps a "barely moves" region from going perfectly static
      // (reads as dead/frozen otherwise); the small shared bass term is what
      // keeps every region on roughly the same underlying wave/beat even
      // while `regional` is what actually drives the huge point-to-point
      // spread in amplitude.
      const FLOOR = 0.05;
      const strength = FLOOR + bass * 0.15 + regional * 2.3;
      const disp = n * strength;

      posArr[ix] = basePositions[ix] + nx * disp;
      posArr[iy] = basePositions[iy] + ny * disp;
      posArr[iz] = basePositions[iz] + nz * disp;

      // Color follows the same regional signal, with the same exaggerated
      // curve — a region that's barely moving stays close to the bass color,
      // one that's going wild swings hard toward the treble color, so shape
      // and color read as the same cause rather than two separate effects.
      const factor = THREE.MathUtils.clamp(regional * 0.95 + (n + 1) * 0.08, 0, 1);
      colorArr[ix] = bassR + (trebleR - bassR) * factor;
      colorArr[iy] = bassG + (trebleG - bassG) * factor;
      colorArr[iz] = bassB + (trebleB - bassB) * factor;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    const group = groupRef.current;
    if (!group) return;

    if (isDragging.current) {
      // Rotation is already applied directly inside the pointermove handler,
      // for zero-lag 1:1 tracking under the cursor/finger.
    } else if (Math.abs(momentum.current.rotX) > 0.001 || Math.abs(momentum.current.rotY) > 0.001) {
      group.rotation.y += momentum.current.rotY * delta;
      group.rotation.x = THREE.MathUtils.clamp(
        group.rotation.x + momentum.current.rotX * delta,
        -TILT_LIMIT,
        TILT_LIMIT
      );
      // ~8% of the coasting speed left after each second, so a hard flick
      // spins for a beat and eases out instead of stopping dead or coasting
      // forever.
      const decay = Math.pow(0.08, delta);
      momentum.current.rotX *= decay;
      momentum.current.rotY *= decay;
    } else {
      group.rotation.y += delta * (0.08 + overall * 0.25);
      group.rotation.x += delta * 0.02;
    }
  });

  const isLight = theme === "light";

  return (
    <group ref={groupRef}>
      {
        // Dark theme gets its glow for free: AdditiveBlending on a
        // near-black background makes even a faint point read as glowing,
        // and the postprocessing Bloom pass (VisualizerStage) picks up the
        // rest. Light theme can't use additive (it'd just clip every point
        // straight to white against the light bg — see palettes.ts), so it
        // renders with NormalBlending instead — but that's flat alpha
        // compositing, not glow, and Bloom's luminance threshold has almost
        // nothing to grab onto on a field of 1-2px points (unlike
        // TerrainScene's large solid bars, there's no meaningful pixel area
        // to bloom). So light theme gets its own manual glow: a second,
        // larger, low-opacity, *additively* blended copy of the same point
        // cloud underneath the crisp solid layer — a real soft halo around
        // each point instead of relying on postprocessing that can't see
        // sparse points, and since it reads the same live color buffer, the
        // glow already brightens toward `treble` exactly where the solid
        // layer does.
        isLight && (
          <points geometry={sharedGeometry}>
            <pointsMaterial
              map={dotMap}
              size={0.05}
              sizeAttenuation
              vertexColors
              transparent
              opacity={0.16}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </points>
        )
      }
      <points ref={pointsRef} geometry={sharedGeometry}>
        <pointsMaterial
          map={dotMap}
          size={isLight ? 0.032 : 0.022}
          sizeAttenuation
          vertexColors
          transparent
          opacity={isLight ? 1 : 0.9}
          blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending}
          // Additive blending is order-independent, so depthWrite has always
          // been off for it; normal blending (the light-theme variant) needs
          // it back on, or the far side of the sphere draws in an arbitrary
          // order and shows through the near side.
          depthWrite={isLight}
        />
      </points>
    </group>
  );
}

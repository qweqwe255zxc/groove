"use client";

import { useCallback, useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { PALETTES } from "./palettes";
import OrbScene from "./scenes/OrbScene";
import TerrainScene from "./scenes/TerrainScene";
import SettingsPanel from "./SettingsPanel";
import TrackMeta from "./TrackMeta";

const BASE_CAMERA_POSITION: [number, number, number] = [0, 1.4, 6];
// Both scenes' content reaches out to roughly this far from the origin (the
// orb's noise displacement peaks around 2.6, the terrain's bars-on-a-ring
// peak around 3.6 including height) — used as the radius that must stay
// inside frame from every angle.
const FIT_RADIUS = 3.6;
// Tuned for the base camera distance above — the terrain/orb content sits
// just past `near`, fully faded to the background by `far`.
const BASE_FOG_NEAR = 6;
const BASE_FOG_FAR = 13;

// A fixed vertical `fov` plus a fixed camera distance only fits the scene at
// the aspect ratio it was tuned for (desktop, ~16:9). Three.js/R3F derive the
// *horizontal* FOV from `vFov` and the canvas aspect ratio, so a portrait
// phone screen (aspect < 1) gets a much narrower horizontal FOV at the same
// distance — the same content that fits comfortably on desktop spills past
// the left/right edges on a phone. Pushing the camera further back (along
// its existing direction, preserving the tilt) whenever the frustum would
// otherwise be too tight keeps the scene inside frame at any aspect ratio.
function ResponsiveCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);

  useEffect(() => {
    const aspect = size.width / size.height;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distanceForVertical = FIT_RADIUS / Math.tan(vFov / 2);
    const distanceForHorizontal = FIT_RADIUS / Math.tan(hFov / 2);
    const baseDistance = new THREE.Vector3(...BASE_CAMERA_POSITION).length();
    const distance = Math.max(baseDistance, distanceForVertical, distanceForHorizontal);

    camera.position
      .set(...BASE_CAMERA_POSITION)
      .normalize()
      .multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    // The scene's fog near/far are tuned for `baseDistance` — pushing the
    // camera back further on narrow aspects without rescaling fog too means
    // the entire scene sits past `far` and fades completely into the
    // background before it's even drawn (found by testing: the terrain scene
    // went fully invisible on a phone viewport once this fix pushed the
    // camera past fog's fixed far=13).
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      const fogScale = distance / baseDistance;
      Object.assign(fog, { near: BASE_FOG_NEAR * fogScale, far: BASE_FOG_FAR * fogScale });
    }
  }, [size, camera, scene]);

  return null;
}

export default function VisualizerStage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const activeTrack = useAppStore((s) => s.activeTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const isVisualizerOpen = useAppStore((s) => s.isVisualizerOpen);
  const visualizerMode = useAppStore((s) => s.visualizerMode);
  const sensitivity = useAppStore((s) => s.sensitivity);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const setVisualizerMode = useAppStore((s) => s.setVisualizerMode);
  const togglePlaying = useAppStore((s) => s.togglePlaying);
  const closeVisualizer = useAppStore((s) => s.closeVisualizer);

  const audio = useAudioAnalyser(audioRef, sensitivity);
  const palette = PALETTES[colorScheme];

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !activeTrack?.previewUrl) return;
    el.src = activeTrack.previewUrl;
    el.load();
  }, [activeTrack?.previewUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      audio.resume();
      el.play().catch(() => togglePlaying(false));
    } else {
      el.pause();
    }
  }, [isPlaying, audio, togglePlaying]);

  // Entrance fade — this used to just pop in instantly on the same frame
  // as the click, the only overlay in the app with no opening transition.
  useEffect(() => {
    if (!isVisualizerOpen) return;
    const el = stageRef.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { autoAlpha: 0, scale: 1.04 },
      { autoAlpha: 1, scale: 1, duration: 0.5, ease: "power3.out" }
    );
  }, [isVisualizerOpen]);

  // Closing used to flip `isVisualizerOpen` straight to false, which yanks
  // the whole conditionally-rendered overlay out on the same frame as the
  // click — every other overlay in the app (menu, vinyl panel) animates its
  // close. Mirrors VinylPanel's handleClose: animate first, only flip the
  // store flag (which actually unmounts this) once the fade finishes.
  const handleClose = useCallback(() => {
    const el = stageRef.current;
    if (!el) {
      closeVisualizer();
      return;
    }
    gsap.to(el, {
      autoAlpha: 0,
      scale: 1.04,
      duration: 0.35,
      ease: "power2.in",
      onComplete: closeVisualizer,
    });
  }, [closeVisualizer]);

  // Space toggles playback, Escape closes the overlay. Both call
  // preventDefault(): without it, Space would ALSO re-click whichever button
  // currently has focus — almost always the Play/Pause button itself, right
  // after being clicked — double-toggling playback instead of once.
  useEffect(() => {
    if (!isVisualizerOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlaying();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisualizerOpen, togglePlaying, handleClose]);

  return (
    <>
      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
        onEnded={() => togglePlaying(false)}
        hidden
      />

      {isVisualizerOpen && (
        <div
          ref={stageRef}
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: palette.background }}
        >
          <Canvas camera={{ position: BASE_CAMERA_POSITION, fov: 45 }}>
            <ResponsiveCamera />
            <color attach="background" args={[palette.background]} />
            <fog attach="fog" args={[palette.background, BASE_FOG_NEAR, BASE_FOG_FAR]} />
            {visualizerMode === "orb" ? (
              <OrbScene audio={audio} palette={palette} />
            ) : (
              <TerrainScene audio={audio} palette={palette} />
            )}
            <EffectComposer>
              <Bloom
                luminanceThreshold={0.2}
                luminanceSmoothing={0.9}
                intensity={1.1}
                mipmapBlur
              />
              <Vignette eskil={false} offset={0.15} darkness={0.9} />
            </EffectComposer>
          </Canvas>

          <TrackMeta />

          <div className="absolute right-6 top-6 flex items-center gap-3 sm:right-10 sm:top-10">
            <button
              type="button"
              onClick={() =>
                setVisualizerMode(visualizerMode === "orb" ? "terrain" : "orb")
              }
              className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
            >
              {visualizerMode === "orb" ? "Orb" : "Terrain"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close visualizer"
              className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="absolute bottom-6 left-6 sm:left-10 sm:bottom-10">
            <button
              type="button"
              onClick={() => togglePlaying()}
              className="rounded-full border border-line px-5 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
          </div>

          <SettingsPanel />
        </div>
      )}
    </>
  );
}

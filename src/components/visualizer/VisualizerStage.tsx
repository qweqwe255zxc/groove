"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { useSystemTheme } from "@/hooks/useSystemTheme";
import { getOrbColors, getPalette } from "./palettes";
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

  const selectedAlbum = useAppStore((s) => s.selectedAlbum);
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
  const systemTheme = useSystemTheme();
  const palette = getPalette(colorScheme, systemTheme);
  const orbColors = getOrbColors(colorScheme, systemTheme);
  // Bloom blooms whatever crosses its luminance threshold+smoothing band.
  // The dark theme gets headroom for free (near-black bg, so almost
  // anything reads as bright) — a wide smoothing band works fine there
  // since nothing but the background sits near the bottom of it. The light
  // theme has no such headroom: its background/bass/treble colors
  // (palettes.ts) all sit within a ~0.76-0.99 luminance band, so the
  // threshold+smoothing window has to be narrow and placed precisely in the
  // gap between the brightest background (~0.91, measured from palettes.ts)
  // and the dimmest treble (~0.95) — wide smoothing there would catch the
  // background too, blooming the whole frame instead of just treble.
  const bloomTuning =
    systemTheme === "dark"
      ? { luminanceThreshold: 0.2, luminanceSmoothing: 0.9, intensity: 1.1 }
      : { luminanceThreshold: 0.915, luminanceSmoothing: 0.035, intensity: 0.8 };

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !activeTrack?.previewUrl) return;
    el.src = activeTrack.previewUrl;
    el.load();
  }, [activeTrack?.previewUrl]);

  // Keeps the address bar itself pointing at /v/[collectionId]/[trackId]
  // whenever a track is active, so the link is right there to copy without
  // needing the Share button — not just something Share generates on
  // click. `history.replaceState` rather than the Next.js router: routing
  // there for real would re-run the /v page's server fetch and remount
  // DeepLinkVisualizer, which calls `openTrack` (isPlaying forced back to
  // false) — pausing whatever's actually playing just because the URL
  // changed. This only touches what's shown in the address bar.
  useEffect(() => {
    if (selectedAlbum && activeTrack) {
      const url = `/v/${selectedAlbum.collectionId}/${activeTrack.trackId}`;
      if (window.location.pathname !== url) {
        window.history.replaceState(null, "", url);
      }
    } else if (!selectedAlbum && window.location.pathname !== "/") {
      window.history.replaceState(null, "", "/");
    }
  }, [selectedAlbum, activeTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      audio.resume();
      el.play().catch(() => togglePlaying(false));
    } else {
      el.pause();
    }
    // `activeTrack?.previewUrl` is also a dependency, not just `isPlaying` —
    // without it, switching to a new track while already playing (isPlaying
    // staying `true` across the switch) wouldn't re-run this effect at all,
    // since React only reruns on a dependency's value actually changing. The
    // new src would load (the other effect above) but never actually play.
  }, [isPlaying, activeTrack?.previewUrl, audio, togglePlaying]);

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

  const [shareCopied, setShareCopied] = useState(false);
  const handleShare = useCallback(() => {
    if (!selectedAlbum || !activeTrack) return;
    const url = `${window.location.origin}/v/${selectedAlbum.collectionId}/${activeTrack.trackId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 1500);
      })
      .catch(() => {});
  }, [selectedAlbum, activeTrack]);

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
              <OrbScene audio={audio} palette={palette} orbColors={orbColors} theme={systemTheme} />
            ) : (
              <TerrainScene audio={audio} palette={palette} theme={systemTheme} />
            )}
            <EffectComposer>
              {[
                // Bloom's light-theme threshold (0.915, tightly banded — see
                // the comment on bloomTuning above) is tuned against
                // TerrainScene's large solid bars. OrbScene in light theme
                // renders its own manual additive glow instead (OrbScene.tsx)
                // using colors that sit *below* that threshold by design
                // (getOrbColors picks dark/saturated tones, not bright ones)
                // — so this pass has nothing in that scene to ever catch.
                // Skipping it there avoids paying for a full-screen
                // postprocessing pass that provably never contributes a
                // pixel, rather than leaving it running as dead weight.
                !(visualizerMode === "orb" && systemTheme === "light") && (
                  <Bloom
                    key="bloom"
                    luminanceThreshold={bloomTuning.luminanceThreshold}
                    luminanceSmoothing={bloomTuning.luminanceSmoothing}
                    intensity={bloomTuning.intensity}
                    mipmapBlur
                  />
                ),
                <Vignette
                  key="vignette"
                  eskil={false}
                  offset={0.15}
                  darkness={systemTheme === "dark" ? 0.9 : 0.35}
                />,
              ].filter((el): el is React.JSX.Element => el !== false)}
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
              onClick={handleShare}
              disabled={!selectedAlbum || !activeTrack}
              className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            >
              {shareCopied ? "Copied" : "Share"}
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

          <SettingsPanel systemTheme={systemTheme} visualizerMode={visualizerMode} />
        </div>
      )}
    </>
  );
}

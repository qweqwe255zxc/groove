"use client";

import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { PALETTES } from "./palettes";
import OrbScene from "./scenes/OrbScene";
import TerrainScene from "./scenes/TerrainScene";
import SettingsPanel from "./SettingsPanel";
import TrackMeta from "./TrackMeta";

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
  function handleClose() {
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
  }

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
          <Canvas camera={{ position: [0, 1.4, 6], fov: 45 }}>
            <color attach="background" args={[palette.background]} />
            <fog attach="fog" args={[palette.background, 6, 13]} />
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";
import { getParticleColors, getPalette } from "./palettes";
import OrbScene from "./scenes/OrbScene";
import TerrainScene from "./scenes/TerrainScene";
import SettingsPanel from "./SettingsPanel";
import TrackMeta from "./TrackMeta";
import ThemeToggle from "@/components/layout/ThemeToggle";

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

// Only ever used in dark theme — see the comment on `theme`/Bloom below for
// why light theme skips the Bloom pass entirely instead of needing its own
// tuning here. Threshold lowered and intensity/smoothing raised from the
// original (0.2/0.9/1.1) — both scenes' points were reading as barely
// glowing beyond their own edges even with additive blending, so this pass
// needed to grab more of them and spread what it grabs further.
const DARK_BLOOM_TUNING = { luminanceThreshold: 0.1, luminanceSmoothing: 0.95, intensity: 1.9 };

// A track genuinely starting (fresh load from VinylPanel's Play button) or
// genuinely ending (onEnded, closeVisualizer) gets this — long enough to
// read as a deliberate artistic fade, not just anti-click smoothing.
const FADE_DURATION = 1.5;
// An explicit Pause/Resume mid-track (button or Spacebar — see fastFadeRef
// below) gets this instead — quicker than the artistic fade so the two feel
// distinct, but still slow enough to read as a deliberate fade rather than a
// hard cut.
const MICRO_FADE_DURATION = 0.5;

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
  const volume = useAppStore((s) => s.volume);
  const setVolume = useAppStore((s) => s.setVolume);
  const setVisualizerMode = useAppStore((s) => s.setVisualizerMode);
  const togglePlaying = useAppStore((s) => s.togglePlaying);
  const closeVisualizer = useAppStore((s) => s.closeVisualizer);

  const audio = useAudioAnalyser(audioRef, sensitivity);
  // "Resolved" rather than "system" — reflects ThemeToggle's manual override
  // when one is active, falling back to the OS preference otherwise (see
  // useResolvedTheme).
  const theme = useResolvedTheme();
  const palette = getPalette(colorScheme, theme);
  const particleColors = getParticleColors(colorScheme, theme);
  // Bloom blooms whatever crosses its luminance threshold+smoothing band.
  // Both scenes render as point clouds (OrbScene.tsx, TerrainScene.tsx) —
  // dark theme gets its glow for free from Bloom picking up the near-black
  // background's additive-blended bright points, but in light theme neither
  // scene has enough pixel coverage in any single point for Bloom's
  // luminance threshold to grab onto (a sparse field of 1-2px points reads
  // as "washed out," not "bloomed" — see the comment on getParticleColors in
  // palettes.ts). Both scenes lean on their own manual additive glow layer
  // in light theme instead, so Bloom is skipped there entirely rather than
  // paying for a full-screen postprocessing pass that provably never
  // contributes a pixel.

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !activeTrack?.previewUrl) return;
    el.src = activeTrack.previewUrl;
    el.load();
    setCurrentTime(0);
    setDuration(0);
  }, [activeTrack?.previewUrl]);

  // Drives the seek bar. A second, independent 'timeupdate' listener from
  // the pre-emptive end-fade effect further below also exists — kept
  // separate rather than merged into one handler since they serve unrelated
  // concerns (UI progress display vs. fade timing) and neither needs to know
  // about the other.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    function handleTimeUpdate() {
      if (el) setCurrentTime(el.currentTime);
    }
    function handleLoadedMetadata() {
      if (el) setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    }
    el.addEventListener("timeupdate", handleTimeUpdate);
    el.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => {
      el.removeEventListener("timeupdate", handleTimeUpdate);
      el.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

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

  // Set right before an explicit Play/Pause click or Spacebar toggles
  // playback in *either* direction (see handleTogglePlaying below) —
  // consumed once by the effect below, so the micro-fade only ever applies
  // to that one transition. Left false for VinylPanel's own Play button,
  // onEnded, and closeVisualizer, which also flip isPlaying but represent a
  // track genuinely starting or ending rather than a mid-track pause/resume
  // — those keep the slower, deliberately-audible artistic fade.
  const fastFadeRef = useRef(false);
  // By the time the browser's own 'ended' event fires, playback has already
  // stopped — the element isn't emitting any samples anymore, so a fade-out
  // tween started there is fading against silence and never actually reads
  // as a fade. This flag tracks whether the pre-emptive end-of-track fade
  // below has already been kicked off for the *current* playthrough, so it
  // only fires once per track and gets a clean slate on every fresh start.
  const endFadeStartedRef = useRef(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    // Kill any fade already in flight — rapid play/pause toggling (or a
    // track switch mid-fade) would otherwise leave two tweens fighting over
    // `el.volume`.
    gsap.killTweensOf(el);
    const duration = fastFadeRef.current ? MICRO_FADE_DURATION : FADE_DURATION;
    fastFadeRef.current = false;
    // el.play() is async (it can be waiting on buffering) — if isPlaying
    // flips back to false before it resolves, this effect has already
    // re-run for the pause and started the fade-to-0 tween by the time the
    // stale `.then()` fires. Without this guard that stale callback would
    // start a *second*, competing fade-to-1 tween on top of it (killTweensOf
    // above can't help — it runs before this promise settles, not after).
    let cancelled = false;
    if (isPlaying) {
      endFadeStartedRef.current = false;
      audio.resume();
      el.volume = 0;
      el.play()
        .then(() => {
          if (cancelled) return;
          // Read fresh rather than closing over the `volume` from render —
          // this effect doesn't depend on it (see handleVolumeChange below
          // for why it can't), so a stale closure would fade in at whatever
          // volume was set the moment this effect last ran instead of
          // whatever the slider is at right now.
          const target = useAppStore.getState().volume;
          gsap.to(el, { volume: target, duration, ease: "sine.inOut" });
        })
        .catch(() => {
          if (!cancelled) togglePlaying(false);
        });
    } else {
      gsap.to(el, {
        volume: 0,
        duration,
        ease: "sine.inOut",
        onComplete: () => el.pause(),
      });
    }
    // `activeTrack?.previewUrl` is also a dependency, not just `isPlaying` —
    // without it, switching to a new track while already playing (isPlaying
    // staying `true` across the switch) wouldn't re-run this effect at all,
    // since React only reruns on a dependency's value actually changing. The
    // new src would load (the other effect above) but never actually play.
    return () => {
      cancelled = true;
    };
  }, [isPlaying, activeTrack?.previewUrl, audio, togglePlaying]);

  // Starts the artistic end fade FADE_DURATION seconds early, timed against
  // actual playback position (not a setTimeout) so it lands at 0 right as
  // the track really ends, however long the preview turns out to be.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    function handleTimeUpdate() {
      if (endFadeStartedRef.current || !el || !Number.isFinite(el.duration)) return;
      const remaining = el.duration - el.currentTime;
      if (remaining <= FADE_DURATION) {
        endFadeStartedRef.current = true;
        gsap.killTweensOf(el);
        gsap.to(el, { volume: 0, duration: Math.max(remaining, 0), ease: "sine.inOut" });
      }
    }
    el.addEventListener("timeupdate", handleTimeUpdate);
    return () => el.removeEventListener("timeupdate", handleTimeUpdate);
  }, []);

  // Wraps togglePlaying() for the explicit play/pause entry points (button,
  // Spacebar) so the fade above can tell "user toggled mid-track playback"
  // (either direction) apart from VinylPanel's Play button starting a track
  // fresh, or onEnded/closeVisualizer ending one.
  const handleTogglePlaying = useCallback(() => {
    fastFadeRef.current = true;
    togglePlaying();
  }, [togglePlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    const el = audioRef.current;
    if (el) el.currentTime = value;
    setCurrentTime(value);
  }, []);

  // Sets el.volume directly rather than through the store's `volume` value
  // as a dependency — wiring the fade-in effect above to `volume` would
  // re-run the whole play/pause effect (and restart the fade from 0) on
  // every drag tick. Skipped entirely once the pre-emptive end fade has
  // started (endFadeStartedRef) so dragging near a track's end doesn't kill
  // that tween and leave it ending at an un-faded volume.
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      setVolume(value);
      const el = audioRef.current;
      if (el && isPlaying && !endFadeStartedRef.current) {
        gsap.killTweensOf(el);
        el.volume = value;
      }
    },
    [isPlaying, setVolume]
  );

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
        handleTogglePlaying();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisualizerOpen, handleTogglePlaying, handleClose]);

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
              <OrbScene audio={audio} particleColors={particleColors} theme={theme} />
            ) : (
              <TerrainScene audio={audio} particleColors={particleColors} theme={theme} />
            )}
            <EffectComposer>
              {[
                theme === "dark" && (
                  <Bloom
                    key="bloom"
                    luminanceThreshold={DARK_BLOOM_TUNING.luminanceThreshold}
                    luminanceSmoothing={DARK_BLOOM_TUNING.luminanceSmoothing}
                    intensity={DARK_BLOOM_TUNING.intensity}
                    mipmapBlur
                  />
                ),
                <Vignette
                  key="vignette"
                  eskil={false}
                  offset={0.15}
                  darkness={theme === "dark" ? 0.9 : 0.35}
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
            {/* SiteHeader (the other place ThemeToggle lives, via
                OverlayMenu) hides itself whenever this overlay is open — see
                the comment on that early-return in SiteHeader.tsx — so
                there'd be no way to flip the theme without first closing the
                visualizer if it weren't also reachable from here. */}
            <ThemeToggle />
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
              onClick={handleTogglePlaying}
              className="rounded-full border border-line px-5 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
          </div>

          <div className="absolute bottom-6 right-6 flex items-end gap-3 sm:bottom-10 sm:right-10">
            <div className="flex h-9 items-center rounded-full border border-line px-4">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                disabled={!duration}
                aria-label="Seek"
                className="w-28 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40 sm:w-36"
              />
            </div>

            <SettingsPanel theme={theme} />

            {/* Volume: a plain horizontal range input rotated -90deg (the
                standard cross-browser trick for a vertical slider — Firefox's
                `orient="vertical"` and WebKit's `-webkit-appearance:
                slider-vertical` each only cover one engine, this covers all
                of them with one rule) inside a fixed-size relative wrapper so
                the post-rotation footprint (36 wide, 96 tall) reserves real
                layout space instead of the input's own pre-rotation box. */}
            <div className="relative h-24 w-9 shrink-0 rounded-full border border-line">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeChange}
                aria-label="Volume"
                className="cursor-pointer accent-accent"
                style={{
                  width: 96,
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%) rotate(-90deg)",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

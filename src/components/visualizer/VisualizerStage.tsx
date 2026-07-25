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
import VolumeSlider from "./VolumeSlider";
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

// Time constant (seconds) for easing the *displayed* playback position
// toward the real one — see the smoothing block in the rAF loop below.
// ~90ms is short enough that the thumb never reads as lagging the audio,
// long enough to swallow a whole frame's worth of correction.
const SEEK_SMOOTHING_TAU = 0.09;
// A gap this large isn't clock drift, it's a seek / track change / a tab
// coming back from the background — those should land immediately rather
// than have the thumb glide across the bar.
const SEEK_SNAP_THRESHOLD = 0.75;
// HTMLMediaElement.HAVE_FUTURE_DATA — below this the element has nothing
// queued to play, so its `currentTime` isn't advancing no matter what the
// paused flag says. Spelled out as a constant because the named property
// only exists on an element instance, and this is read in a hot loop.
const HAVE_FUTURE_DATA = 3;
// Ceiling (seconds) on how far the displayed position may run ahead of the
// last `currentTime` the element actually confirmed.
const MAX_EXTRAPOLATION = 0.5;

// mm:ss for the time readout next to Play — previews never run long enough
// to need an hours place.
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
  const seekRef = useRef<HTMLInputElement>(null);
  const timeDisplayRef = useRef<HTMLDivElement>(null);

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
  const setLocalTrackError = useAppStore((s) => s.setLocalTrackError);

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

  const [duration, setDuration] = useState(0);

  // Paints the seek bar's fill/thumb position and the time readout text
  // directly on the DOM rather than through React state — the same
  // ref-based reasoning as getBands()/getSpectrum() (see gotcha 3):
  // `timeupdate` only fires a few times a second (often throttled closer to
  // once/sec), which is what made the old setState-driven bar visibly jump
  // instead of crawl. Rerunning that every animation frame instead would
  // re-render this whole component 60 times a second — including recreating
  // the inline `camera={{...}}` object literal passed to <Canvas>, which R3F
  // would then have no way to distinguish from a real camera-settings change.
  // Writing straight to the elements sidesteps that entirely.
  const updateSeekDisplay = useCallback((time: number, dur: number) => {
    const input = seekRef.current;
    if (input) {
      input.value = String(time);
      // Unitless 0–1, not a percentage — globals.css insets it by half a
      // thumb width so the fill's edge tracks the thumb's centre.
      const progress = dur > 0 ? Math.min(Math.max(time / dur, 0), 1) : 0;
      input.style.setProperty("--range-progress", String(progress));
      // Set here rather than as a JSX prop: a screen reader reading the raw
      // `value` off a step="any" slider announces "12.483064" — and the
      // value it'd have to read from is a ref, which this lint setup won't
      // allow during render anyway (gotcha 9).
      input.setAttribute("aria-valuetext", formatTime(time));
    }
    const label = timeDisplayRef.current;
    if (label) label.textContent = `${formatTime(time)} / ${formatTime(dur)}`;
  }, []);

  // `el.currentTime` itself only actually advances in coarse steps
  // internally — browsers don't re-timestamp it every frame, they update it
  // on whatever cadence their own decode/output pipeline happens to tick at.
  // Polling it directly every rAF frame (the previous version of this
  // effect) reads the same stale value several frames in a row and then
  // jumps, which looks exactly as chunky as the old timeupdate-driven
  // version it replaced. These two refs extrapolate the displayed position
  // from wall-clock time between those real updates instead — every frame
  // moves the thumb a hair further along, and the moment the browser
  // actually advances `el.currentTime`, that becomes the new baseline so
  // any drift corrects itself rather than accumulating.
  const baseTimeRef = useRef(0);
  const basePerfRef = useRef(0);
  // The position actually painted on the bar, which trails the extrapolated
  // one through a critically-damped ease (see the tick below) instead of
  // being it. The extrapolation is only *approximately* right between the
  // browser's real `currentTime` updates, so every real update lands a
  // correction — writing those straight to the DOM turns each one into a
  // visible micro-snap several times a second, which is most of what reads
  // as the bar being "jumpy" even when it's advancing on every frame.
  const displayTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  // True while the user is dragging the thumb. The loop below has to stand
  // down for the duration: a seek isn't instant, so `el.currentTime` keeps
  // reporting the pre-seek position for a few frames and writing that back
  // into `input.value` would drag the thumb out from under the pointer.
  const isScrubbingRef = useRef(false);

  // Re-syncs all three clocks to a known position — used anywhere the
  // position changes for a reason the extrapolation can't see coming (a new
  // src, a resume, the end of a drag), so the next tick eases from there
  // instead of from a stale baseline.
  const anchorPlayback = useCallback((time: number) => {
    baseTimeRef.current = time;
    basePerfRef.current = performance.now();
    lastFrameRef.current = basePerfRef.current;
    displayTimeRef.current = time;
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !activeTrack?.previewUrl) return;
    el.src = activeTrack.previewUrl;
    el.load();
    setDuration(0);
    anchorPlayback(0);
    updateSeekDisplay(0, 0);
  }, [activeTrack?.previewUrl, updateSeekDisplay, anchorPlayback]);

  // Keyed to the store's `isPlaying`, not the audio element's own
  // play/pause events — a Pause click should read as an *instant* stop on
  // the bar. (An earlier version of this loop tracked the element's real
  // 'pause' event instead, which only fires once the volume fade-out
  // finishes — the bar kept crawling for that extra MICRO_FADE_DURATION
  // after the click before it actually froze, which read as pause not
  // taking effect right away.) The tradeoff that creates — the element
  // keeps decoding audio for that same fade-out window, so its real
  // `currentTime` runs ahead of wherever the bar froze — is paid back on
  // resume, where the play/pause effect below rewinds `el.currentTime` to
  // match this frozen `displayTimeRef` before playing again.
  useEffect(() => {
    if (!isPlaying) return;
    const el = audioRef.current;
    if (!el) return;
    // Anchored to `displayTimeRef`'s own frozen value, deliberately *not* a
    // fresh read of `el.currentTime`: this effect runs before the
    // play/pause effect below on every commit (React runs a component's
    // effects in declaration order), which is where the element actually
    // gets rewound to match the frozen bar. Reading `el.currentTime` here
    // would capture it pre-rewind and stamp that stale position over the
    // frozen one a moment before the rewind even happens. Re-anchoring is
    // still needed, just not for the position — `basePerfRef` still has to
    // reset to now, or the first tick would extrapolate elapsed time from a
    // timestamp a whole pause ago and skip the thumb forward.
    anchorPlayback(displayTimeRef.current);
    let frame: number;
    // `now` comes from rAF rather than a fresh performance.now() — same
    // clock, but it's the timestamp the whole frame is being composited for,
    // so every element the frame paints agrees on when "now" is.
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      if (!el || isScrubbingRef.current) {
        lastFrameRef.current = now;
        return;
      }
      if (el.currentTime !== baseTimeRef.current) {
        baseTimeRef.current = el.currentTime;
        basePerfRef.current = now;
      }
      const dur = el.duration || 0;
      // Extrapolation is only valid while the element is actually decoding
      // and emitting audio — mid-buffer (readyState drops), `currentTime`
      // stands still and extrapolating anyway would walk the thumb away
      // from the sound. The cap covers the same thing from the other side:
      // however long the element goes without a real update, the thumb
      // never runs more than this far ahead of the last position it
      // confirmed.
      const playing = !el.paused && el.readyState >= HAVE_FUTURE_DATA;
      const elapsed = playing
        ? Math.min((now - basePerfRef.current) / 1000, MAX_EXTRAPOLATION) * el.playbackRate
        : 0;
      const target = Math.min(baseTimeRef.current + elapsed, dur || Infinity);

      const delta = target - displayTimeRef.current;
      if (Math.abs(delta) > SEEK_SNAP_THRESHOLD) {
        displayTimeRef.current = target;
      } else {
        // Exponential ease written against real elapsed time rather than a
        // fixed per-frame factor, so it converges at the same rate on a
        // 60Hz and a 120Hz display. dt is capped so a long frame (tab
        // backgrounded, a GC pause) can't overshoot.
        const dt = Math.min((now - lastFrameRef.current) / 1000, 0.25);
        displayTimeRef.current += delta * (1 - Math.exp(-dt / SEEK_SMOOTHING_TAU));
      }
      lastFrameRef.current = now;
      updateSeekDisplay(displayTimeRef.current, dur);
    }
    frame = requestAnimationFrame(tick);
    // No re-anchor on cleanup — `displayTimeRef` simply stops receiving
    // updates and stays exactly where the last tick left it, which is the
    // "freeze on click" behaviour this is for.
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, updateSeekDisplay, anchorPlayback]);

  // The overlay (and with it the seek input) is conditionally rendered,
  // while the <audio> element is not — see gotcha 2. Reopening it mounts a
  // fresh input at defaultValue={0}, so it needs repainting from the
  // position playback is actually at; when a track is playing the loop above
  // does that on its next frame anyway, but when it's paused nothing else
  // would.
  useEffect(() => {
    if (!isVisualizerOpen) return;
    const el = audioRef.current;
    updateSeekDisplay(displayTimeRef.current, el?.duration || 0);
  }, [isVisualizerOpen, updateSeekDisplay]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    function handleLoadedMetadata() {
      if (el) setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    }
    el.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => el.removeEventListener("loadedmetadata", handleLoadedMetadata);
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
      // The seek bar freezes the instant Pause is clicked (see the rAF loop
      // above), but the element itself keeps decoding audio underneath that
      // fade-out for another MICRO_FADE_DURATION so there's something for
      // the fade to actually fade — so its real `currentTime` has already
      // run past whatever the bar is showing by the time Play is clicked
      // again. Rewinding here is what makes the two agree: playback
      // actually resumes from the same spot the bar froze at, not from
      // wherever the fade-out tail left the element. A no-op for a genuine
      // fresh start (both are already 0 from the src-change effect above).
      el.currentTime = displayTimeRef.current;
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

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      const el = audioRef.current;
      const dur = el?.duration || duration;
      if (el) {
        el.currentTime = value;
        // Dragging back out of the last FADE_DURATION seconds has to undo
        // the pre-emptive end fade, or the rest of the track plays silently
        // (endFadeStartedRef only ever arms once per playthrough, so nothing
        // else would restore the volume until the next track).
        if (endFadeStartedRef.current && dur - value > FADE_DURATION) {
          endFadeStartedRef.current = false;
          gsap.killTweensOf(el);
          if (isPlaying) el.volume = useAppStore.getState().volume;
        }
      }
      // Anchor from the requested position, not el.currentTime: the seek is
      // still pending, so the element can keep reporting the old position
      // for a few more frames.
      anchorPlayback(value);
      updateSeekDisplay(value, dur);
    },
    [duration, isPlaying, updateSeekDisplay, anchorPlayback]
  );

  // The thumb is the user's to move while they hold it — the rAF loop above
  // checks this flag and leaves the input alone until the pointer is
  // released, at which point playback is re-anchored to wherever they let
  // go. onLostPointerCapture covers the release landing outside the input,
  // which a range element captures the pointer for.
  const handleScrubStart = useCallback(() => {
    isScrubbingRef.current = true;
  }, []);

  const handleScrubEnd = useCallback(() => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    anchorPlayback(Number(seekRef.current?.value ?? 0));
  }, [anchorPlayback]);

  // Sets el.volume directly rather than through the store's `volume` value
  // as a dependency — wiring the fade-in effect above to `volume` would
  // re-run the whole play/pause effect (and restart the fade from 0) on
  // every drag tick. Skipped entirely once the pre-emptive end fade has
  // started (endFadeStartedRef) so dragging near a track's end doesn't kill
  // that tween and leave it ending at an un-faded volume.
  const handleVolumeChange = useCallback(
    (value: number) => {
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
        onEnded={() => {
          // The rAF loop above stops the instant `isPlaying` flips, so
          // without this the bar freezes wherever the last tick before
          // 'ended' left it — a frame or two short of the actual end, which
          // reads as the track not having finished.
          const el = audioRef.current;
          const dur = el && Number.isFinite(el.duration) ? el.duration : 0;
          anchorPlayback(dur);
          updateSeekDisplay(dur, dur);
          togglePlaying(false);
        }}
        onError={() => {
          // playLocalTrack() already rejects an obviously-wrong file
          // (wrong mime type, too large) before this element ever sees it —
          // this catches what that can't: a file that looked fine but the
          // browser still can't decode (corrupt bytes, an unsupported
          // codec). Only local uploads hit this path — iTunes' preview URLs
          // are stable, so a real error there would just be a dead link,
          // not something to blame on the file and bounce the user for.
          const { selectedAlbum, activeTrack: track } = useAppStore.getState();
          if (selectedAlbum || !track) return;
          setLocalTrackError(
            `Couldn't play "${track.trackName}" — the file may be corrupt or in a format this browser can't decode.`
          );
          handleClose();
        }}
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

          {/* Full-width seek bar — sits above the button row so opening
              SettingsPanel's dropdown (which grows upward from the button
              row below) doesn't fight it for space. */}
          <div className="absolute bottom-20 left-6 right-6 sm:bottom-24 sm:left-10 sm:right-10">
            {/* step="any" rather than a number: a native thumb snaps to its
                step, so a 0.1s step on a 30s preview quantised the thumb to
                ~4px hops while the CSS fill (a raw fraction) crawled on
                smoothly between them — the two visibly disagreed several
                times a second. "any" lets the thumb sit exactly where the
                fill does. */}
            <input
              ref={seekRef}
              type="range"
              min={0}
              max={duration || 0}
              step="any"
              defaultValue={0}
              onChange={handleSeek}
              onPointerDown={handleScrubStart}
              onPointerUp={handleScrubEnd}
              onPointerCancel={handleScrubEnd}
              onLostPointerCapture={handleScrubEnd}
              disabled={!duration}
              aria-label="Seek"
              className="range-slider disabled:opacity-40"
            />
          </div>

          <div className="absolute bottom-6 left-6 flex items-center gap-3 sm:left-10 sm:bottom-10">
            <button
              type="button"
              onClick={handleTogglePlaying}
              className="rounded-full border border-line px-5 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            {/* Text content is intentionally static here — updateSeekDisplay
                writes the live value straight to this node's textContent.
                Rendering the same literal on every React re-render (rather
                than reading state) means reconciliation never has reason to
                touch it and stomp the imperative update; it only gets
                overwritten for real when `duration` actually changes, at
                which point resetting to 0 is correct anyway (see the
                src-change effect above). */}
            <div
              ref={timeDisplayRef}
              className="rounded-full border border-line px-5 py-2 text-xs uppercase tracking-[0.2em] text-fg tabular-nums"
            >
              {formatTime(0)} / {formatTime(duration)}
            </div>
          </div>

          <div className="absolute bottom-6 right-6 flex items-end gap-3 sm:bottom-10 sm:right-10">
            <VolumeSlider value={volume} onChange={handleVolumeChange} />
            <SettingsPanel theme={theme} />
          </div>
        </div>
      )}
    </>
  );
}

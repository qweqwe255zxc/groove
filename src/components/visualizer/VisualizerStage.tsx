"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";
import { findAdjacentPlayable } from "@/lib/tracks";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { useRangeDrag } from "@/hooks/useRangeDrag";
import { useGsapClose } from "@/hooks/useGsapClose";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";
import { getParticleColors, getPalette } from "./palettes";
import {
  PILL_BASE,
  PILL_BUTTON,
  PILL_ROW_ITEM,
  PILL_SHAPE,
} from "./controlStyles";
import { NextIcon, PrevIcon } from "@/components/icons/transport";
import CanvasErrorBoundary from "./CanvasErrorBoundary";
import OrbScene from "./scenes/OrbScene";
import TerrainScene from "./scenes/TerrainScene";
import SettingsPanel from "./SettingsPanel";
import TrackListPanel from "./TrackListPanel";
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

// Viewport width under which the scene gets the phone treatment described in
// ResponsiveCamera: pulled back a little and dropped down the frame so it
// stops sharing space with TrackMeta's text in the upper half. Matches
// Tailwind's `sm`, which is where the overlay's own controls switch layout.
const NARROW_VIEWPORT = 640;
// Extra fit radius (i.e. how much empty margin to keep around the scene) and
// how far down the frame to shift it, as a share of the visible frame height.
const NARROW_FIT_MARGIN = 1.3;
const NARROW_SCENE_DROP = 0.12;

// Only ever used in dark theme — see the comment on `theme`/Bloom below for
// why light theme skips the Bloom pass entirely instead of needing its own
// tuning here.
//
// Three independent axes, which is the useful thing to know when tuning
// this by eye — "too bright" and "too wide" are not the same knob:
//   luminanceThreshold — *which* pixels glow (raise it and only the hottest
//     points qualify; lower it and the whole cloud does)
//   intensity          — how bright the glow they produce is
//   radius             — how far out from them it spreads. Only has any
//     effect with `mipmapBlur` on, which is why it's on.
//
// `radius` is kept at postprocessing's own default on purpose: it's what
// throws the wide, soft pool of light around the orb's silhouette, and
// without it the glow clamps to the points themselves and the scene loses
// the sense of the cloud lighting the space it's in. Dial brightness with
// the first two instead — cutting `radius` to fix glare takes the halo out
// with it.
const DARK_BLOOM_TUNING = {
  luminanceThreshold: 0.1,
  luminanceSmoothing: 0.95,
  intensity: 1,
  radius: 0.85,
};

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
// How far the element's own clock has to advance past a freshly anchored
// position before the loop below trusts it to be running and starts
// extrapolating again. Small enough that a real playing element clears it on
// its first or second update, large enough not to be tripped by the sample
// -boundary rounding a `currentTime` write comes back with.
const CLOCK_LIVE_EPSILON = 0.01;

// Arrow-key nudges: Left/Right seeks, Up/Down adjusts volume. Both animate
// to the new position over this duration rather than snapping instantly —
// short enough to still feel like a direct response to the key, long enough
// to actually read as a glide.
const SEEK_KEY_STEP = 5;
const VOLUME_KEY_STEP = 0.05;
const ARROW_KEY_TWEEN_DURATION = 0.15;

// How far into a track the Previous button switches from "go back a track"
// to "restart this one" — see handlePrev. Three seconds is the usual choice,
// and it's comfortably longer than the pause fade, so a press right after
// one can't be read as the wrong intent.
const PREV_RESTART_THRESHOLD = 3;

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
    // On a phone the overlay's own UI is stacked against the top of the
    // frame (TrackMeta's cover + title + details list), so a scene centred
    // in the viewport lands right on top of it while the space below the
    // text goes unused. Asking for a larger radius to stay in frame pushes
    // the camera back, shrinking the scene enough to stop competing.
    const narrow = size.width < NARROW_VIEWPORT;
    const fitRadius = FIT_RADIUS * (narrow ? NARROW_FIT_MARGIN : 1);
    const distanceForVertical = fitRadius / Math.tan(vFov / 2);
    const distanceForHorizontal = fitRadius / Math.tan(hFov / 2);
    const baseDistance = new THREE.Vector3(...BASE_CAMERA_POSITION).length();
    const distance = Math.max(baseDistance, distanceForVertical, distanceForHorizontal);

    camera.position
      .set(...BASE_CAMERA_POSITION)
      .normalize()
      .multiplyScalar(distance);
    // Aiming above the origin drops the scene down the frame by the same
    // amount, into that empty lower half. Clamped so the drop can never
    // exceed the slack the fit calculation above actually left — on a
    // narrow portrait viewport the horizontal fit dominates and there's
    // plenty, but on a short landscape one there may be none at all.
    const halfFrame = distance * Math.tan(vFov / 2);
    const drop = narrow
      ? Math.max(0, Math.min(halfFrame * 2 * NARROW_SCENE_DROP, halfFrame - fitRadius))
      : 0;
    camera.lookAt(0, drop, 0);
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
  // The same reading, split in two, for the phone layout: elapsed under the
  // left end of the seek bar and total under the right, the way every player
  // labels a scrubber. Only one of the two forms is ever in the DOM (the
  // pill is `hidden` below md and these are `md:hidden`), but the updater
  // writes whichever it finds rather than branching on a breakpoint it has
  // no way to observe.
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);

  const selectedAlbum = useAppStore((s) => s.selectedAlbum);
  const activeTrack = useAppStore((s) => s.activeTrack);
  const tracks = useAppStore((s) => s.tracks);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const isVisualizerOpen = useAppStore((s) => s.isVisualizerOpen);
  const visualizerMode = useAppStore((s) => s.visualizerMode);
  const sensitivity = useAppStore((s) => s.sensitivity);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const volume = useAppStore((s) => s.volume);
  const setVolume = useAppStore((s) => s.setVolume);
  const setVisualizerMode = useAppStore((s) => s.setVisualizerMode);
  const togglePlaying = useAppStore((s) => s.togglePlaying);
  const playAdjacentTrack = useAppStore((s) => s.playAdjacentTrack);
  const closeVisualizer = useAppStore((s) => s.closeVisualizer);
  const setLocalTrackError = useAppStore((s) => s.setLocalTrackError);

  const audio = useAudioAnalyser(audioRef, sensitivity);
  // Both are null for a local upload (no album, no list) and at the ends of
  // an album — which is exactly when the matching transport button should be
  // dead rather than silently doing nothing.
  const prevTrack = findAdjacentPlayable(tracks, activeTrack, -1);
  const nextTrack = findAdjacentPlayable(tracks, activeTrack, 1);
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
    const elapsed = elapsedRef.current;
    if (elapsed) elapsed.textContent = formatTime(time);
    const total = totalRef.current;
    if (total) total.textContent = formatTime(dur);
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
  // The position the clocks were last anchored to, and whether the element
  // has since been seen actually moving past it.
  //
  // Between a resume (or a seek) and the element's clock genuinely starting
  // again there's a window where it already reports `paused: false` and
  // `readyState: 4` while `currentTime` hasn't budged — on iOS that's the
  // audio session spinning back up, and it runs a few hundred ms. Trusting
  // those two flags alone, the loop below extrapolated straight through it:
  // the bar sailed up to MAX_EXTRAPOLATION ahead of the audio and then
  // rubber-banded back the moment the first real `currentTime` landed, which
  // is what "the slider jumps backwards after unpausing" was.
  const anchorTimeRef = useRef(0);
  const clockLiveRef = useRef(false);
  // True while the user is dragging the thumb. The loop below has to stand
  // down for the duration: a seek isn't instant, so `el.currentTime` keeps
  // reporting the pre-seek position for a few frames and writing that back
  // into `input.value` would drag the thumb out from under the pointer.
  const isScrubbingRef = useRef(false);
  // Same idea as isScrubbingRef, set for the duration of an arrow-key seek's
  // tween (see seekBy below) instead of a pointer drag — the tween is the
  // one writing `el.currentTime` every frame during that window, so the loop
  // has to stand down for it too or the two fight over displayTimeRef.
  const isKeySeekingRef = useRef(false);

  // Re-syncs all three clocks to a known position — used anywhere the
  // position changes for a reason the extrapolation can't see coming (a new
  // src, a resume, the end of a drag), so the next tick eases from there
  // instead of from a stale baseline.
  const anchorPlayback = useCallback((time: number) => {
    baseTimeRef.current = time;
    basePerfRef.current = performance.now();
    lastFrameRef.current = basePerfRef.current;
    displayTimeRef.current = time;
    // Every caller is a position change the element hasn't caught up with
    // yet (a new src, a resume, the end of a drag), so its clock is stale by
    // definition until it's seen moving again.
    anchorTimeRef.current = time;
    clockLiveRef.current = false;
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
      if (!el || isScrubbingRef.current || isKeySeekingRef.current) {
        lastFrameRef.current = now;
        return;
      }
      if (el.currentTime !== baseTimeRef.current) {
        baseTimeRef.current = el.currentTime;
        basePerfRef.current = now;
      }
      // Measured against the anchor rather than the previous frame's
      // baseline: a display refreshing faster than the element updates its
      // clock would never see a single step clear the epsilon, but total
      // progress since the anchor always does.
      if (
        !clockLiveRef.current &&
        el.currentTime - anchorTimeRef.current > CLOCK_LIVE_EPSILON
      ) {
        clockLiveRef.current = true;
      }
      const dur = el.duration || 0;
      // Extrapolation is only valid while the element is actually decoding
      // and emitting audio — mid-buffer (readyState drops), `currentTime`
      // stands still and extrapolating anyway would walk the thumb away
      // from the sound. `clockLive` covers the case the other two flags
      // miss, where the element claims both but hasn't started moving yet
      // (see the ref's own comment). The cap covers it from the other side:
      // however long the element goes without a real update, the thumb never
      // runs more than this far ahead of the last position it confirmed.
      const playing =
        clockLiveRef.current && !el.paused && el.readyState >= HAVE_FUTURE_DATA;
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

  // Every level change below (the play/pause fades, the end fade, the slider)
  // goes through `audio.setVolume` — the audio graph's output gain — rather
  // than `el.volume`, which iOS Safari ignores outright; see the docblock on
  // setVolume in useAudioAnalyser. gsap can't tween a plain function call, so
  // this ref-held object is what the tweens actually animate, with each frame
  // pushed to the gain in onUpdate (the same proxy-object pattern seekBy and
  // volumeBy already use for arrow keys).
  const faderRef = useRef({ volume: 1 });
  const setOutputVolume = audio.setVolume;
  const fadeTo = useCallback(
    (value: number, duration: number, onComplete?: () => void) => {
      const fader = faderRef.current;
      gsap.killTweensOf(fader);
      gsap.to(fader, {
        volume: value,
        duration,
        ease: "sine.inOut",
        onUpdate: () => setOutputVolume(fader.volume),
        onComplete,
      });
    },
    [setOutputVolume]
  );
  // Jumps the level immediately, cancelling any fade in flight — dragging the
  // slider, or restoring a level a fade left somewhere else.
  const setVolumeNow = useCallback(
    (value: number) => {
      gsap.killTweensOf(faderRef.current);
      faderRef.current.volume = value;
      setOutputVolume(value);
    },
    [setOutputVolume]
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    // Kill any fade already in flight — rapid play/pause toggling (or a
    // track switch mid-fade) would otherwise leave two tweens fighting over
    // the fader.
    gsap.killTweensOf(faderRef.current);
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
      setVolumeNow(0);
      el.play()
        .then(() => {
          if (cancelled) return;
          // Read fresh rather than closing over the `volume` from render —
          // this effect doesn't depend on it (see handleVolumeChange below
          // for why it can't), so a stale closure would fade in at whatever
          // volume was set the moment this effect last ran instead of
          // whatever the slider is at right now.
          const target = useAppStore.getState().volume;
          fadeTo(target, duration);
        })
        .catch(() => {
          if (!cancelled) togglePlaying(false);
        });
    } else {
      fadeTo(0, duration, () => el.pause());
    }
    // `activeTrack?.previewUrl` is also a dependency, not just `isPlaying` —
    // without it, switching to a new track while already playing (isPlaying
    // staying `true` across the switch) wouldn't re-run this effect at all,
    // since React only reruns on a dependency's value actually changing. The
    // new src would load (the other effect above) but never actually play.
    return () => {
      cancelled = true;
    };
  }, [isPlaying, activeTrack?.previewUrl, audio, fadeTo, setVolumeNow, togglePlaying]);

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
        fadeTo(0, Math.max(remaining, 0));
      }
    }
    el.addEventListener("timeupdate", handleTimeUpdate);
    return () => el.removeEventListener("timeupdate", handleTimeUpdate);
  }, [fadeTo]);

  // Wraps togglePlaying() for the explicit play/pause entry points (button,
  // Spacebar) so the fade above can tell "user toggled mid-track playback"
  // (either direction) apart from VinylPanel's Play button starting a track
  // fresh, or onEnded/closeVisualizer ending one.
  const handleTogglePlaying = useCallback(() => {
    fastFadeRef.current = true;
    togglePlaying();
  }, [togglePlaying]);

  // A phone locking or the tab backgrounding doesn't pause playback on its
  // own — without this the track (and its analyser-driven scene, uselessly
  // rendering behind a black lock screen) just keeps going until the user
  // comes back. Same micro-fade an explicit Pause gets, not the slower
  // artistic one — this is unmistakably a mid-track interruption, not a
  // deliberate end. Doesn't auto-resume on returning: unlike the ambient
  // bed, an explicit Play is what re-establishes user activation here, and
  // silently resuming whatever the user muted the phone for isn't obviously
  // the right call anyway. (BackgroundMusic has its own separate handler for
  // the ambient bed.)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden && useAppStore.getState().isPlaying) {
        fastFadeRef.current = true;
        togglePlaying(false);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [togglePlaying]);

  // The actual seek: written to the element, restores the pre-emptive end
  // fade if the new position backs out of its window, and re-syncs the
  // display loop's baseline. Shared by handleSeek's non-drag branch (a click
  // or a native keyboard step on the focused input, both a single discrete
  // change) and handleScrubEnd (a drag's final position, on release).
  const commitSeek = useCallback(
    (value: number, dur: number) => {
      const el = audioRef.current;
      if (el) {
        el.currentTime = value;
        // Dragging back out of the last FADE_DURATION seconds has to undo
        // the pre-emptive end fade, or the rest of the track plays silently
        // (endFadeStartedRef only ever arms once per playthrough, so nothing
        // else would restore the volume until the next track).
        if (endFadeStartedRef.current && dur - value > FADE_DURATION) {
          endFadeStartedRef.current = false;
          gsap.killTweensOf(faderRef.current);
          if (isPlaying) setVolumeNow(useAppStore.getState().volume);
        }
      }
      anchorPlayback(value);
      updateSeekDisplay(value, dur);
    },
    [isPlaying, setVolumeNow, anchorPlayback, updateSeekDisplay]
  );

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      const dur = audioRef.current?.duration || duration;
      // While the thumb is actively being dragged, only move the visual
      // position — actually seeking the element on every intermediate value
      // here (the old behaviour) fired a real `el.currentTime` write per
      // pointer-move tick, which sounds like scratching a record instead of
      // scrubbing one. Playback keeps running from wherever it already was
      // until the drag ends; handleScrubEnd below commits the real seek
      // exactly once, to wherever the user let go.
      if (isScrubbingRef.current) {
        updateSeekDisplay(value, dur);
        return;
      }
      commitSeek(value, dur);
    },
    [duration, updateSeekDisplay, commitSeek]
  );

  // Arrow-key seek (Left/Right) — tweens to the target instead of jumping
  // straight there, unlike handleSeek (dragging the bar already gives its
  // own continuous, un-eased feedback, so a tap of the arrow key is the one
  // case that needs the motion added artificially). `isKeySeekingRef` stands
  // the rAF display loop down for the tween's duration — same reason
  // `isScrubbingRef` does for a pointer drag — since this writes
  // `el.currentTime` every frame itself.
  const seekTweenRef = useRef({ time: 0 });
  const seekBy = useCallback(
    (delta: number) => {
      const el = audioRef.current;
      const dur = el?.duration || duration;
      const target = Math.min(Math.max(displayTimeRef.current + delta, 0), dur || 0);

      isKeySeekingRef.current = true;
      const proxy = seekTweenRef.current;
      proxy.time = displayTimeRef.current;
      gsap.killTweensOf(proxy);
      gsap.to(proxy, {
        time: target,
        duration: ARROW_KEY_TWEEN_DURATION,
        ease: "power2.out",
        onUpdate: () => {
          if (el) el.currentTime = proxy.time;
          displayTimeRef.current = proxy.time;
          updateSeekDisplay(proxy.time, dur);
        },
        onComplete: () => {
          isKeySeekingRef.current = false;
          commitSeek(target, dur);
        },
      });
    },
    [duration, updateSeekDisplay, commitSeek]
  );

  // The thumb is the user's to move while they hold it — the rAF loop above
  // checks this flag and leaves the input alone until the pointer is
  // released, at which point the real seek is committed to wherever they let
  // go (see commitSeek above).
  const handleScrubStart = useCallback(() => {
    isScrubbingRef.current = true;
  }, []);

  const handleScrubEnd = useCallback(() => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    const dur = audioRef.current?.duration || duration;
    commitSeek(Number(seekRef.current?.value ?? 0), dur);
  }, [duration, commitSeek]);

  // Painting only, no seek: the whole drag is one continuous gesture, and
  // handleScrubEnd commits its final position on release (the same split
  // handleSeek already made for a native drag, and for the same reason —
  // writing `el.currentTime` on every pointer tick sounds like scratching a
  // record). Drag handling itself is taken over from the browser by
  // useRangeDrag, which is what makes the bar reachable by finger at all.
  const handleScrubMove = useCallback(
    (value: number) => {
      updateSeekDisplay(value, audioRef.current?.duration || duration);
    },
    [duration, updateSeekDisplay]
  );

  const seekDragProps = useRangeDrag({
    onStart: handleScrubStart,
    onValue: handleScrubMove,
    onEnd: handleScrubEnd,
  });

  // Next: straight to the following playable track. Marked as a fast fade
  // for the same reason an explicit Pause is — the user asked for this one
  // *now*, while the slow artistic fade-in belongs to a track that started
  // on its own (VinylPanel's Play, or auto-advance at the end of the
  // previous one).
  const handleNext = useCallback(() => {
    if (!nextTrack) return;
    fastFadeRef.current = true;
    playAdjacentTrack(1);
  }, [nextTrack, playAdjacentTrack]);

  // Previous, with the convention every media player uses: once you're a few
  // seconds in, the first press restarts *this* track and only a second one
  // leaves it. Without that rule the button can't do the thing it's most
  // often reached for — "play that again from the top" — and a press a
  // moment too late silently throws you back a track instead.
  //
  // Measured against `displayTimeRef` rather than `el.currentTime`: it's the
  // position actually on screen, which is what the user is judging "am I far
  // enough in" by, and the element's own clock deliberately runs ahead of it
  // through a pause fade (see the rAF loop above).
  const handlePrev = useCallback(() => {
    const restart =
      displayTimeRef.current > PREV_RESTART_THRESHOLD || !prevTrack;
    if (restart) {
      // With nothing before this track, a restart is the only thing
      // "previous" can mean — better than a press that does nothing at all.
      commitSeek(0, audioRef.current?.duration || duration);
      return;
    }
    fastFadeRef.current = true;
    playAdjacentTrack(-1);
  }, [prevTrack, playAdjacentTrack, commitSeek, duration]);

  // Writes the fader directly rather than going through the store's `volume`
  // value as a dependency — wiring the fade-in effect above to `volume` would
  // re-run the whole play/pause effect (and restart the fade from 0) on
  // every drag tick. Skipped entirely once the pre-emptive end fade has
  // started (endFadeStartedRef) so dragging near a track's end doesn't kill
  // that tween and leave it ending at an un-faded volume.
  const handleVolumeChange = useCallback(
    (value: number) => {
      setVolume(value);
      if (isPlaying && !endFadeStartedRef.current) setVolumeNow(value);
    },
    [isPlaying, setVolumeNow, setVolume]
  );

  // Arrow-key volume (Up/Down) — tweens through handleVolumeChange every
  // frame (same live fader write dragging the slider gets) instead of
  // jumping straight to the target, so a tap of the arrow key reads as a
  // glide rather than a step.
  const volumeTweenRef = useRef({ v: 0 });
  const volumeBy = useCallback(
    (delta: number) => {
      const raw = useAppStore.getState().volume + delta;
      const target = Math.round(Math.min(Math.max(raw, 0), 1) * 100) / 100;
      const proxy = volumeTweenRef.current;
      proxy.v = useAppStore.getState().volume;
      gsap.killTweensOf(proxy);
      gsap.to(proxy, {
        v: target,
        duration: ARROW_KEY_TWEEN_DURATION,
        ease: "sine.inOut",
        onUpdate: () => handleVolumeChange(proxy.v),
      });
    },
    [handleVolumeChange]
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
  // close.
  const animateClose = useGsapClose(stageRef, closeVisualizer);
  const handleClose = useCallback(() => {
    animateClose({ autoAlpha: 0, scale: 1.04, duration: 0.35, ease: "power2.in" });
  }, [animateClose]);

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

  // Space toggles playback, Escape closes the overlay, Left/Right seek ±5s,
  // Up/Down adjust volume ±5%. All five call preventDefault(): without it,
  // Space would ALSO re-click whichever button currently has focus — almost
  // always the Play/Pause button itself, right after being clicked —
  // double-toggling playback instead of once; Up/Down would otherwise also
  // scroll the page behind the overlay.
  useEffect(() => {
    if (!isVisualizerOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      // The seek bar, volume slider, and Settings' sensitivity slider are
      // all native <input type="range">s with their own arrow-key stepping
      // — bail out here rather than fight them for Left/Right/Up/Down while
      // one of them has focus.
      if (
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown") &&
        e.target instanceof HTMLElement &&
        e.target.tagName === "INPUT"
      ) {
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        handleTogglePlaying();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-SEEK_KEY_STEP);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(SEEK_KEY_STEP);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        volumeBy(VOLUME_KEY_STEP);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        volumeBy(-VOLUME_KEY_STEP);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisualizerOpen, handleTogglePlaying, handleClose, seekBy, volumeBy]);

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
          // Auto-advance: an album plays through. `nextTrack` is read fresh
          // from the store rather than closed over, since this handler is
          // attached to an element that never unmounts (gotcha 2) and would
          // otherwise be advancing from whatever the track was when the
          // overlay last rendered. Not marked as a fast fade — the next
          // track starting on its own is exactly the case the slower
          // artistic fade-in is for. The src-change effect re-anchors the
          // clocks to 0, so the `dur` stamped above is only ever the last
          // frame of the finished track.
          const state = useAppStore.getState();
          if (findAdjacentPlayable(state.tracks, state.activeTrack, 1)) {
            state.playAdjacentTrack(1);
          } else {
            togglePlaying(false);
          }
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
          /* overflow-hidden because r3f rounds the canvas up to whole
             device pixels, leaving it a few px wider than the viewport on a
             fractional-DPR screen. */
          className="fixed inset-0 z-50 flex flex-col overflow-hidden"
          style={{ background: palette.background }}
        >
          <CanvasErrorBoundary onReset={handleClose}>
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
                      radius={DARK_BLOOM_TUNING.radius}
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
          </CanvasErrorBoundary>

          <TrackMeta />

          {/* One line at every width. Below sm the four pills share it as
              equal columns spanning the full inset (stopping short read as a
              mis-measured row rather than a deliberate inset); from sm: up
              they shrink back to a compact group in the corner. Below 420px
              the type and padding step down a size to keep all four on the
              line — see PILL_ROW_ITEM, which is where that lives.

              This used to wrap 2×2 below 420px instead, which cost the scene
              a second band of chrome across the top of a phone screen. */}
          <div className="absolute inset-x-4 top-4 flex items-center gap-1.5 min-[420px]:gap-2 sm:inset-x-auto sm:right-10 sm:top-10 sm:gap-3">
            <button
              type="button"
              onClick={() =>
                setVisualizerMode(visualizerMode === "orb" ? "terrain" : "orb")
              }
              className={`${PILL_BUTTON} ${PILL_ROW_ITEM}`}
            >
              {visualizerMode === "orb" ? "Orb" : "Terrain"}
            </button>
            {/* SiteHeader (the other place ThemeToggle lives, via
                OverlayMenu) hides itself whenever this overlay is open — see
                the comment on that early-return in SiteHeader.tsx — so
                there'd be no way to flip the theme without first closing the
                visualizer if it weren't also reachable from here. */}
            <ThemeToggle variant="control" className={PILL_ROW_ITEM} />
            <button
              type="button"
              onClick={handleShare}
              disabled={!selectedAlbum || !activeTrack}
              className={`${PILL_BUTTON} ${PILL_ROW_ITEM} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {shareCopied ? "Copied" : "Share"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close visualizer"
              className={`${PILL_BUTTON} ${PILL_ROW_ITEM}`}
            >
              Close
            </button>
          </div>

          {/* Everything that drives playback, as one block pinned to the
              bottom edge: seek, then the controls under it. They used to be
              two separately-positioned bars whose offsets had to be kept in
              sync by hand (`bottom-32` vs `bottom-24`) so a touch screen's
              40px-tall slider hit area wouldn't reach down into the buttons;
              stacked in one column the gap is just a gap.

              Below md this is a phone player: full-width scrubber, its two
              ends labelled underneath, a transport row where Play takes all
              the width the arrows don't, and Tracks/Settings splitting a row
              of their own 50/50. Everything spans the full inset, so nothing
              is left dangling mid-row the way the old ragged two-line
              arrangement was. From md: up it collapses back to the single
              line it always was — transport left, readout centred, dropdowns
              right. */}
          <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3 sm:inset-x-10 sm:bottom-10 sm:gap-4">
            <div>
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
                {...seekDragProps}
                disabled={!duration}
                aria-label="Seek"
                className="range-slider disabled:opacity-40"
              />
              {/* Phone-only: the pill below carries both figures from md up.
                  Plain muted text rather than a third bordered chip — a
                  scrubber's own labels are the one thing here that isn't a
                  control, and giving them a border made them look like one.
                  `px-1` lines each figure up with the end of the track
                  rather than the end of the thumb's travel. */}
              <div className="mt-2 flex justify-between px-1 text-[11px] tabular-nums tracking-widest text-muted md:hidden">
                <span ref={elapsedRef}>{formatTime(0)}</span>
                <span ref={totalRef}>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Two stacked rows below md, one from md: up — where the outer
                groups go `flex-1 basis-0` so they measure equal regardless of
                their own content ("Pause" is wider than "Play", "Settings"
                wider than both) and the readout sits on the real centre line
                rather than drifting as the labels change.

                md rather than sm because it's content width that decides it:
                all five controls on one line need ~614px, and even a 640px
                screen only offers 560. Volume lives inside Settings for the
                same reason — out here it was the one thing with no room. */}
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-3">
              <div className="flex items-stretch gap-2 md:flex-1 md:basis-0 md:items-center md:justify-start">
                {/* Rendered only for a real multi-track album: a local upload
                    has nothing to step to, and two permanently-dead buttons
                    are worse than none. */}
                {tracks.length > 1 && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Previous track"
                    className={`${PILL_BUTTON} flex shrink-0 items-center justify-center px-5 py-3 md:px-3 md:py-2`}
                  >
                    <PrevIcon className="h-2.5 w-4" />
                  </button>
                )}
                {/* The one filled control in the overlay, at every width:
                    the transport row is the first thing anyone goes for and
                    three identical outlined pills give them nothing to aim
                    at. Only its metrics change at md: — full-width and
                    finger-tall below, natural width and the same height as
                    the pills beside it above. Built on PILL_SHAPE, not
                    PILL_BUTTON, so neither the shared `hover:border-fg` nor
                    the shared border/text colours have to be fought off
                    here; hover dips the fill instead, since a border it
                    already has can't light up. */}
                <button
                  type="button"
                  onClick={handleTogglePlaying}
                  className={`${PILL_SHAPE} flex-1 cursor-pointer border-accent bg-accent py-3 text-center text-bg transition hover:opacity-90 md:flex-none md:px-5 md:py-2`}
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                {tracks.length > 1 && (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!nextTrack}
                    aria-label="Next track"
                    className={`${PILL_BUTTON} flex shrink-0 items-center justify-center px-5 py-3 disabled:cursor-not-allowed disabled:opacity-40 md:px-3 md:py-2`}
                  >
                    <NextIcon className="h-2.5 w-4" />
                  </button>
                )}
              </div>

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
                className={`${PILL_BASE} hidden shrink-0 whitespace-nowrap tabular-nums md:block md:px-5`}
              >
                {formatTime(0)} / {formatTime(duration)}
              </div>

              <div className="flex items-stretch gap-2 md:flex-1 md:basis-0 md:items-end md:justify-end md:gap-3">
                <TrackListPanel className="flex-1 md:flex-none" />
                <SettingsPanel
                  className="flex-1 md:flex-none"
                  theme={theme}
                  volume={volume}
                  onVolumeChange={handleVolumeChange}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";

// A looping background bed that plays everywhere in the app by default, so
// the site never feels silent before a real track is playing — ducks out
// whenever the fullscreen visualizer is open (isVisualizerOpen) and fades
// back in once it closes. Gated on isVisualizerOpen rather than isPlaying so
// the visualizer stays a music-free zone even while paused inside it (a
// deep-link landing, or an explicit Pause mid-track) — the real track's own
// audio is all that should be heard there. `musicMuted` (toggled from
// OverlayMenu) is a second, independent gate — either it or the visualizer
// being open is enough to silence the bed.
const MUSIC_VOLUME = 0.25;
const FADE_OUT_SECONDS = 1.2; // ducking for the visualizer — quick, out of the way
const FADE_IN_SECONDS = 2.5; // returning after — slower, doesn't jump out

// Same key-naming convention as ThemeEffect's STORAGE_KEY.
const STORAGE_KEY = "groove-music-muted";

// Fading `.volume` down to 0 alone doesn't guarantee silence — iOS Safari
// ignores JS writes to it entirely (playback always follows the hardware
// volume slider), which is exactly why the mute toggle used to look broken
// on a phone: the bed kept playing at full volume no matter what state it
// claimed to be in. Actually pausing the element once the fade-out
// completes (and calling play() again on the way back in) is what makes
// muting real everywhere, not just on platforms that happen to respect
// `.volume`.
function setSilenced(el: HTMLAudioElement, silenced: boolean, duration: number) {
  gsap.killTweensOf(el);
  if (silenced) {
    gsap.to(el, { volume: 0, duration, ease: "sine.inOut", onComplete: () => el.pause() });
  } else {
    el.play().catch(() => {});
    gsap.to(el, { volume: MUSIC_VOLUME, duration, ease: "sine.inOut" });
  }
}

export default function BackgroundMusic() {
  const isVisualizerOpen = useAppStore((s) => s.isVisualizerOpen);
  const musicMuted = useAppStore((s) => s.musicMuted);
  const setMusicMuted = useAppStore((s) => s.setMusicMuted);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const attemptingRef = useRef(false);

  // Restores a saved mute choice on first load, mirroring ThemeEffect's
  // restore effect — deferred to a microtask rather than a synchronous
  // setState as the first statement in the effect body (gotcha 9). Runs
  // before the unlock effect below ever gets a real gesture to act on (that
  // needs a click/keydown/touchstart, which can't happen before mount), so
  // by the time `tryUnlock` reads `state.musicMuted` fresh from the store
  // the restored value is already there.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true" || stored === "false") {
      Promise.resolve().then(() => setMusicMuted(stored === "true"));
    }
    // Restore once, on mount only — subsequent changes are the user acting
    // through MusicToggle, not something to re-read from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(musicMuted));
  }, [musicMuted]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0; // silent until unlocked by a gesture below

    // Autoplay policy: play() must be called while the page holds "user
    // activation". Per the HTML spec's "activation triggering input events"
    // list, only pointerdown/keydown/touchstart (and relatives) directly
    // grant it — scrolling, a wheel tick and a bare mousemove never do. But
    // activation is *sticky*: once any one of those real gestures has landed
    // ANYWHERE on the page (clicking the search bar, a link, anything), the
    // page keeps activation for the rest of the session, and play() calls
    // made afterwards succeed even from a mousemove or scroll handler — it's
    // not the move granting it, just riding on activation something else
    // already earned. Chrome will also often let the first attempt through
    // outright on a site the visitor has played media on before (its Media
    // Engagement Index), with no gesture at all.
    //
    // So everything a visitor might plausibly do first is a retry point, and
    // none of them are `once`: an attempt that fails costs nothing and the
    // next event tries again, which is what makes the bed come up as soon as
    // the user does *anything* — scrolls, moves the mouse, taps — rather
    // than needing a click aimed specifically at audio.
    const unlockEvents = [
      "pointerdown",
      "keydown",
      "touchstart",
      "mousemove",
      "wheel",
      "scroll",
      "touchmove",
    ] as const;
    function removeUnlockListeners() {
      for (const type of unlockEvents) window.removeEventListener(type, tryUnlock);
    }
    // Arrow function expression, not a function declaration — TS only
    // preserves the `el` non-null narrowing from the guard above into a
    // nested closure for the latter.
    const tryUnlock = () => {
      // `attempting` matters now that scroll is in the list: one Lenis-driven
      // scroll fires it dozens of times a second, and without this each of
      // those would start its own play() and leave a pile of pending
      // promises racing each other.
      if (unlockedRef.current || attemptingRef.current) return;
      attemptingRef.current = true;
      el.play()
        .then(() => {
          if (unlockedRef.current) return;
          unlockedRef.current = true;
          removeUnlockListeners();
          const state = useAppStore.getState();
          const silenced =
            document.hidden || state.isVisualizerOpen || state.musicMuted;
          setSilenced(el, silenced, FADE_IN_SECONDS);
        })
        .catch(() => {
          // Not enough activation yet — leave every listener in place and
          // let the next event have a go.
          attemptingRef.current = false;
        });
    };
    // Passive: none of these are ever preventDefault-ed, and `scroll`/`wheel`
    // in particular must not give Lenis's own handling anything to wait on.
    for (const type of unlockEvents) {
      window.addEventListener(type, tryUnlock, { passive: true });
    }

    return () => {
      removeUnlockListeners();
      gsap.killTweensOf(el);
    };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !unlockedRef.current || document.hidden) return;
    const silenced = isVisualizerOpen || musicMuted;
    setSilenced(el, silenced, silenced ? FADE_OUT_SECONDS : FADE_IN_SECONDS);
  }, [isVisualizerOpen, musicMuted]);

  // A phone locking, the browser backgrounding, or switching tabs doesn't
  // pause the <audio> element on its own — without this it just keeps
  // playing (and on iOS, inaudibly fighting the OS for the lock screen's
  // now-playing controls) until the user comes back and notices. Cut
  // instantly rather than tweening: the tab may be fully throttled by the
  // time this fires, so a gsap tween has no guarantee of ever completing.
  // Coming back only resumes if nothing else (mute, the visualizer) is
  // still a reason to stay silent.
  useEffect(() => {
    function handleVisibilityChange() {
      const el = audioRef.current;
      if (!el || !unlockedRef.current) return;
      if (document.hidden) {
        gsap.killTweensOf(el);
        el.volume = 0;
        el.pause();
        return;
      }
      const state = useAppStore.getState();
      if (!state.isVisualizerOpen && !state.musicMuted) {
        setSilenced(el, false, FADE_IN_SECONDS);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return (
    <audio ref={audioRef} src="/audio/Ambiment.mp3" loop preload="none" hidden />
  );
}

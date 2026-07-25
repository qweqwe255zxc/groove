"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";

// A looping ambient bed that plays everywhere in the app by default, so the
// site never feels silent before a real track is playing — ducks out
// whenever the fullscreen visualizer is open (isVisualizerOpen) and fades
// back in once it closes. Gated on isVisualizerOpen rather than isPlaying so
// the visualizer stays an ambient-free zone even while paused inside it (a
// deep-link landing, or an explicit Pause mid-track) — the real track's own
// audio is all that should be heard there. Same volume-tweening approach as
// the real track's own fade in VisualizerStage.
const AMBIENT_VOLUME = 0.25;
const FADE_OUT_SECONDS = 1.2; // ducking for the visualizer — quick, out of the way
const FADE_IN_SECONDS = 2.5; // returning after — slower, doesn't jump out

export default function AmbientBackground() {
  const isVisualizerOpen = useAppStore((s) => s.isVisualizerOpen);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0; // silent until unlocked by a gesture below

    // Autoplay policy: play() must be called from within a real user
    // gesture. Per the HTML spec's "activation triggering input events"
    // list, only pointerdown/keydown/touchstart (and their relatives)
    // actually grant it — mousemove never does, in any browser, so it's not
    // included here even though it'd be a nicer, more ambient way to unlock.
    const unlockEvents = ["pointerdown", "keydown", "touchstart"] as const;
    function removeUnlockListeners() {
      for (const type of unlockEvents) window.removeEventListener(type, tryUnlock);
    }
    // Arrow function expression, not a function declaration — TS only
    // preserves the `el` non-null narrowing from the guard above into a
    // nested closure for the latter.
    const tryUnlock = () => {
      if (unlockedRef.current) return;
      el.play()
        .then(() => {
          if (unlockedRef.current) return;
          unlockedRef.current = true;
          removeUnlockListeners();
          const target = useAppStore.getState().isVisualizerOpen ? 0 : AMBIENT_VOLUME;
          gsap.to(el, { volume: target, duration: FADE_IN_SECONDS, ease: "sine.inOut" });
        })
        .catch(() => {
          // Not a real gesture as far as the browser's concerned — leave
          // the other listeners in place.
        });
    };
    for (const type of unlockEvents) {
      window.addEventListener(type, tryUnlock, { once: true });
    }

    return () => {
      removeUnlockListeners();
      gsap.killTweensOf(el);
    };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !unlockedRef.current) return;
    gsap.killTweensOf(el);
    const target = isVisualizerOpen ? 0 : AMBIENT_VOLUME;
    const duration = isVisualizerOpen ? FADE_OUT_SECONDS : FADE_IN_SECONDS;
    gsap.to(el, { volume: target, duration, ease: "sine.inOut" });
  }, [isVisualizerOpen]);

  return (
    <audio ref={audioRef} src="/audio/Ambiment.mp3" loop preload="none" hidden />
  );
}

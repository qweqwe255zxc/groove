"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";

// A looping ambient bed that plays everywhere in the app by default, so the
// site never feels silent before a real track is playing — ducks out
// whenever a real track starts (isPlaying) and fades back in once it stops.
// Same volume-tweening approach as the real track's own fade in
// VisualizerStage, just gated on isPlaying instead of play/pause.
const AMBIENT_VOLUME = 0.25;
const FADE_OUT_SECONDS = 1.2; // ducking for a real track — quick, out of the way
const FADE_IN_SECONDS = 2.5; // returning after — slower, doesn't jump out

export default function AmbientBackground() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0; // silent until unlocked by a gesture below

    // Autoplay policy: play() must be called from within a real user
    // gesture. Per the HTML spec's "activation triggering input events"
    // list, pointerdown/keydown/touchstart reliably count and mousemove
    // doesn't — so a mousemove-only play() can silently fail. Each event
    // type gets exactly one attempt ({ once: true }): if mousemove's
    // attempt doesn't land, its listener is already gone but the
    // guaranteed ones are untouched and still waiting, so a later real
    // gesture still unlocks it — nothing is lost by trying mousemove first.
    const unlockEvents = ["pointerdown", "keydown", "touchstart", "mousemove"] as const;
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
          const target = useAppStore.getState().isPlaying ? 0 : AMBIENT_VOLUME;
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
    const target = isPlaying ? 0 : AMBIENT_VOLUME;
    const duration = isPlaying ? FADE_OUT_SECONDS : FADE_IN_SECONDS;
    gsap.to(el, { volume: target, duration, ease: "sine.inOut" });
  }, [isPlaying]);

  return (
    <audio ref={audioRef} src="/audio/Ambiment.mp3" loop preload="none" hidden />
  );
}

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
// the real track's own fade in VisualizerStage. `ambientMuted` (toggled from
// OverlayMenu) is a second, independent gate — either it or the visualizer
// being open is enough to silence the bed.
const AMBIENT_VOLUME = 0.25;
const FADE_OUT_SECONDS = 1.2; // ducking for the visualizer — quick, out of the way
const FADE_IN_SECONDS = 2.5; // returning after — slower, doesn't jump out

export default function AmbientBackground() {
  const isVisualizerOpen = useAppStore((s) => s.isVisualizerOpen);
  const ambientMuted = useAppStore((s) => s.ambientMuted);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0; // silent until unlocked by a gesture below

    // Autoplay policy: play() must be called while the page holds "user
    // activation". Per the HTML spec's "activation triggering input events"
    // list, only pointerdown/keydown/touchstart (and relatives) directly
    // grant it — a bare mousemove never does. But activation is *sticky*:
    // once any one of those real gestures has landed ANYWHERE on the page
    // (clicking the search bar, a link, anything), the page keeps activation
    // for the rest of the session, and play() calls made afterwards succeed
    // even from a mousemove handler — it's not the mousemove itself granting
    // it, just riding on activation something else already earned. So
    // mousemove is kept as a repeated, low-priority attempt: harmless to
    // fail early (before any real gesture happened yet) and retry on the
    // next move, and it's what makes the unlock feel like it "just happens"
    // as soon as the user does anything at all, instead of needing a click
    // aimed specifically at audio.
    const realGestureEvents = ["pointerdown", "keydown", "touchstart"] as const;
    function removeUnlockListeners() {
      for (const type of realGestureEvents) window.removeEventListener(type, tryUnlock);
      window.removeEventListener("mousemove", tryUnlock);
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
          const state = useAppStore.getState();
          const target =
            state.isVisualizerOpen || state.ambientMuted ? 0 : AMBIENT_VOLUME;
          gsap.to(el, { volume: target, duration: FADE_IN_SECONDS, ease: "sine.inOut" });
        })
        .catch(() => {
          // Not enough activation yet — leave the other listeners in place
          // (mousemove included: it's not `once`, so the next move tries
          // again rather than being permanently spent on one failed guess).
        });
    };
    for (const type of realGestureEvents) {
      window.addEventListener(type, tryUnlock, { once: true });
    }
    window.addEventListener("mousemove", tryUnlock);

    return () => {
      removeUnlockListeners();
      gsap.killTweensOf(el);
    };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !unlockedRef.current) return;
    gsap.killTweensOf(el);
    const silenced = isVisualizerOpen || ambientMuted;
    const target = silenced ? 0 : AMBIENT_VOLUME;
    const duration = silenced ? FADE_OUT_SECONDS : FADE_IN_SECONDS;
    gsap.to(el, { volume: target, duration, ease: "sine.inOut" });
  }, [isVisualizerOpen, ambientMuted]);

  return (
    <audio ref={audioRef} src="/audio/Ambiment.mp3" loop preload="none" hidden />
  );
}

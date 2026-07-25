"use client";

import { useCallback, type RefObject } from "react";
import gsap from "gsap";

/**
 * Shared shape behind every "animate out, then unmount" close flow in this
 * app (VisualizerStage, SettingsPanel): guard against the target not being
 * mounted, then animate it and only call `onClosed` — which actually flips
 * the state that unmounts it — once the tween finishes. An instant unmount
 * on outside-click/Escape/toggle would skip the animation entirely.
 *
 * Takes vars per-call rather than once up front so the returned closer
 * stays referentially stable across renders (deps are just `ref`/`onClosed`),
 * which matters for callers that put it in an effect's dependency array.
 */
export function useGsapClose<T extends Element>(
  ref: RefObject<T | null>,
  onClosed: () => void
) {
  return useCallback(
    (vars: gsap.TweenVars) => {
      const el = ref.current;
      if (!el) {
        onClosed();
        return;
      }
      gsap.to(el, { ...vars, onComplete: onClosed });
    },
    [ref, onClosed]
  );
}

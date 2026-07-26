"use client";

import { useCallback, useRef } from "react";

/**
 * Makes a `.range-slider` input follow the pointer from anywhere on its
 * track, instead of relying on the browser's own thumb dragging.
 *
 * WebKit (so: every browser on iOS) only starts a native range drag when the
 * press lands on the thumb itself — a 16px target — and a press anywhere
 * else on the track does nothing at all. Under a finger that reads as the
 * control being broken: you touch the bar where you want it, nothing moves,
 * and dragging from there does nothing either. Taking the drag over with
 * pointer events makes the press position *be* the value everywhere, and the
 * thumb tracks the finger for the rest of the gesture whether or not it
 * started on it.
 *
 * Pointer capture is what keeps the drag alive once the finger slides off
 * the (deliberately thin) track vertically, which on a phone it always does.
 *
 * The input keeps its own `onChange` for keyboard steps — arrow keys on a
 * focused range still fire it natively, and none of this touches that.
 */
export function useRangeDrag({
  onValue,
  onStart,
  onEnd,
}: {
  onValue: (value: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const draggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      if (input.disabled) return;
      // Right/middle clicks aren't a drag; touch and pen have no meaningful
      // `button` to check.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Suppresses the browser's own (partial) handling of the same press —
      // without it WebKit still runs its thumb drag on top of this one, and
      // the two disagree by however far the press landed from the thumb.
      // It also costs the input its automatic focus, hence the explicit
      // focus() call: the keyboard steps have to keep working.
      e.preventDefault();
      input.focus();
      input.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      // Before the first onValue, not after: the seek bar's onStart is what
      // marks the gesture as a scrub, which decides whether that value is
      // committed to playback or only painted.
      onStart?.();
      onValue(valueAt(input, e.clientX));
    },
    [onStart, onValue]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      if (!draggingRef.current) return;
      onValue(valueAt(e.currentTarget, e.clientX));
    },
    [onValue]
  );

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const input = e.currentTarget;
      if (input.hasPointerCapture(e.pointerId)) {
        input.releasePointerCapture(e.pointerId);
      }
      onEnd?.();
    },
    [onEnd]
  );

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerEnd,
    onPointerCancel: handlePointerEnd,
    // Releasing capture above fires this too — the draggingRef guard makes
    // the second call a no-op. It matters on its own for the cases nothing
    // else covers (the element being disabled or removed mid-drag).
    onLostPointerCapture: handlePointerEnd,
  };
}

// Maps a page x-coordinate to the input's value range, using the same thumb
// inset the CSS fill does (--range-thumb in globals.css): a thumb's centre
// only travels between `thumb/2` and `width - thumb/2`, so measuring from
// the raw track edges would put the value under the finger off by up to half
// a thumb width, and make the last few pixels at each end unreachable.
function valueAt(input: HTMLInputElement, clientX: number) {
  const rect = input.getBoundingClientRect();
  const thumb =
    parseFloat(getComputedStyle(input).getPropertyValue("--range-thumb")) || 0;
  const travel = Math.max(rect.width - thumb, 1);
  const ratio = Math.min(
    Math.max((clientX - rect.left - thumb / 2) / travel, 0),
    1
  );
  const min = Number(input.min) || 0;
  const max = input.max === "" ? 100 : Number(input.max);
  return min + ratio * (max - min);
}

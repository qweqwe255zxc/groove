"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const BASE_CLASSES =
  "pointer-events-none fixed left-0 top-0 z-[200] rounded-full opacity-0 mix-blend-difference transition-[width,height,background-color,border-width] duration-300 ease-out";
// Fixed white, not `bg-fg`/`border-fg` — `mix-blend-difference` only inverts
// cleanly against an arbitrary backdrop when the source itself is white
// (difference(white, X) = 255-X, a true invert). Tying it to the theme's
// foreground color broke this in light mode: --color-fg became dark there,
// and difference(dark, light-bg) washes out to a barely-visible gray instead.
const DOT_CLASSES = "h-2.5 w-2.5 border-0 bg-white";
const RING_CLASSES = "h-12 w-12 border border-white bg-transparent";

function isInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("a, button, [data-cursor-hover]")
  );
}

const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * A small dot that tracks the pointer and blooms into a hollow ring over
 * anything clickable. Mice and trackpads only — a touch device has no cursor
 * to replace, and a dot that can only ever sit wherever the last tap landed
 * is worse than none.
 *
 * Nothing renders at all when the pointer is coarse, rather than rendering a
 * transparent element the effect below then declines to move: it's the one
 * fixed, blend-mode, z-[200] element in the app, and leaving it in a phone's
 * DOM means a compositing layer over the whole viewport for something that
 * can never be seen.
 */
export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  // Starts false so the hydration render matches the server's (which has no
  // matchMedia to consult), then syncs on mount. Deferred to a microtask
  // rather than set synchronously at the top of the effect — same lint
  // constraint as everywhere else in this codebase. The `change` listener
  // covers input actually changing under a live page: a tablet gaining or
  // losing a trackpad, or a hybrid laptop switching hands.
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(FINE_POINTER_QUERY);
    const sync = () => setEnabled(mql.matches);
    Promise.resolve().then(sync);
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = dotRef.current;
    if (!el) return;

    document.documentElement.classList.add("custom-cursor-active");
    el.className = `${BASE_CLASSES} ${DOT_CLASSES}`;
    gsap.set(el, { xPercent: -50, yPercent: -50, opacity: 1 });

    const moveX = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3" });
    const moveY = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3" });

    function handleMove(e: MouseEvent) {
      moveX(e.clientX);
      moveY(e.clientY);
    }

    function handleOver(e: MouseEvent) {
      if (isInteractive(e.target)) el!.className = `${BASE_CLASSES} ${RING_CLASSES}`;
    }

    function handleOut(e: MouseEvent) {
      if (isInteractive(e.target)) el!.className = `${BASE_CLASSES} ${DOT_CLASSES}`;
    }

    window.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseover", handleOver);
    document.addEventListener("mouseout", handleOut);

    return () => {
      document.documentElement.classList.remove("custom-cursor-active");
      window.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseover", handleOver);
      document.removeEventListener("mouseout", handleOut);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div ref={dotRef} className={`${BASE_CLASSES} ${DOT_CLASSES}`} />;
}

"use client";

import { useEffect, useRef } from "react";
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

/**
 * A small dot that tracks the pointer and blooms into a hollow ring over
 * anything clickable. Only enabled for mice/trackpads — `(pointer: fine)`
 * keeps it off on touch devices, which have no cursor to replace.
 */
export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dotRef.current;
    if (!el) return;

    const isFinePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches;
    if (!isFinePointer) return;

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
  }, []);

  return <div ref={dotRef} className={`${BASE_CLASSES} ${DOT_CLASSES}`} />;
}

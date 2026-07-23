"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";
import { useBackgroundLock } from "@/hooks/useBackgroundLock";

/**
 * Wraps the page content (not the header/menu/visualizer, which are fixed
 * overlays outside this) so it visibly reacts when the nav opens instead of
 * just sitting there frozen behind it.
 */
export default function ContentDimmer({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isMenuOpen = useAppStore((s) => s.isMenuOpen);
  const locked = useBackgroundLock();

  useEffect(() => {
    gsap.to(ref.current, {
      scale: isMenuOpen ? 0.96 : 1,
      opacity: isMenuOpen ? 0.5 : 1,
      duration: 0.8,
      ease: "expo.inOut",
    });
  }, [isMenuOpen]);

  // Whenever a fullscreen overlay is covering this content, it's still
  // sitting right there in the DOM underneath — nothing about z-index stops
  // Tab or a screen reader from reaching it. `inert` closes that off (and
  // drops it from the accessibility tree) without touching the animation
  // above.
  useEffect(() => {
    if (ref.current) ref.current.inert = locked;
  }, [locked]);

  return (
    <div ref={ref} style={{ transformOrigin: "50% 0%" }}>
      {children}
    </div>
  );
}

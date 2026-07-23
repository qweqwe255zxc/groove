"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { setLenisInstance } from "@/lib/lenis";
import { useBackgroundLock } from "@/hooks/useBackgroundLock";

export default function SmoothScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const lenisRef = useRef<Lenis | null>(null);
  const locked = useBackgroundLock();

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
    });
    lenisRef.current = lenis;
    setLenisInstance(lenis);

    let frame: number;
    function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    }
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      setLenisInstance(null);
      lenis.destroy();
    };
  }, []);

  // Freeze background scroll while the intro, the menu, the vinyl detail
  // panel, or the fullscreen visualizer is open. Lenis's own stop() only
  // intercepts wheel/touch — it has no keydown listener at all — so Space,
  // PageDown, and the arrow keys silently scrolled the hidden page behind
  // a "locked" overlay until this html-level overflow:hidden was added too.
  useEffect(() => {
    if (locked) {
      lenisRef.current?.stop();
      document.documentElement.style.overflow = "hidden";
    } else {
      lenisRef.current?.start();
      document.documentElement.style.overflow = "";
    }
  }, [locked]);

  return <>{children}</>;
}

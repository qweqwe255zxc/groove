"use client";

import { useEffect, useState } from "react";

export type SystemTheme = "light" | "dark";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

function readSystemTheme(): SystemTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

// VisualizerStage (this hook's only caller) renders unconditionally in
// layout.tsx even while the overlay itself is closed (see the audio-element
// gotcha in CLAUDE.md) — so this runs during SSR too, where `window` doesn't
// exist. Default to "dark" there; the client re-render right after hydration
// picks up the real value; nothing paints from the SSR guess since the
// visualizer canvas itself only exists once `isVisualizerOpen` is true, well
// after that point.
export function useSystemTheme(): SystemTheme {
  const [theme, setTheme] = useState<SystemTheme>(readSystemTheme);

  useEffect(() => {
    const mql = window.matchMedia(LIGHT_QUERY);
    const handleChange = (e: MediaQueryListEvent) =>
      setTheme(e.matches ? "light" : "dark");
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return theme;
}

"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";

const LABEL: Record<"light" | "dark", string> = { light: "Light", dark: "Dark" };

// Labeled with the currently active theme, same convention as the
// Orb/Terrain mode button next to it in VisualizerStage (which shows the
// active mode, not what clicking switches to) — click flips to the other.
export default function ThemeToggle({
  variant = "pill",
  className = "",
}: {
  variant?: "pill" | "header";
  className?: string;
}) {
  const resolvedTheme = useResolvedTheme();
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  // useSystemTheme's SSR render always guesses "dark" (see its own comment —
  // there's no prefers-color-scheme to read on the server). That guess never
  // used to reach the DOM before ThemeToggle existed, since the only other
  // consumer (VisualizerStage's canvas) is itself conditionally rendered on
  // client-only state. This one sits in always-rendered markup (SiteHeader),
  // so a real OS light-mode visitor got a server-rendered "Dark" label
  // hydrating into "Light" — a mismatch. Same fix as LiveClock in this same
  // directory: render nothing until after mount, deferred to a microtask
  // rather than a synchronous setState at the top of the effect.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => setMounted(true));
  }, []);

  if (!mounted) return null;

  // "header": no color class at all — SiteHeader sets text-white plus
  // mix-blend-difference on the whole <header>, which only inverts cleanly
  // against whatever's underneath when the source color is pure white (see
  // the comment in SiteHeader.tsx). Overriding that inherited white with
  // text-fg/text-muted here would blend-difference into a muddy color
  // instead, same trap GrooveMark's "cutout" variant exists to avoid.
  const base =
    variant === "pill"
      ? "rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
      : "text-xs uppercase tracking-[0.2em] cursor-pointer";

  return (
    <button
      type="button"
      onClick={() =>
        setThemePreference(resolvedTheme === "light" ? "dark" : "light")
      }
      aria-label={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} theme`}
      className={`${base} ${className}`.trim()}
    >
      {LABEL[resolvedTheme]}
    </button>
  );
}

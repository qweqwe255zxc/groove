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
  variant?: "pill" | "menu";
  className?: string;
}) {
  const resolvedTheme = useResolvedTheme();
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  // useSystemTheme's SSR render always guesses "dark" (see its own comment —
  // there's no prefers-color-scheme to read on the server). That guess never
  // used to reach the DOM before ThemeToggle existed, since the only other
  // consumer (VisualizerStage's canvas) is itself conditionally rendered on
  // client-only state. This one sits in always-rendered markup (OverlayMenu),
  // so a real OS light-mode visitor got a server-rendered "Dark" label
  // hydrating into "Light" — a mismatch. Same fix as LiveClock in this same
  // directory: render nothing until after mount, deferred to a microtask
  // rather than a synchronous setState at the top of the effect.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => setMounted(true));
  }, []);

  if (!mounted) return null;

  // "menu": a smaller pill than the default — same bordered-chip language as
  // the rest of the site's buttons (SettingsPanel, the Orb/Terrain switch),
  // just scaled to sit inline in OverlayMenu's footer row without
  // overpowering the plain tagline/clock text next to it. Plain uppercase
  // text with no border read as inert here — indistinguishable from
  // LiveClock, which isn't interactive at all.
  const base =
    variant === "pill"
      ? "rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
      : "rounded-full border border-line px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg hover:text-accent cursor-pointer";

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

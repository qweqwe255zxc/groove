"use client";

import { useAppStore } from "@/store/useAppStore";

// Mutes/unmutes AmbientBackground's looping bed — labeled with the currently
// active state (same convention as ThemeToggle and the Orb/Terrain button:
// show what's on now, click flips it), so no separate icon-vs-label parsing
// is needed to tell whether clicking turns it on or off.
export default function AmbientToggle({
  variant = "pill",
  className = "",
}: {
  variant?: "pill" | "menu";
  className?: string;
}) {
  const ambientMuted = useAppStore((s) => s.ambientMuted);
  const toggleAmbientMuted = useAppStore((s) => s.toggleAmbientMuted);

  const base =
    variant === "pill"
      ? "rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
      : "rounded-full border border-line px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg hover:text-accent cursor-pointer";

  return (
    <button
      type="button"
      onClick={toggleAmbientMuted}
      aria-pressed={ambientMuted}
      aria-label={ambientMuted ? "Unmute ambient sound" : "Mute ambient sound"}
      className={`${base} ${className}`.trim()}
    >
      Ambient: {ambientMuted ? "Off" : "On"}
    </button>
  );
}

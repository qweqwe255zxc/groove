"use client";

import { useAppStore } from "@/store/useAppStore";

// Mutes/unmutes BackgroundMusic's looping bed — labeled with the currently
// active state (same convention as ThemeToggle and the Orb/Terrain button:
// show what's on now, click flips it), so no separate icon-vs-label parsing
// is needed to tell whether clicking turns it on or off.
export default function MusicToggle({
  variant = "pill",
  className = "",
}: {
  variant?: "pill" | "menu";
  className?: string;
}) {
  const musicMuted = useAppStore((s) => s.musicMuted);
  const toggleMusicMuted = useAppStore((s) => s.toggleMusicMuted);

  const base =
    variant === "pill"
      ? "rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
      : "rounded-full border border-line px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg hover:text-accent cursor-pointer";

  return (
    <button
      type="button"
      onClick={toggleMusicMuted}
      aria-pressed={musicMuted}
      aria-label={musicMuted ? "Unmute background music" : "Mute background music"}
      className={`${base} ${className}`.trim()}
    >
      Music: {musicMuted ? "Off" : "On"}
    </button>
  );
}

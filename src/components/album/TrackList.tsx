"use client";

import { useEffect, useRef } from "react";
import type { Track } from "@/lib/itunes";
import { formatTrackDuration } from "@/lib/tracks";
import { PauseGlyph, PlayGlyph } from "@/components/icons/transport";

/**
 * The album's tracks as a selectable list, shared by VinylPanel (choosing
 * what to start before entering the visualizer) and TrackListPanel (the
 * visualizer's own dropdown). One component so the two can't drift apart in
 * numbering, disabled-state or active-row treatment; only the chrome around
 * them differs.
 *
 * Tracks iTunes returned without a `previewUrl` are rendered disabled rather
 * than filtered out, so the numbers down the left match the real album
 * instead of silently renumbering around the gaps.
 */
export default function TrackList({
  tracks,
  activeTrackId,
  isPlaying,
  onSelect,
  className = "",
}: {
  tracks: Track[];
  activeTrackId: number | null;
  // Only affects the marker on the active row — a caret while it's playing,
  // pause bars while it isn't. This list never plays anything itself.
  isPlaying: boolean;
  onSelect: (track: Track) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  // Scrolls the active row into view when it changes from outside this list
  // — the transport buttons, or auto-advance at the end of a track. Without
  // it, an album long enough to scroll leaves the highlight somewhere off
  // past the fold while the list still shows track 1. `block: "nearest"` so
  // a row already visible doesn't cause a jump.
  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [activeTrackId]);

  return (
    <ol
      ref={listRef}
      /* Lenis calls preventDefault() on every wheel and touchmove event
         while it's stopped — and it's stopped exactly when this list is on
         screen, since both places it appears (VinylPanel, the visualizer)
         lock background scrolling. That kills native scrolling inside
         nested containers too, so the list simply didn't move. This
         attribute is Lenis's own escape hatch: a gesture whose composed
         path contains it is handed straight back to the browser. */
      data-lenis-prevent
      /* overscroll-contain so flicking past the end of the list doesn't
         hand the rest of the gesture to whatever is behind it. */
      className={`overflow-y-auto overscroll-contain ${className}`.trim()}
    >
      {tracks.map((track) => {
        const isActive = track.trackId === activeTrackId;
        const playable = Boolean(track.previewUrl);
        return (
          <li key={track.trackId}>
            <button
              type="button"
              onClick={() => onSelect(track)}
              disabled={!playable}
              data-active={isActive}
              aria-current={isActive ? "true" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                playable
                  ? "cursor-pointer hover:bg-fg/5"
                  : "cursor-not-allowed opacity-40"
              } ${isActive ? "bg-fg/10" : ""}`}
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">
                {track.trackNumber}
              </span>
              {/* Fixed-width marker column: an indicator that only exists on
                  the active row would otherwise shift that row's title a few
                  pixels out of line with every other one. */}
              <span
                aria-hidden
                className={`flex w-3 shrink-0 justify-center ${
                  isActive ? "text-accent" : "text-transparent"
                }`}
              >
                {isActive && !isPlaying ? (
                  <PauseGlyph className="h-2 w-2" />
                ) : (
                  <PlayGlyph className="h-2 w-2" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {track.trackName}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {playable ? formatTrackDuration(track.durationMs) : "—"}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

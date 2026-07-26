"use client";

import { useEffect, useRef } from "react";
import type { Track } from "@/lib/itunes";
import { formatTrackDuration } from "@/lib/tracks";
import { PauseGlyph, PlayGlyph } from "@/components/icons/transport";

// A row's height is pinned here rather than left to its content, and the
// class is shared with the skeleton below, because VinylPanel reserves the
// list's space from the album's trackCount *before* the tracks themselves
// arrive — a placeholder row a pixel off the real one reserves the wrong
// height and the layout still jumps when the real list lands. h-9 is what
// the content came out to anyway (text-sm's 20px line box + py-2).
const ROW_BASE =
  "flex h-9 w-full items-center gap-3 rounded-lg px-2 py-2 text-left";

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
              className={`${ROW_BASE} transition-colors ${
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

// Varied per row so the placeholder reads as a list of titles rather than a
// stack of identical bars. Indexed, not random — a random width would be a
// different value on every re-render (and differ between server and client).
const BAR_WIDTHS = ["72%", "54%", "83%", "61%", "76%", "48%"];

/**
 * Stands in for the list while the track fetch is in flight, at the exact
 * height the real one will take (same row class, same wrapper classes, row
 * count from the album's own `trackCount`) — see VinylPanel for why the
 * height has to be right before the tracks land.
 */
export function TrackListSkeleton({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  return (
    <ol
      aria-hidden
      /* overflow-hidden rather than the real list's overflow-y-auto: the
         caller's max-h still caps it identically, but there's nothing here
         worth scrolling to. */
      className={`animate-pulse overflow-hidden ${className}`.trim()}
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={ROW_BASE}>
          <span className="h-2 w-5 shrink-0 rounded-full bg-fg/10" />
          {/* Matches the real row's fixed-width marker column. */}
          <span className="w-3 shrink-0" />
          <span
            className="h-2 flex-1 rounded-full bg-fg/10"
            style={{ maxWidth: BAR_WIDTHS[i % BAR_WIDTHS.length] }}
          />
          <span className="h-2 w-6 shrink-0 rounded-full bg-fg/10" />
        </li>
      ))}
    </ol>
  );
}

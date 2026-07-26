"use client";

import { useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useDropdown } from "@/hooks/useDropdown";
import TrackList from "@/components/album/TrackList";
import { PILL_BUTTON } from "./controlStyles";

/**
 * The loaded album's tracklist as a dropdown in the visualizer's bottom row,
 * next to Settings and built the same way (see useDropdown). The transport
 * buttons walk the album one step at a time; this is for jumping straight to
 * a track ten down the list without stepping through the nine in between.
 *
 * Renders nothing for a single-track album or a local upload — there'd be
 * nothing to choose, and the pill would just be taking room from a row that
 * has none to spare below `sm`.
 */
export default function TrackListPanel({
  className = "",
}: {
  // Set by the caller so this can be a half-width column of the phone
  // layout's bottom row and its natural width from md: up.
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { open, close, toggle } = useDropdown(containerRef, panelRef);
  const tracks = useAppStore((s) => s.tracks);
  const activeTrack = useAppStore((s) => s.activeTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playTrack = useAppStore((s) => s.playTrack);

  if (tracks.length < 2) return null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {open && (
        <div
          ref={panelRef}
          /* Always hung off the top of its own button (`bottom-full`), so
             the gap above it stays right however tall the row below ends up
             — the previous version pinned it to a hardcoded `bottom-32`
             that had to be re-tuned by hand every time that row changed.

             What does change with the breakpoint is the width: below md the
             button is only half the row, and a panel that wide can't hold a
             tracklist. Spanning the whole inset instead works out to
             exactly `100vw` minus twice the stage's own inset, measured
             from this button's left edge — it's the left column, so its
             left edge *is* the row's. */
          className="absolute bottom-full left-0 mb-3 w-[calc(100vw-2rem)] origin-bottom rounded-2xl border border-line bg-surface/90 p-3 backdrop-blur-sm sm:w-[calc(100vw-5rem)] md:left-auto md:right-0 md:w-[min(20rem,calc(100vw-2rem))] md:origin-bottom-right"
        >
          <div className="mb-2 flex items-center justify-between px-2 text-xs uppercase tracking-[0.2em] text-muted">
            <span>Tracks</span>
            <span className="tabular-nums">{tracks.length}</span>
          </div>
          <TrackList
            tracks={tracks}
            activeTrackId={activeTrack?.trackId ?? null}
            isPlaying={isPlaying}
            onSelect={(track) => {
              playTrack(track);
              close();
            }}
            /* Capped in vh rather than rows: on a short landscape phone a
               fixed row count would run the list off the top of the screen,
               and the panel grows upward from a button pinned to the bottom
               edge. */
            className="max-h-[45vh]"
          />
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        className={`${PILL_BUTTON} w-full py-3 md:w-auto md:py-2`}
        aria-expanded={open}
      >
        Tracks
      </button>
    </div>
  );
}

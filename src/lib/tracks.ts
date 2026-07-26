import type { Track } from "./itunes";

/**
 * The next (`direction: 1`) or previous (`-1`) track that can actually be
 * played, skipping over any iTunes returned without a `previewUrl`. Those
 * still appear in the tracklist — greyed out, so the numbering matches the
 * real album — but stepping through with the transport buttons has to pass
 * straight over them rather than land on something with nothing to play.
 *
 * Deliberately doesn't wrap around: reaching the end of an album is the end
 * of it, not the start again.
 */
export function findAdjacentPlayable(
  tracks: Track[],
  active: Track | null,
  direction: 1 | -1
): Track | null {
  if (!active) return null;
  const from = tracks.findIndex((t) => t.trackId === active.trackId);
  if (from === -1) return null;
  for (let i = from + direction; i >= 0 && i < tracks.length; i += direction) {
    if (tracks[i].previewUrl) return tracks[i];
  }
  return null;
}

/**
 * m:ss for a tracklist row — the track's own length as iTunes reports it,
 * not the ~30s preview's. No leading zero on the minutes, unlike the
 * visualizer's time readout: that one is a live counter where a fixed width
 * stops the row jittering, this is static text in a list.
 */
export function formatTrackDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "--:--";
  const total = Math.round(durationMs / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

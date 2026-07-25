"use client";

import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";

// Shared by both branches below (local file vs. a real iTunes album) so the
// block can't drift out of alignment between them. top-28 rather than
// top-24: below 420px the overlay's control row wraps to two rows of pills
// (see VisualizerStage), and the old offset sat under only the first of
// them. `right-4` caps the width — max-w-xs alone is wider than a 320px
// viewport.
const META_POSITION =
  "pointer-events-none absolute left-4 right-4 top-28 flex max-w-xs flex-col gap-4 text-fg sm:left-10 sm:right-auto sm:top-28";

export default function TrackMeta() {
  const activeTrack = useAppStore((s) => s.activeTrack);
  const selectedAlbum = useAppStore((s) => s.selectedAlbum);

  if (!selectedAlbum && !activeTrack) return null;

  // A track loaded via playLocalTrack() has no selectedAlbum to describe it
  // — nothing here comes from iTunes, just the filename.
  if (!selectedAlbum) {
    return (
      <div className={META_POSITION}>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-muted">
            Now playing
          </p>
          <p className="font-display text-2xl italic leading-tight">
            {activeTrack?.trackName}
          </p>
        </div>
        <p className="border-t border-line pt-3 text-xs uppercase tracking-[0.2em] text-muted">
          Local file
        </p>
      </div>
    );
  }

  return (
    <div className={META_POSITION}>
      {selectedAlbum.artworkUrl && (
        <Image
          src={selectedAlbum.artworkUrl}
          alt={selectedAlbum.collectionName}
          width={64}
          height={64}
          className="rounded-md border border-line object-cover"
        />
      )}

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.25em] text-muted">
          Now playing
        </p>
        <p className="font-display text-2xl italic leading-tight">
          {activeTrack?.trackName ?? selectedAlbum.collectionName}
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-3 text-xs">
        <dt className="uppercase tracking-[0.2em] text-muted">Artist</dt>
        <dd>{selectedAlbum.artistName}</dd>
        <dt className="uppercase tracking-[0.2em] text-muted">Album</dt>
        <dd>{selectedAlbum.collectionName}</dd>
        <dt className="uppercase tracking-[0.2em] text-muted">Year</dt>
        <dd>{selectedAlbum.year}</dd>
        <dt className="uppercase tracking-[0.2em] text-muted">Genre</dt>
        <dd>{selectedAlbum.genre}</dd>
      </dl>
    </div>
  );
}

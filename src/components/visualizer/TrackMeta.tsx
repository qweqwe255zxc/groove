"use client";

import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";

export default function TrackMeta() {
  const activeTrack = useAppStore((s) => s.activeTrack);
  const selectedAlbum = useAppStore((s) => s.selectedAlbum);

  if (!selectedAlbum) return null;

  return (
    <div className="pointer-events-none absolute left-6 top-24 flex max-w-xs flex-col gap-4 text-fg sm:left-10 sm:top-28">
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

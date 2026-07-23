"use client";

import { useRef } from "react";
import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";
import { Flip } from "@/lib/flip";
import type { Album } from "@/lib/itunes";

export default function AlbumCard({ album }: { album: Album }) {
  const coverRef = useRef<HTMLDivElement>(null);
  const selectedAlbumId = useAppStore((s) => s.selectedAlbum?.collectionId);
  const selectAlbum = useAppStore((s) => s.selectAlbum);
  const setPendingFlipState = useAppStore((s) => s.setPendingFlipState);

  const isSelected = selectedAlbumId === album.collectionId;

  function handleClick() {
    if (!coverRef.current) return;
    // VinylPanel finishes the Flip.from() once its own element (sharing this
    // same data-flip-id) has mounted in its final layout.
    const state = Flip.getState(coverRef.current, { props: "borderRadius" });
    setPendingFlipState(state);
    selectAlbum(album);
  }

  return (
    <button type="button" onClick={handleClick} className="group cursor-pointer text-left">
      <div
        ref={coverRef}
        data-flip-id={`album-cover-${album.collectionId}`}
        className={`relative aspect-square overflow-hidden rounded-lg border border-line bg-surface ${
          isSelected ? "opacity-0" : "opacity-100"
        }`}
      >
        {album.artworkUrl ? (
          <Image
            src={album.artworkUrl}
            alt={album.collectionName}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            No artwork
          </div>
        )}
      </div>

      <p className="mt-3 truncate text-sm text-fg">{album.collectionName}</p>
      <p className="truncate text-xs text-muted">{album.artistName}</p>
    </button>
  );
}

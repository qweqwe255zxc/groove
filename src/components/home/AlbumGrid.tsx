"use client";

import { useAlbumSearch } from "@/hooks/useAlbumSearch";
import { useAppStore } from "@/store/useAppStore";
import AlbumCard from "./AlbumCard";

export default function AlbumGrid() {
  useAlbumSearch();

  const query = useAppStore((s) => s.query);
  const albums = useAppStore((s) => s.albums);
  const status = useAppStore((s) => s.status);
  const isSearching = query.trim().length > 0;

  // Only replaces the grid with a blocking error when there's nothing else to
  // show — a failed search shouldn't wipe out an already-loaded (if now
  // stale) list of albums that's still perfectly valid to look at.
  if (status === "error" && albums.length === 0) {
    return <p className="py-16 text-sm text-muted">Couldn&apos;t load albums — try again.</p>;
  }

  if (status === "loading" && albums.length === 0) {
    return (
      <p className="py-16 text-sm text-muted">
        {isSearching ? "Searching…" : "Loading featured albums…"}
      </p>
    );
  }

  if (albums.length === 0) {
    return (
      <p className="py-16 text-sm text-muted">
        {isSearching
          ? <>No albums found for &ldquo;{query}&rdquo;.</>
          : "No featured albums available right now."}
      </p>
    );
  }

  return (
    <div className="py-10">
      <p className="mb-6 text-xs uppercase tracking-[0.25em] text-muted">
        {status === "error"
          ? "Couldn't refresh — showing the last results."
          : isSearching
            ? `Results for "${query}"`
            : "Featured"}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {albums.map((album) => (
          <AlbumCard key={album.collectionId} album={album} />
        ))}
      </div>
    </div>
  );
}

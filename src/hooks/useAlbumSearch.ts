import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { Album } from "@/lib/itunes";

/**
 * Keeps the library grid populated: a debounced search against /api/albums
 * while there's a query, and a one-time fetch of a curated "featured" set
 * (cached in a ref) whenever the box is empty — so the catalog never opens
 * to a blank page, and clearing the search restores it instantly.
 */
export function useAlbumSearch() {
  const query = useAppStore((s) => s.query);
  const setAlbums = useAppStore((s) => s.setAlbums);
  const setStatus = useAppStore((s) => s.setStatus);
  const featuredRef = useRef<Album[] | null>(null);

  useEffect(() => {
    const term = query.trim();

    if (!term) {
      if (featuredRef.current) {
        setAlbums(featuredRef.current);
        setStatus("idle");
        return;
      }

      let cancelled = false;
      setStatus("loading");
      fetch("/api/albums/featured")
        .then((res) => {
          // The route still resolves with 200 JSON on a normal empty
          // result, but falls back to a 502 + { albums: [] } when the
          // upstream iTunes call itself fails — reading `.json()` without
          // checking `res.ok` would treat that failure as a legitimate
          // zero-results response instead of surfacing the error state.
          if (!res.ok) throw new Error(`Featured albums request failed: ${res.status}`);
          return res.json();
        })
        .then((data: { albums?: Album[] }) => {
          const albums = data.albums ?? [];
          featuredRef.current = albums;
          if (!cancelled) {
            setAlbums(albums);
            setStatus("idle");
          }
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });

      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    setStatus("loading");

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/albums?term=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error(`Album search failed: ${res.status}`);
        const data = (await res.json()) as { albums?: Album[] };
        if (cancelled) return;
        setAlbums(data.albums ?? []);
        setStatus("idle");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, setAlbums, setStatus]);
}

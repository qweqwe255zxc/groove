"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { Album, Track } from "@/lib/itunes";

// Bridges a server-fetched album/track pair into the client store. Mounted
// by src/app/v/[collectionId]/[trackId]/page.tsx, which can't touch the
// store itself (it's a Server Component) — VinylPanel and VisualizerStage
// live in layout.tsx and react to the store globally, so this component
// renders nothing of its own; setting state here is enough for them to pick
// it up and open.
export default function DeepLinkVisualizer({
  album,
  tracks,
  track,
}: {
  album: Album;
  tracks: Track[];
  track: Track;
}) {
  const selectAlbum = useAppStore((s) => s.selectAlbum);
  const setTracks = useAppStore((s) => s.setTracks);
  const openTrack = useAppStore((s) => s.openTrack);

  useEffect(() => {
    selectAlbum(album);
    setTracks(tracks);
    openTrack(track);
    // Intentionally empty deps — this is a one-time "open on arrival" for
    // this static server-rendered page, not something that should re-fire
    // if the store's own action references happen to change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

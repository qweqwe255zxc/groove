import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAlbumWithTracks } from "@/lib/itunes";
import DeepLinkVisualizer from "@/components/album/DeepLinkVisualizer";

type Params = { collectionId: string; trackId: string };

// Falls back to the first track with a preview if the given trackId isn't
// in this album (stale/mistyped link) rather than 404ing outright — the
// album itself is still a valid destination.
async function resolve(params: Promise<Params>) {
  const { collectionId, trackId } = await params;
  const id = Number(collectionId);
  if (!Number.isFinite(id)) return null;

  const { album, tracks } = await getAlbumWithTracks(id);
  if (!album) return null;

  const wantedId = Number(trackId);
  const track =
    tracks.find((t) => t.trackId === wantedId && t.previewUrl) ??
    tracks.find((t) => t.previewUrl);
  if (!track) return null;

  return { album, tracks, track };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};

  const { album, track } = resolved;
  const title = `${track.trackName} — ${album.collectionName} · Groove`;
  const description = `${album.artistName} — watch "${track.trackName}" react in real time.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: album.artworkUrl ? [album.artworkUrl] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: album.artworkUrl ? [album.artworkUrl] : [],
    },
  };
}

export default async function VisualizerDeepLink({
  params,
}: {
  params: Promise<Params>;
}) {
  const resolved = await resolve(params);
  if (!resolved) notFound();

  const { album, tracks, track } = resolved;
  return <DeepLinkVisualizer album={album} tracks={tracks} track={track} />;
}

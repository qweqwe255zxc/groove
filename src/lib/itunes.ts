const ITUNES_BASE = "https://itunes.apple.com";

export type Album = {
  collectionId: number;
  artistName: string;
  collectionName: string;
  artworkUrl: string;
  genre: string;
  year: string;
  trackCount: number;
};

export type Track = {
  trackId: number;
  trackName: string;
  trackNumber: number;
  previewUrl: string | null;
  durationMs: number;
};

type RawAlbum = {
  collectionId: number;
  artistName: string;
  collectionName: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  trackCount?: number;
  collectionType?: string;
};

type RawTrack = {
  wrapperType: string;
  trackId: number;
  trackName: string;
  trackNumber: number;
  previewUrl?: string;
  trackTimeMillis?: number;
};

// iTunes artwork URLs are served at 100x100 by default; the path segment
// can be swapped for a larger size without a second round trip.
function upscaleArtwork(url: string | undefined, size = 600): string {
  if (!url) return "";
  return url.replace(/\d+x\d+bb\.(jpg|png)$/, `${size}x${size}bb.$1`);
}

// `new Date(malformed).getUTCFullYear()` returns NaN, not undefined —
// without the isNaN check a malformed releaseDate would render the literal
// string "NaN" instead of falling back to "—" like a missing date already
// does. Uses the UTC getter, not the local-timezone one — iTunes returns UTC
// timestamps, and near a year boundary (e.g. `1997-01-01T02:00:00Z`) the
// local getter can roll the date back a day in timezones west of UTC,
// reporting the wrong year.
function releaseYear(releaseDate: string | undefined): string {
  if (!releaseDate) return "—";
  const year = new Date(releaseDate).getUTCFullYear();
  return Number.isNaN(year) ? "—" : String(year);
}

function toAlbum(raw: RawAlbum): Album | null {
  if (!raw.collectionId || !raw.collectionName) return null;
  return {
    collectionId: raw.collectionId,
    artistName: raw.artistName,
    collectionName: raw.collectionName,
    artworkUrl: upscaleArtwork(raw.artworkUrl100),
    genre: raw.primaryGenreName ?? "Unknown genre",
    year: releaseYear(raw.releaseDate),
    trackCount: raw.trackCount ?? 0,
  };
}

export async function searchAlbums(term: string, limit = 24): Promise<Album[]> {
  const url = `${ITUNES_BASE}/search?${new URLSearchParams({
    term,
    entity: "album",
    limit: String(limit),
  })}`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
  const data = (await res.json()) as { results: RawAlbum[] };

  return data.results
    .filter((r) => r.collectionType !== "Compilation")
    .map(toAlbum)
    .filter((a): a is Album => a !== null);
}

// iTunes' free search API has no "trending" or "popular" endpoint, so the
// library's default view (before anyone types a search) is seeded from this
// curated, genre-spread list instead of shipping an empty page.
const FEATURED_ARTISTS = [
  "Radiohead",
  "Kendrick Lamar",
  "Daft Punk",
  "Fleetwood Mac",
  "Tame Impala",
  "Fiona Apple",
];

export async function getFeaturedAlbums(): Promise<Album[]> {
  const groups = await Promise.all(
    FEATURED_ARTISTS.map((artist) => searchAlbums(artist, 4).catch(() => []))
  );

  const seen = new Set<number>();
  const albums: Album[] = [];
  for (const group of groups) {
    for (const album of group) {
      if (seen.has(album.collectionId)) continue;
      seen.add(album.collectionId);
      albums.push(album);
    }
  }
  return albums;
}

export async function getAlbumTracks(collectionId: number): Promise<Track[]> {
  const { tracks } = await lookupAlbum(collectionId);
  return tracks;
}

// `/lookup?id=<collectionId>&entity=song` returns the album itself
// (`wrapperType: "collection"`) as the first result *and* every track in
// the same call — getAlbumTracks only needed the tracks, but the deep-link
// visualizer route (src/app/v/[collectionId]/[trackId]) needs the album
// too, to open straight into the visualizer without a search step. One
// shared lookup instead of two separate endpoints for what's already a
// single API response.
async function lookupAlbum(
  collectionId: number
): Promise<{ album: Album | null; tracks: Track[] }> {
  const url = `${ITUNES_BASE}/lookup?${new URLSearchParams({
    id: String(collectionId),
    entity: "song",
  })}`;

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`iTunes lookup failed: ${res.status}`);
  const data = (await res.json()) as { results: (RawAlbum & RawTrack)[] };

  const collection = data.results.find((r) => r.wrapperType === "collection");
  const tracks = data.results
    .filter((r) => r.wrapperType === "track")
    .map((r) => ({
      trackId: r.trackId,
      trackName: r.trackName,
      trackNumber: r.trackNumber,
      previewUrl: r.previewUrl ?? null,
      durationMs: r.trackTimeMillis ?? 0,
    }))
    .sort((a, b) => a.trackNumber - b.trackNumber);

  return { album: collection ? toAlbum(collection) : null, tracks };
}

export async function getAlbumWithTracks(
  collectionId: number
): Promise<{ album: Album | null; tracks: Track[] }> {
  return lookupAlbum(collectionId);
}

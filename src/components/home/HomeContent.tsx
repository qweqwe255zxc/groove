import SearchBar from "./SearchBar";
import AlbumGrid from "./AlbumGrid";
import UploadTrackButton from "./UploadTrackButton";
import HashLink from "@/components/layout/HashLink";

// Shared between "/" and the deep-link route (/v/[collectionId]/[trackId]) —
// the deep link needs this rendered underneath DeepLinkVisualizer's overlays,
// not just on the real homepage, or closing back out of a shared link has
// nothing behind it to reveal (see the comment on DeepLinkVisualizer).
export default function HomeContent() {
  return (
    <main>
      <section
        id="top"
        className="flex min-h-screen flex-col justify-center px-6 pt-24 sm:px-10"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-muted">
          Audio-reactive album visualizer
        </p>
        <h1 className="mt-4 max-w-4xl font-display text-[13vw] italic leading-[0.95] sm:text-[7vw]">
          Sound, visualized.
        </h1>
        <p className="mt-6 max-w-md text-muted">
          Search any artist or album, play a 30-second preview, and watch a
          fullscreen scene respond to its frequencies in real time.
        </p>
        <HashLink
          href="#library"
          className="mt-10 w-fit text-xs uppercase tracking-[0.2em] text-fg underline decoration-line underline-offset-4 hover:decoration-fg"
        >
          Browse the catalog ↓
        </HashLink>
      </section>

      <section id="library" className="min-h-screen px-6 py-24 sm:px-10">
        <SearchBar />
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <UploadTrackButton />
          <p className="text-xs text-muted">
            Or visualize an audio file from your own device.
          </p>
        </div>
        <AlbumGrid />
      </section>

      <section
        id="about"
        className="flex min-h-[60vh] flex-col justify-center border-t border-line px-6 py-24 sm:px-10"
      >
        <h2 className="max-w-xl font-display text-4xl italic sm:text-5xl">
          About
        </h2>
        <p className="mt-6 max-w-md text-muted">
          Album art and previews come from the iTunes Search API. Frequency
          data comes from the Web Audio API and drives a Three.js scene in
          real time — nothing here is pre-rendered.
        </p>
      </section>
    </main>
  );
}

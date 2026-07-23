import SearchBar from "@/components/home/SearchBar";
import AlbumGrid from "@/components/home/AlbumGrid";
import HashLink from "@/components/layout/HashLink";

export default function Home() {
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
          Spin the record, watch the mix.
        </h1>
        <p className="mt-6 max-w-md text-muted">
          Search any artist or album from the iTunes catalog, drop the needle
          on a 30-second preview, and watch a fullscreen scene react to its
          frequencies in real time.
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
          Album art and 30-second previews come straight from the iTunes
          Search API. Frequency data is read live from the Web Audio API and
          pushed into a Three.js scene — nothing here is pre-rendered.
        </p>
      </section>
    </main>
  );
}

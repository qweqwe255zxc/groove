# Groove — audio-reactive album visualizer

### [🔗 Live demo — groove-vizualizer.vercel.app](https://groove-vizualizer.vercel.app/)

Search iTunes for an album, expand its cover into a spinning vinyl, hit play,
and a fullscreen Three.js scene reacts to the track's frequencies in real
time.

Built with Next.js 16 (App Router, TypeScript), Tailwind v4,
[react-three-fiber](https://github.com/pmndrs/react-three-fiber) / three.js,
GSAP, Lenis, and Zustand.

## How it works

1. `SearchBar`/`AlbumGrid` query `/api/albums`, which calls the iTunes Search
   API server-side (iTunes' response has no CORS headers, so it can't be
   fetched from the browser) and normalizes the results.
2. Clicking an album cover morphs it (via GSAP Flip) into `VinylPanel`, a
   spinning-vinyl detail view that fetches the album's tracks from
   `/api/albums/[collectionId]/tracks`.
3. Hitting Play opens `VisualizerStage`: a Web Audio `AnalyserNode` reads the
   `<audio>` element's frequency data every frame, and an r3f `<Canvas>`
   scene (`OrbScene` or `TerrainScene`) displaces a point cloud in response —
   bass drives distortion/scale, treble drives color.
4. Visitors can also drop in their own audio file instead of an iTunes
   preview, via the upload control in `VisualizerStage`.

For the non-obvious constraints behind these choices — why the audio element
never unmounts, why frequency data is read from refs instead of React state,
why `Flip.from()` needs an explicit `targets`, and so on — see
[`CLAUDE.md`](./CLAUDE.md).

## Project structure

- `src/lib/itunes.ts` — iTunes fetch + normalization (server-side only)
- `src/store/useAppStore.ts` — global Zustand store (search, playback,
  visualizer mode/sensitivity/color scheme)
- `src/hooks/` — `useAudioAnalyser` (Web Audio wiring), `useAlbumSearch`,
  `useGsapClose` (shared "animate out, then unmount" pattern), theme/system
  hooks
- `src/components/layout/` — smooth scroll, header, fullscreen nav, page
  dimmer, custom cursor
- `src/components/home/` — search bar and album grid
- `src/components/album/` — `VinylPanel`, the cover-to-vinyl detail view
- `src/components/visualizer/` — `VisualizerStage` (canvas host + controls),
  `scenes/` (`OrbScene`, `TerrainScene`), settings and track-meta UI

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No API keys or
environment variables are required — the iTunes Search API is public and
keyless, and all requests to it are proxied through this app's own API
routes.

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint

## Deployment

Deployed on [Vercel](https://vercel.com/new). No secrets to configure —
just `npm run build` and serve.

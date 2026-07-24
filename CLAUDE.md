@AGENTS.md

# Groove — audio-reactive album visualizer

Next.js 16 (App Router, TS) + Tailwind v4. Search iTunes for an album, expand its
cover into a spinning vinyl, hit play, and a fullscreen Three.js scene reacts to
the track's frequencies in real time.

## Commands

- `npm run dev` — dev server
- `npm run build` / `npm run start` — production build/serve
- `npm run lint`

**Always kill the dev server once you're done with it.** If you start
`npm run dev` in the background to check a change (curl, Playwright,
screenshots), kill the process on port 3000 as your last step —
`lsof -ti:3000 | xargs -r kill`. A Turbopack dev server left running across
many edit/verify cycles in the same session can accumulate enough stale
incremental-build state to start 404ing on routes that build and serve fine
from a fresh process; this has actually happened. If a stray one turns up,
kill it (`kill -9`, then confirm `lsof -ti:3000` is empty), delete `.next`,
and start clean.

## Stack

- **@react-three/fiber** + **@react-three/drei** — declarative scene graph on top
  of **three** (three.js is the actual engine; R3F is a React renderer for it,
  not a replacement — both are dependencies for a reason).
- **gsap** — overlay menu reveal, vinyl transform.
- **lenis** — inertial scroll; stopped/started via `useAppStore` subscription in
  `SmoothScrollProvider` whenever the menu or visualizer overlay is open.
- **zustand** (`src/store/useAppStore.ts`) — single global store: search state,
  selected album/tracks, playback, visualizer mode, sensitivity, color scheme.

## Non-obvious constraints (read before refactoring)

1. **iTunes Search API has no CORS headers** (`Content-Type: text/javascript`,
   meant for JSONP, verified with `curl -D-`). All calls go through
   `/api/albums` and `/api/albums/[collectionId]/tracks`, never fetched
   client-side directly.
2. **The `<audio>` element in `VisualizerStage` renders unconditionally**, even
   when the visualizer overlay is closed. `useAudioAnalyser` calls
   `createMediaElementSource` once per element; conditionally
   mounting/unmounting the element would try to rewire the same audio element
   or throw on reconnect. The overlay UI is what's conditional, not the tag.
3. **`getBands()` / `getSpectrum()` are ref-based, not React state.** They're
   polled from an r3f `useFrame` (~60/s); putting frequency data in `useState`
   would re-render the whole tree every frame.
4. **`MeshDistortMaterial`'s `speed` prop has no ref-settable equivalent** — it
   only drives the component's own internal `useFrame`. Reacting to audio in
   `OrbScene` goes through `material.distort` (bass) and `material.color`
   (treble) instead, both real setters on the underlying material.
5. **Play requires a user gesture for `AudioContext`.** The chain is: click →
   `store.playTrack()` → `isPlaying`/`isVisualizerOpen` flip → effect in
   `VisualizerStage` calls `audio.resume()` then `el.play()`. This still counts
   as within the browser's "sticky activation" window, so it doesn't need to be
   perfectly synchronous with the click.
6. **The `<audio>` element needs `crossOrigin="anonymous"`.** iTunes' preview
   CDN (`audio-ssl.itunes.apple.com`) does send `Access-Control-Allow-Origin:
   *`, but without the attribute the browser fetches it in no-cors mode
   anyway, which taints the `MediaElementAudioSourceNode` — playback still
   works but `analyser.getByteFrequencyData()` silently returns all zeros. If
   the visualizer ever goes flat/unreactive again, check this first.
7. **`Flip.from(state)` needs an explicit `targets`.** Without it, GSAP falls
   back to `state.targets` — the *original* element passed to
   `Flip.getState()` in `AlbumCard`'s onClick — and animates that (invisible,
   `opacity-0`) grid div instead of `VinylPanel`'s visible cover. The morph
   still "worked" in the sense that the panel popped in with no error, it just
   never actually animated. Always pass `targets: coverRef.current` explicitly
   when the old and new elements are different DOM nodes linked only by a
   matching `data-flip-id`.
8. **`VinylPanel` and `VisualizerStage` live in `layout.tsx`, outside
   `ContentDimmer`, not inside `page.tsx`.** `ContentDimmer` applies a CSS
   `transform` (scale) to the page content while the menu is open, and a
   `transform` on an ancestor turns it into the containing block for any
   `position: fixed` descendant — so a fixed-position overlay nested inside it
   would shrink/reposition along with the page instead of staying pinned to
   the viewport. Both overlays need to be siblings of `ContentDimmer`, not
   children.
9. **This lint setup (React Compiler's eslint rules) forbids reading *or*
   writing a ref during render, and forbids synchronous `setState` as the
   first statement in an effect body.** Both `VinylPanel` (track-loading
   state) and `OverlayMenu`'s `LiveClock` hit this — the fix each time was the
   same shape: use real `useState`, and only call the setter from inside an
   async callback (a `.then()`, a `setInterval` tick, `Promise.resolve().then`
   for a deferred first call) rather than synchronously at the top of the
   effect.
10. **`VinylPanel`'s cover div is reused across every album selection** (the
    component never unmounts, only `selectedAlbum` changes) — so a Flip run
    has to clear its own inline styles (`gsap.set(cover, {clearProps: "all"})`)
    before the next one starts, or leftover transform/position state from the
    previous morph compounds into a visible snap on the second-and-later
    opens. Also don't add `absolute: true` back to that `Flip.from()` call —
    it was the thing leaving the leftover positioning in the first place, and
    this layout never needed it (the size change already goes through `scale`,
    not real width/height, so nothing here ever needs to reflow around it).
11. **Anchor links to in-page sections must go through `<HashLink>`
    (`src/components/layout/HashLink.tsx`), not a plain `<a href="#...">`.** A
    real anchor jumps natively and completely bypasses Lenis. `HashLink`
    prevents that default and calls `scrollToHash()` (`src/lib/lenis.ts`),
    which holds the one Lenis instance as a module-level singleton — set by
    `SmoothScrollProvider` on mount — since threading it through context to
    every place a hash link might appear isn't worth it for one app-wide
    instance.
12. **`OrbScene` is a `<points>` cloud, not a mesh** — `MeshDistortMaterial`
    read as too smooth/plasticky ("cartoonish") for what this is going for.
    Each frame it re-displaces a `THREE.IcosahedronGeometry(detail: 34)`'s
    ~11.6k points *from a cached pristine copy of their resting positions*
    (`basePositions`), never from last frame's already-displaced values, or
    the cloud drifts outward instead of pulsing in place. Bloom
    (`@react-three/postprocessing`, wired up in `VisualizerStage`) is what
    turns the bright points into the glow — without it the cloud looks like
    plain dots.

## Structure

- `src/lib/itunes.ts` — iTunes fetch + normalization, server-side only.
  Includes `getFeaturedAlbums()`, a curated artist list used to seed the
  library before anyone searches (iTunes' API has no real "trending" data).
- `src/store/useAppStore.ts` — global state.
- `src/hooks/useAudioAnalyser.ts` — Web Audio wiring.
- `src/components/layout/` — `SmoothScrollProvider`, `SiteHeader`,
  `OverlayMenu` (fullscreen nav), `ContentDimmer` (dims/scales the page while
  the menu is open — see gotcha 8 above for why it can't wrap the overlays),
  `HashLink` (smooth-scroll anchor, see gotcha 11), `CustomCursor`.
- `src/components/intro/` — `IntroLoader` (first-load overlay, gates
  `store.introComplete`).
- `src/components/home/` — `SearchBar`, `AlbumGrid`, `AlbumCard` (each cover
  carries a `data-flip-id` for the GSAP Flip morph into `VinylPanel`).
- `src/components/album/` — `VinylPanel`: cover → spinning vinyl via
  `Flip.from(pendingFlipState)` (see `src/lib/flip.ts`), album details, Play.
- `src/components/visualizer/` — `VisualizerStage` (canvas host), `scenes/`
  (`OrbScene`, `TerrainScene`), `SettingsPanel`, `TrackMeta`, `palettes.ts`.

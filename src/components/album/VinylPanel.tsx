"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";
import { Flip } from "@/lib/flip";
import type { Track } from "@/lib/itunes";
import TrackList, { TrackListSkeleton } from "./TrackList";

// Shared by the real list and its loading placeholder so the two are capped
// at the same height. Capped in vh, not rows: this panel is vertically
// centred against the viewport, and a fixed row count that fits a desktop
// window pushes the title and Play button off a 320x568 phone screen.
// `scrollbar-gutter: stable` on both for the same reason they share a row
// height — where scrollbars take real layout width (Windows, or macOS set
// to always show them) the real list's would appear on swap and shove every
// row's text sideways. It costs nothing under overlay scrollbars, which is
// what macOS does by default.
const LIST_CLASS =
  "max-h-[22vh] pr-1 [scrollbar-gutter:stable] min-[380px]:max-h-[26vh] sm:max-h-[34vh]";

// The idle spin (`.animate-spin-vinyl` in globals.css) does one full turn
// every 2.6s at a constant rate — kept in sync here so the custom eases
// below can hand off to/from it at the *exact* same angular velocity, not
// just the same angle.
const REST_SPIN_DEG_PER_SEC = 360 / 2.6;

// A cubic f(t) with f(0)=0, f(1)=1, and chosen entry/exit slopes. Named
// GSAP eases always end (or start) at zero velocity — fine for a landing,
// wrong for a spin that has to blend into a perpetual constant-speed spin
// without a visible lurch. `startRatio`/`endRatio` are the desired
// derivative at t=0/t=1 (e.g. `restDegPerSec * duration / totalAngle` for
// an end that should land exactly at the resting spin's rate).
function makeVelocityMatchedEase(startRatio: number, endRatio: number) {
  const c = startRatio;
  const a = startRatio + endRatio - 2;
  const b = 3 - 2 * startRatio - endRatio;
  return (t: number) => a * t ** 3 + b * t ** 2 + c * t;
}

// Reads the vinyl's current rotation straight off its live computed
// transform — used when taking over from the CSS spin on close, since
// there's no other record of "how far into its 2.6s loop" it currently is.
function currentRotationDeg(el: HTMLElement): number {
  const transform = getComputedStyle(el).transform;
  if (transform === "none") return 0;
  const match = transform.match(/matrix\(([^)]+)\)/);
  if (!match) return 0;
  const [a, b] = match[1].split(",").map(Number);
  return (Math.atan2(b, a) * 180) / Math.PI;
}

// The grid cover's corner radius (Tailwind's `rounded-lg`, 8px) expressed
// as a percentage of *this* element's own layout width — using
// `offsetWidth` (unaffected by the `transform: scale()` Flip drives) rather
// than `getBoundingClientRect()` (which would include it). Percentage
// border-radius is what lets the square<->circle morph run on its own
// dedicated, evenly-paced tween instead of Flip's built-in
// `props: "borderRadius"` handling, which swings through huge intermediate
// px values to compensate for the simultaneous scale change, and visually
// snaps round almost immediately rather than growing.
function squareRadiusPercent(el: HTMLElement): number {
  return (8 / el.offsetWidth) * 100;
}

// Reads the vinyl's *actual* current border-radius, whatever point the open
// flight's own percentage-based tween happens to be at — used when closing
// interrupts that flight mid-way, so the close animation continues smoothly
// from wherever the shape actually is instead of snapping to an assumed
// "fully round" starting point. Once the open flight has finished and its
// inline style was cleared, this falls through to Tailwind's `rounded-full`
// class instead — a huge px value, not a percentage, which is why the
// fallback (rather than parsing it) is just the same 50% used before.
function currentBorderRadiusPercent(el: HTMLElement): number {
  const raw = getComputedStyle(el).borderTopLeftRadius;
  return raw.endsWith("%") ? parseFloat(raw) : 50;
}

export default function VinylPanel() {
  const selectedAlbum = useAppStore((s) => s.selectedAlbum);
  const isVisualizerOpen = useAppStore((s) => s.isVisualizerOpen);
  const tracks = useAppStore((s) => s.tracks);
  const setTracks = useAppStore((s) => s.setTracks);
  const selectAlbum = useAppStore((s) => s.selectAlbum);
  const playTrack = useAppStore((s) => s.playTrack);
  // Only for the tracklist's now-playing marker — this panel sits behind the
  // visualizer overlay, so a track can already be playing while it's open.
  const activeTrack = useAppStore((s) => s.activeTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const pendingFlipState = useAppStore((s) => s.pendingFlipState);
  const setPendingFlipState = useAppStore((s) => s.setPendingFlipState);

  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const vinylDecorRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // The open flight's own timeline — closing has to kill this if it's still
  // running (Escape/backdrop/Close pressed mid-flight), or its still-queued
  // tweens and the `tl.call()` that hands off to the idle CSS spin keep
  // firing on their original schedule and stomp on the close animation
  // (snapping transform/border-radius, or re-adding the spin class) while
  // it's running concurrently.
  const openTimelineRef = useRef<gsap.core.Timeline | null>(null);
  // Tracks which album's fetch has actually finished (success, failure, or
  // legitimately zero tracks), so "loading" can resolve even when the result
  // is empty. No reset needed when a new album is picked — resolvedId just
  // naturally lags behind the new selectedAlbum.collectionId until its own
  // fetch calls setResolvedId, so tracksLoading flips true on its own.
  const [resolvedId, setResolvedId] = useState<number | null>(null);
  const tracksLoading = selectedAlbum
    ? resolvedId !== selectedAlbum.collectionId
    : false;
  // Wraps the "N tracks" caption and the list/placeholder, so the height
  // handover below can tween the one box the column's height depends on.
  const listWrapRef = useRef<HTMLDivElement>(null);
  // The height the placeholder was holding at the moment the real tracks
  // were handed to the store — captured there rather than in an effect
  // because that's the last point at which the old layout is still on
  // screen. Null means "nothing to hand over from".
  const pendingListHeightRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedAlbum) return;
    const album = selectedAlbum;
    let cancelled = false;

    function resolve(next: Track[]) {
      if (cancelled) return;
      pendingListHeightRef.current = listWrapRef.current?.offsetHeight ?? null;
      setTracks(next);
      setResolvedId(album.collectionId);
    }

    fetch(`/api/albums/${album.collectionId}/tracks`)
      .then((res) => res.json())
      .then((data: { tracks?: Track[] }) => resolve(data.tracks ?? []))
      .catch(() => resolve([]));

    return () => {
      cancelled = true;
    };
  }, [selectedAlbum, setTracks]);

  // The placeholder is sized from the album's advertised `trackCount`, which
  // is usually exactly what the lookup returns (and moot at all for albums
  // long enough that both hit the max-height cap) — but not always: a
  // multi-disc collection or a region-restricted release can come back a few
  // rows short. Rather than let that difference land as a jump, the wrapper
  // tweens from whatever height it was holding to the real one. Runs before
  // paint, so the real list is never seen at its own height first.
  useLayoutEffect(() => {
    const el = listWrapRef.current;
    const from = pendingListHeightRef.current;
    pendingListHeightRef.current = null;
    if (!el || from === null) return;

    const to = el.offsetHeight;
    if (Math.abs(to - from) < 1) return;
    gsap.fromTo(
      el,
      // overflow while it's mid-tween: the box is briefly shorter than the
      // list inside it, and the list's own scroll container would otherwise
      // spill past it.
      { height: from, overflow: "hidden" },
      {
        height: to,
        duration: 0.3,
        ease: "power2.out",
        clearProps: "height,overflow",
      }
    );
  }, [tracks]);

  // Run the cover -> vinyl Flip once this panel (and its matching
  // data-flip-id element) has mounted in its resting layout. useLayoutEffect
  // fires before paint, so the plain "already round" frame is never visible.
  useLayoutEffect(() => {
    if (!selectedAlbum || !pendingFlipState || !coverRef.current) return;

    const cover = coverRef.current;
    const details = detailsRef.current;
    const vinylDecor = vinylDecorRef.current;
    cover.classList.remove("animate-spin-vinyl");
    // This div is reused across every album selection (VinylPanel never
    // unmounts), so anything a previous Flip left on it — inline transform,
    // position — has to be wiped before the next one starts, or the two runs
    // compose into a visible snap/jump instead of a clean morph.
    gsap.set(cover, { clearProps: "all" });
    if (details) gsap.set(details, { opacity: 0, y: 20 });
    // The edge ring, paper label, and spindle hole are vinyl-only —
    // AlbumCard's grid tile has none of them, so they have nothing to hand
    // off to. Hidden until the shape is already mostly round (see the
    // fade-in below), instead of sitting fully visible from frame one on
    // top of what still looks like a square cover.
    if (vinylDecor) gsap.set(vinylDecor, { opacity: 0 });

    const tl = gsap.timeline({
      onComplete: () => {
        openTimelineRef.current = null;
      },
    });
    openTimelineRef.current = tl;

    const FLIGHT_EASE = "power3.inOut";
    const FLIGHT_DURATION = 0.75;

    tl.add(
      Flip.from(pendingFlipState, {
        // Without an explicit target, Flip.from() re-uses state.targets —
        // the *original* grid element captured in AlbumCard's onClick — and
        // animates that (invisible, opacity-0) div instead of this panel's
        // cover. The visible morph only happens if we point it here
        // explicitly.
        targets: cover,
        duration: FLIGHT_DURATION,
        ease: FLIGHT_EASE,
        // No `absolute: true` — the row's other child (the text block)
        // never needs to reflow around this element (its size change is
        // handled by `scale`, a transform, not real width/height), so
        // there's nothing for taking it out of flow to buy here, and it's
        // what was leaving the stray inline positioning behind in the
        // first place.
        scale: true,
        // Not `props: "borderRadius"` — that's handled by the dedicated
        // percentage-based tween below instead, so the square-to-circle
        // shape change reads as its own deliberate "growing round" beat
        // rather than a barely-visible side effect of the Flip.
      })
    );

    const squarePct = squareRadiusPercent(cover);
    gsap.set(cover, { borderRadius: `${squarePct}%` });
    tl.fromTo(
      cover,
      { borderRadius: `${squarePct}%` },
      { borderRadius: "50%", duration: FLIGHT_DURATION, ease: FLIGHT_EASE },
      "<"
    );

    // Spins up mid-flight instead of snapping straight into the idle
    // `animate-spin-vinyl` CSS spin once it lands — one full turn landing
    // on an exact multiple of 360deg, so the handoff to that keyframe
    // (which always starts fresh at 0deg) has no ANGLE jump. Rotation is a
    // separate GSAP transform component from Flip's own x/y/scale, so the
    // two compose without fighting over the same prop.
    //
    // Deliberately its own ease, not FLIGHT_EASE or a plain linear one:
    // starts at rest (velocity 0, matching the click) and ramps up to a
    // fast peak, but its EXIT velocity is solved to land exactly on the
    // CSS spin's own constant rate (REST_SPIN_DEG_PER_SEC) — so the handoff
    // has no velocity cliff either, not just no angle jump. Without this,
    // any ease ending at v=0 (a deceleration) or v=some-arbitrary-speed
    // (linear) reads as "spins in, stops (or lurches), then restarts."
    const OPEN_SPIN_TOTAL_DEG = 360;
    const openSpinEase = makeVelocityMatchedEase(
      0,
      (REST_SPIN_DEG_PER_SEC * FLIGHT_DURATION) / OPEN_SPIN_TOTAL_DEG
    );
    tl.fromTo(
      cover,
      { rotation: 0 },
      { rotation: OPEN_SPIN_TOTAL_DEG, duration: FLIGHT_DURATION, ease: openSpinEase },
      "<"
    );

    // Handing off to the CSS spin right when the flight/rotation actually
    // ends (FLIGHT_DURATION) — not on the timeline's own onComplete, which
    // only fires once EVERY tween finishes, including the details fade-in
    // below that runs past FLIGHT_DURATION. That gap was the vinyl visibly
    // freezing for ~0.2s between "GSAP rotation stops" and "CSS spin
    // starts" before this was a `tl.call()` pinned to the right time.
    tl.call(
      () => {
        gsap.set(cover, { clearProps: "transform,borderRadius" });
        cover.classList.add("animate-spin-vinyl");
      },
      [],
      FLIGHT_DURATION
    );

    if (details) {
      tl.to(
        details,
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
        "-=0.3"
      );
    }

    if (vinylDecor) {
      tl.to(
        vinylDecor,
        { opacity: 1, duration: 0.35, ease: "power2.out" },
        FLIGHT_DURATION - 0.35
      );
    }

    setPendingFlipState(null);
    // Re-run only when the selection itself changes, not on every store tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAlbum?.collectionId]);

  const handleClose = useCallback(() => {
    const panel = panelRef.current;
    const cover = coverRef.current;
    const vinylDecor = vinylDecorRef.current;
    const details = detailsRef.current;
    const closeButton = closeButtonRef.current;
    const backdrop = backdropRef.current;

    if (!cover || !selectedAlbum) {
      selectAlbum(null);
      return;
    }

    // Guards against a double-click (or Close-then-backdrop-click) starting
    // a second close timeline on top of one already in flight.
    if (panel) panel.style.pointerEvents = "none";

    // If Escape/backdrop/Close fires before the open flight has landed, its
    // timeline is still actively ticking — kill it now so its remaining
    // tweens and its `tl.call()` handoff to the idle CSS spin can't fire
    // later and stomp on the close animation this function is about to
    // start on the very same properties.
    openTimelineRef.current?.kill();
    openTimelineRef.current = null;

    // The grid's AlbumCard for this album is still in the document the
    // whole time — it never unmounted, just went opacity-0 — so its current
    // box is right there to fit back onto. Both it and this panel's cover
    // share the same data-flip-id; whichever one isn't our own ref is the
    // grid tile.
    const gridCover = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-flip-id="album-cover-${selectedAlbum.collectionId}"]`
      )
    ).find((el) => el !== cover);

    const CLOSE_DURATION = 0.6;
    const CLOSE_SPIN_TOTAL_DEG = 360;

    // Freeze the CSS spin at its current angle (read straight off the live
    // computed transform, since nothing tracks how far into its 2.6s loop
    // it currently is) before handing rotation over to GSAP — removing the
    // class without doing this first would snap it back to 0deg first. Same
    // idea for border-radius: read whatever the (now-killed) open flight's
    // own tween actually reached, rather than assuming it had already
    // finished growing into a full circle.
    const currentAngle = currentRotationDeg(cover);
    const currentRadius = currentBorderRadiusPercent(cover);
    cover.classList.remove("animate-spin-vinyl");
    gsap.set(cover, { rotation: currentAngle, borderRadius: `${currentRadius}%` });

    const tl = gsap.timeline({ onComplete: () => selectAlbum(null) });

    // Mirrors the opening's square->circle tween in reverse — its own
    // dedicated, percentage-based animation rather than Flip.fit's built-in
    // `props: "borderRadius"` handling (removed below), so the vinyl
    // visibly "grows into a square" as its own deliberate beat instead of
    // snapping flat almost immediately.
    tl.fromTo(
      cover,
      { borderRadius: `${currentRadius}%` },
      { borderRadius: `${squareRadiusPercent(cover)}%`, duration: CLOSE_DURATION, ease: "power3.inOut" },
      0
    );

    // Mirrors the opening spin-up: starts at whatever velocity the idle
    // CSS spin was already running at (so taking over from it is
    // seamless), accelerates, then eases down to a dead stop exactly when
    // it lands back in the grid — a static thumbnail shouldn't still be
    // spinning once it arrives.
    const closeSpinEase = makeVelocityMatchedEase(
      (REST_SPIN_DEG_PER_SEC * CLOSE_DURATION) / CLOSE_SPIN_TOTAL_DEG,
      0
    );
    tl.to(
      cover,
      {
        rotation: currentAngle + CLOSE_SPIN_TOTAL_DEG,
        duration: CLOSE_DURATION,
        ease: closeSpinEase,
      },
      0
    );

    tl.to(
      [details, closeButton].filter(Boolean),
      { opacity: 0, y: 12, duration: 0.25, ease: "power2.in" },
      0
    );

    if (vinylDecor) {
      // Same reasoning in reverse: fades out early, before the shape has
      // visibly started squaring off, so it's already gone rather than
      // popping out of existence the instant this panel unmounts and the
      // (decoration-less) grid tile takes over underneath.
      tl.to(vinylDecor, { opacity: 0, duration: 0.2, ease: "power2.in" }, 0);
    }

    if (backdrop) {
      tl.to(backdrop, { opacity: 0, duration: 0.4, ease: "power2.inOut" }, 0.1);
    }

    // Mirrors the opening Flip.from — but as a direct fit onto the grid
    // tile's live box instead of a stored FlipState, since we're going the
    // other direction and that box is already sitting right there in the
    // DOM. Flip.fit() only returns null when no duration is given, which
    // isn't the case here, but its type signature allows for it.
    const flightBack = gridCover
      ? (Flip.fit(cover, gridCover, {
          duration: CLOSE_DURATION,
          ease: "power3.inOut",
          scale: true,
          // Not `props: "borderRadius"` — the dedicated tween above handles
          // the shape change now.
        }) as gsap.core.Tween | null)
      : null;

    if (flightBack) {
      tl.add(flightBack, 0);
    } else {
      // Fallback for when the grid tile is gone (e.g. the search that
      // produced it has since been cleared) — just shrink and fade in place.
      tl.to(cover, { opacity: 0, scale: 0.85, duration: 0.35, ease: "power2.in" }, 0);
    }
  }, [selectedAlbum, selectAlbum]);

  // Skipped while the visualizer is open on top of this panel — that overlay
  // has its own Escape handler, and closing both at once from a single
  // keypress would be a jarring double-exit instead of one layer at a time.
  useEffect(() => {
    if (!selectedAlbum || isVisualizerOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAlbum, isVisualizerOpen, handleClose]);

  if (!selectedAlbum) return null;

  const playableTrack = tracks.find((t) => t.previewUrl);
  // While the fetch is in flight, the album's own trackCount (iTunes returns
  // it alongside the album, so it's already in the store) stands in for the
  // list that's about to arrive. Without it the panel opened around a
  // details column with no tracklist in it at all, the Flip flew the vinyl
  // into place against *that* layout, and then the tracks landed and shoved
  // the whole stacked column upward — the vinyl visibly jumping a moment
  // after it had settled.
  const listCount = tracksLoading ? selectedAlbum.trackCount : tracks.length;

  return (
    <div
      ref={panelRef}
      /* gap-4 below 380px: the tracklist added a block to the stacked
         layout, and a 568px-tall screen has no 32px gap to spare — at that
         height the whole column overflowed and the vinyl got clipped off
         the top. */
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 px-4 min-[380px]:gap-8 sm:flex-row sm:gap-16 sm:px-16"
    >
      {/* Separate from `panel` so it can fade independently on close while
          the flying cover (a sibling, not a descendant of this div) stays
          at full opacity — a shared parent opacity would fade both together. */}
      <div
        ref={backdropRef}
        onClick={handleClose}
        className="absolute inset-0 bg-bg/95"
      />

      <button
        ref={closeButtonRef}
        type="button"
        onClick={handleClose}
        aria-label="Close album details"
        /* z-10 because the vinyl below is a later sibling and would
           otherwise paint straight over this — which is exactly what
           happened on a 320px screen, where the disc is wide enough to
           reach under it. */
        className="absolute right-4 top-20 z-10 rounded-full border border-line px-3 py-2 text-[11px] uppercase tracking-widest text-fg transition-colors hover:border-fg cursor-pointer sm:right-10 sm:top-24 sm:px-4 sm:text-xs sm:tracking-[0.2em]"
      >
        Close
      </button>

      <div
        ref={coverRef}
        data-flip-id={`album-cover-${selectedAlbum.collectionId}`}
        /* h-44 below 380px: at 320 a 14rem disc leaves the title and Play
           button fighting for what's left of a 568px-tall screen. */
        className="relative h-44 w-44 shrink-0 overflow-hidden rounded-full border border-line shadow-2xl min-[380px]:h-56 min-[380px]:w-56 sm:h-72 sm:w-72"
      >
        {selectedAlbum.artworkUrl && (
          <Image
            src={selectedAlbum.artworkUrl}
            alt={selectedAlbum.collectionName}
            fill
            sizes="288px"
            className="object-cover"
            priority
          />
        )}
        {/* Vinyl-only decoration — the grid tile underneath has none of
            this, so it fades in/out on its own rather than popping in/out
            at the edges of the flip (see vinylDecorRef in the effect above). */}
        <div ref={vinylDecorRef} className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-black/25" />
          {/* The paper label every vinyl record has around its spindle hole. */}
          <div className="absolute left-1/2 top-1/2 aspect-square w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface shadow-[inset_0_0_10px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-black/20" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg" />
        </div>
      </div>

      {/* `w-full`, not just the `max-w-sm` cap: without a width of its own
          this column is sized by its widest child, so it was *narrow* while
          the tracklist placeholder was up (its bars sit on `flex-1` and ask
          for almost nothing) and snapped wide the moment real track titles
          arrived — and since the row is `justify-center`, everything,
          vinyl included, slid sideways to re-centre around the new width.
          Pinned to the cap instead, the column is the same width before and
          after the fetch, and the same width for a one-word album as for a
          long one. `min-w-0` so the cap can still shrink below its content
          on a narrow screen (a flex item's floor is its min-content size
          otherwise, and the truncating track rows inside would hold it
          open). */}
      <div
        ref={detailsRef}
        className="flex w-full min-w-0 max-w-sm flex-col gap-6 text-fg"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted">
            {selectedAlbum.genre} · {selectedAlbum.year}
          </p>
          <h2 className="font-display text-4xl italic leading-tight sm:text-5xl">
            {selectedAlbum.collectionName}
          </h2>
          <p className="mt-1 text-lg text-muted">{selectedAlbum.artistName}</p>
        </div>

        <button
          type="button"
          onClick={() => playableTrack && playTrack(playableTrack)}
          disabled={!playableTrack}
          className="w-fit cursor-pointer rounded-full bg-fg px-6 py-3 text-xs uppercase tracking-[0.2em] text-bg transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {tracksLoading
            ? "Loading preview…"
            : playableTrack
              ? "Play preview"
              : "No preview available"}
        </button>

        {/* Only worth showing when there's actually a choice to make — a
            single-track release is already fully described by the button
            above, and this panel has no height to spare on a phone. The
            fetch puts every track in the store either way; before this
            list existed the other eleven tracks of an album were simply
            unreachable, since Play always took the first playable one. */}
        {listCount > 1 && (
          <div ref={listWrapRef} className="min-h-0">
            {/* Hidden below 380px purely for the ~28px it costs — the list
                underneath is self-evidently a tracklist, and at that height
                the count is the least useful thing competing for room. */}
            <p className="mb-2 hidden text-xs uppercase tracking-[0.2em] text-muted min-[380px]:block">
              {listCount} tracks
            </p>
            {tracksLoading ? (
              <TrackListSkeleton count={listCount} className={LIST_CLASS} />
            ) : (
              <TrackList
                tracks={tracks}
                activeTrackId={activeTrack?.trackId ?? null}
                isPlaying={isPlaying}
                onSelect={playTrack}
                className={LIST_CLASS}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

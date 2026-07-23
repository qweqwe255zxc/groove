"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";
import { Flip } from "@/lib/flip";
import type { Track } from "@/lib/itunes";

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

export default function VinylPanel() {
  const selectedAlbum = useAppStore((s) => s.selectedAlbum);
  const isVisualizerOpen = useAppStore((s) => s.isVisualizerOpen);
  const tracks = useAppStore((s) => s.tracks);
  const setTracks = useAppStore((s) => s.setTracks);
  const selectAlbum = useAppStore((s) => s.selectAlbum);
  const playTrack = useAppStore((s) => s.playTrack);
  const pendingFlipState = useAppStore((s) => s.pendingFlipState);
  const setPendingFlipState = useAppStore((s) => s.setPendingFlipState);

  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const vinylDecorRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Tracks which album's fetch has actually finished (success, failure, or
  // legitimately zero tracks), so "loading" can resolve even when the result
  // is empty. No reset needed when a new album is picked — resolvedId just
  // naturally lags behind the new selectedAlbum.collectionId until its own
  // fetch calls setResolvedId, so tracksLoading flips true on its own.
  const [resolvedId, setResolvedId] = useState<number | null>(null);
  const tracksLoading = selectedAlbum
    ? resolvedId !== selectedAlbum.collectionId
    : false;

  useEffect(() => {
    if (!selectedAlbum) return;
    let cancelled = false;

    fetch(`/api/albums/${selectedAlbum.collectionId}/tracks`)
      .then((res) => res.json())
      .then((data: { tracks?: Track[] }) => {
        if (cancelled) return;
        setTracks(data.tracks ?? []);
        setResolvedId(selectedAlbum.collectionId);
      })
      .catch(() => {
        if (cancelled) return;
        setTracks([]);
        setResolvedId(selectedAlbum.collectionId);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAlbum, setTracks]);

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

    const tl = gsap.timeline();

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
    // class without doing this first would snap it back to 0deg first.
    const currentAngle = currentRotationDeg(cover);
    cover.classList.remove("animate-spin-vinyl");
    gsap.set(cover, { rotation: currentAngle, borderRadius: "50%" });

    const tl = gsap.timeline({ onComplete: () => selectAlbum(null) });

    // Mirrors the opening's square->circle tween in reverse — its own
    // dedicated, percentage-based animation rather than Flip.fit's built-in
    // `props: "borderRadius"` handling (removed below), so the vinyl
    // visibly "grows into a square" as its own deliberate beat instead of
    // snapping flat almost immediately.
    tl.fromTo(
      cover,
      { borderRadius: "50%" },
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

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-10 px-6 sm:flex-row sm:gap-16 sm:px-16"
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
        className="absolute right-6 top-24 rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer sm:right-10"
      >
        Close
      </button>

      <div
        ref={coverRef}
        data-flip-id={`album-cover-${selectedAlbum.collectionId}`}
        className="relative h-56 w-56 shrink-0 overflow-hidden rounded-full border border-line shadow-2xl sm:h-72 sm:w-72"
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

      <div ref={detailsRef} className="flex max-w-sm flex-col gap-6 text-fg">
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
      </div>
    </div>
  );
}

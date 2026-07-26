// Shared chrome for every pill in the visualizer's overlay — the top row
// (Orb/Terrain, theme, Share, Close), the bottom stack's transport and time
// readout, and the Tracks/Settings toggles. They sit in the same rows and
// have to measure identically, so the padding/size/tracking lives here rather
// than being retyped (and drifting) at each call site.
//
// Deliberately tighter below `sm` than the rest of the site's pills: at 320px
// the roomier `px-4 text-xs tracking-[0.2em]` is the difference between a row
// fitting and its last button hanging off the screen edge. Everything scales
// back up at sm:, where there's room to spare.
// Geometry and type only. Split out from PILL_BASE so a caller that needs a
// different skin — the phone layout's filled Play button — can build on the
// same shape without two conflicting `border-*`/`text-*` utilities in one
// class list, where which one wins is down to Tailwind's own output order
// rather than anything visible at the call site.
export const PILL_SHAPE =
  "rounded-full border px-3 py-2 text-[11px] uppercase tracking-widest sm:px-4 sm:text-xs sm:tracking-[0.2em]";

export const PILL_BASE = `${PILL_SHAPE} border-line text-fg`;

export const PILL_BUTTON = `${PILL_BASE} cursor-pointer transition-colors hover:border-fg`;

// Top-row-only sizing: four equal columns filling the width below sm, natural
// width in a compact corner group from sm: up (where stretching would instead
// strand them at opposite ends of a wide screen).
//
// They used to wrap 2×2 below 420px because the longest label ("Terrain",
// "Settings") wouldn't fit four-across at full pill size. Rather than spend a
// second row on it, the type and padding shrink a step below 420px — that
// buys ~60px across the four, which is enough at 320. `min-w-0` so a column
// that still can't fit its label shrinks instead of pushing the row wide.
export const PILL_ROW_ITEM =
  "flex-1 basis-0 min-w-0 max-[420px]:px-2 max-[420px]:text-[10px] max-[420px]:tracking-[0.06em] sm:flex-none sm:basis-auto";

// Shared chrome for every pill in the visualizer's overlay — the top row
// (Orb/Terrain, theme, Share, Close), the bottom row's Play button and time
// readout, and SettingsPanel's own toggle. They sit in the same two rows and
// have to measure identically, so the padding/size/tracking lives here rather
// than being retyped (and drifting) at each call site.
//
// Deliberately tighter below `sm` than the rest of the site's pills: at 320px
// the roomier `px-4 text-xs tracking-[0.2em]` is the difference between a row
// fitting and its last button hanging off the screen edge. Everything scales
// back up at sm:, where there's room to spare.
export const PILL_BASE =
  "rounded-full border border-line px-3 py-2 text-[11px] uppercase tracking-widest text-fg sm:px-4 sm:text-xs sm:tracking-[0.2em]";

export const PILL_BUTTON = `${PILL_BASE} cursor-pointer transition-colors hover:border-fg`;

// Top-row-only sizing: 2×2 below 420px (four tracked-out pills can't share
// one line there without the longest label spilling), one stretched row from
// 420px to sm, natural width in a compact corner group from sm: up.
export const PILL_ROW_ITEM =
  "flex-1 basis-[calc(50%-0.25rem)] min-[420px]:basis-0 sm:flex-none sm:basis-auto";

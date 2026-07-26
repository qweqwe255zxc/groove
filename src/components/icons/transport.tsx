/**
 * Transport glyphs drawn as SVG rather than typed as the obvious Unicode
 * characters.
 *
 * U+25C0/U+25B6 (◀ ▶) and U+23F8 carry Emoji_Presentation by default on
 * Apple platforms, so iOS renders them as full-colour emoji — blue rounded
 * squares sitting in the middle of an otherwise monochrome typographic UI.
 * A U+FE0E variation selector nominally asks for the text form but isn't
 * honoured consistently, and it leaves the glyph's size and side bearings up
 * to whichever font ends up serving it. Drawing the shapes takes the font
 * out of the question entirely and gives the double arrowheads even spacing
 * at any size.
 *
 * All of them fill with `currentColor`, so callers keep styling them with
 * text colour utilities — including TrackList's `text-transparent`, which is
 * how its marker column holds its width on inactive rows.
 */

type IconProps = { className?: string };

export function PrevIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 10"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <polygon points="7,0 7,10 1,5" />
      <polygon points="15,0 15,10 9,5" />
    </svg>
  );
}

export function NextIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 10"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <polygon points="1,0 1,10 7,5" />
      <polygon points="9,0 9,10 15,5" />
    </svg>
  );
}

export function PlayGlyph({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 8 10" fill="currentColor" aria-hidden className={className}>
      <polygon points="0,0 8,5 0,10" />
    </svg>
  );
}

export function PauseGlyph({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 8 10" fill="currentColor" aria-hidden className={className}>
      <rect x="0" y="0" width="3" height="10" />
      <rect x="5" y="0" width="3" height="10" />
    </svg>
  );
}

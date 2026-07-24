"use client";

import { useId } from "react";

// Same badge as src/app/icon.svg (accent circle + italic "g"), reused inline
// next to the wordmark instead of loaded as an <img> — as inline SVG it can
// switch to the `cutout` variant, which SiteHeader needs and a static file
// can't give it (see below).
export default function GrooveMark({
  className,
  variant = "solid",
}: {
  className?: string;
  variant?: "solid" | "cutout";
}) {
  const maskId = useId();

  if (variant === "cutout") {
    // SiteHeader renders everything in flat white and relies on
    // mix-blend-difference to invert against whatever's underneath — that
    // only inverts cleanly if the source pixels are pure white (see the
    // comment on <header> in SiteHeader.tsx). A filled accent circle with a
    // dark letter would blend-difference into a wrong, muddy color instead
    // of a clean invert, so this variant punches the "g" out of a solid
    // `currentColor` circle (mask) rather than drawing it in a second
    // color.
    return (
      <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
        <mask id={maskId}>
          <rect width="100" height="100" fill="white" />
          <text
            x="49"
            y="70"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontStyle="italic"
            fontWeight="600"
            fontSize="72"
            fill="black"
          >
            g
          </text>
        </mask>
        <circle cx="50" cy="50" r="50" fill="currentColor" mask={`url(#${maskId})`} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#c17a52" />
      <text
        x="49"
        y="70"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="600"
        fontSize="72"
        fill="#0c0b0a"
      >
        g
      </text>
    </svg>
  );
}

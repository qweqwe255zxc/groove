import { AdditiveBlending, NormalBlending, type Blending } from "three";
import type { ColorScheme } from "@/store/useAppStore";
import type { SystemTheme } from "@/hooks/useSystemTheme";

export type Palette = {
  label: string;
  bass: string;
  treble: string;
  background: string;
  blending: Blending;
};

type Variant = { bass: string; treble: string; background: string };

// Each scheme keeps the same "quiet region stays close to one end, energetic
// region pops toward the other" relationship in both themes, just recolored
// for the background it actually renders against — and in both themes,
// `treble` (energetic) is the end with headroom to bloom. Dark variants get
// that headroom for free (near-black background, so almost anything reads as
// bright) and render with additive blending, where higher luminance = more
// glow. Additive blending on a light background just clamps every point
// straight to white (white + anything = white) instead of glowing, so light
// variants use normal blending instead — but that alone leaves nothing to
// glow *against*: a near-white background has no brightness headroom above
// it. So the light background is pulled down to a soft mid-light tone
// (not stark white) specifically to leave that headroom, and `treble` is a
// near-white/bright highlight rather than a dark tone — the same
// bright-crosses-the-bloom-threshold trick as the dark theme, just shifted
// into a lighter overall range. `bass` (quiet) is a noticeably deeper tone
// than the background (not just "a shade under" — the orb's cloud is a
// sparse field of small points, which needs a much bigger luminance gap than
// a solid fill to read as a silhouette instead of dissolving into the
// background at rest), so the resting shape stays visible even with no audio
// pushing it toward `treble`.
type OrbAccent = { bass: string; treble: string };

const SCHEME_VARIANTS: Record<
  ColorScheme,
  { label: string; dark: Variant; light: Variant; orbLight: OrbAccent }
> = {
  mono: {
    label: "Mono",
    dark: { bass: "#8f8a80", treble: "#f2ede4", background: "#08070a" },
    light: { bass: "#a39785", treble: "#fffdf6", background: "#e9e3d6" },
    orbLight: { bass: "#6f6a60", treble: "#171310" },
  },
  clay: {
    label: "Clay",
    dark: { bass: "#c17a52", treble: "#f2ede4", background: "#100e0c" },
    light: { bass: "#b98f6c", treble: "#fff0dd", background: "#ecdfd0" },
    orbLight: { bass: "#8a5230", treble: "#b8451e" },
  },
  sage: {
    label: "Sage",
    dark: { bass: "#8ba888", treble: "#e7e2d3", background: "#0d120e" },
    light: { bass: "#7f9c78", treble: "#e8ffe0", background: "#e2ebdd" },
    orbLight: { bass: "#5c7a58", treble: "#1f6b34" },
  },
  neon: {
    label: "Neon",
    dark: { bass: "#ff5d73", treble: "#4dd0e1", background: "#08050c" },
    light: { bass: "#d17690", treble: "#dffbff", background: "#ecdfe8" },
    orbLight: { bass: "#c81146", treble: "#0e8299" },
  },
};

export function getPalette(scheme: ColorScheme, theme: SystemTheme): Palette {
  const { label, dark, light } = SCHEME_VARIANTS[scheme];
  const variant = theme === "light" ? light : dark;
  return {
    label,
    ...variant,
    blending: theme === "light" ? NormalBlending : AdditiveBlending,
  };
}

// OrbScene's light-theme colors are deliberately NOT the same `light`
// variant TerrainScene/Bloom use above. That variant is pale-and-near-white
// on purpose — it's tuned so `treble` crosses the postprocessing Bloom
// luminance threshold against TerrainScene's large solid bars. A sparse
// field of 1-2px points has nowhere near enough pixel coverage for that
// same trick to read as anything but "washed out and blended into the
// background" (which is exactly what it looked like). The orb instead
// leans on its own manual additive glow layer (OrbScene.tsx), which works
// off actual color saturation, not postprocessing luminance — so it wants
// dark, saturated colors that contrast against the light background
// directly, the same way the dark theme's bright colors contrast against
// its near-black background, just inverted.
export function getOrbColors(scheme: ColorScheme, theme: SystemTheme): OrbAccent {
  const { dark, orbLight } = SCHEME_VARIANTS[scheme];
  return theme === "light" ? orbLight : dark;
}

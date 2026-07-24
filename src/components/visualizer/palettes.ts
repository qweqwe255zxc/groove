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

// `getPalette`'s `background`/`label` are still used directly (Canvas
// background/fog, SettingsPanel's aria-label) — `bass`/`treble`/`blending`
// below are historical: both scenes now render as point clouds and get
// their actual particle colors from `getParticleColors` instead (see that
// function's comment for why a sparse point cloud needs different colors
// than a solid fill would).
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

// Both OrbScene and TerrainScene render as point clouds (soft round sprites,
// vertex colors, no scene lighting), and in light theme their colors are
// deliberately NOT the same `light` variant above. That variant is
// pale-and-near-white on purpose, tuned so `treble` crosses the
// postprocessing Bloom luminance threshold against a *solid* fill — but a
// sparse field of 1-2px points has nowhere near enough pixel coverage for
// that same trick to read as anything but "washed out and blended into the
// background" (which is exactly what both scenes looked like before they
// switched to this). Point clouds instead lean on their own manual additive
// glow layer, which works off actual color saturation, not postprocessing
// luminance — so it wants dark, saturated colors that contrast against the
// light background directly, the same way the dark theme's bright colors
// contrast against its near-black background, just inverted. (In dark
// theme this returns the exact same colors as `getPalette` — the two only
// diverge for light theme.)
export function getParticleColors(scheme: ColorScheme, theme: SystemTheme): OrbAccent {
  const { dark, orbLight } = SCHEME_VARIANTS[scheme];
  return theme === "light" ? orbLight : dark;
}

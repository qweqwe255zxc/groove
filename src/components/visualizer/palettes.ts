import type { ColorScheme } from "@/store/useAppStore";

export type Palette = {
  label: string;
  bass: string;
  treble: string;
  background: string;
};

export const PALETTES: Record<ColorScheme, Palette> = {
  mono: { label: "Mono", bass: "#f2ede4", treble: "#8f8a80", background: "#08070a" },
  clay: { label: "Clay", bass: "#c17a52", treble: "#f2ede4", background: "#100e0c" },
  sage: { label: "Sage", bass: "#8ba888", treble: "#e7e2d3", background: "#0d120e" },
  neon: { label: "Neon", bass: "#ff5d73", treble: "#4dd0e1", background: "#08050c" },
};

import { create } from "zustand";
import type { Flip } from "gsap/Flip";
import type { Album, Track } from "@/lib/itunes";

export type VisualizerMode = "orb" | "terrain";
export type ColorScheme = "clay" | "mono" | "sage" | "neon";
// "system" defers to prefers-color-scheme (see useResolvedTheme); "light"/
// "dark" is an explicit user override of it, set via ThemeToggle.
export type ThemePreference = "system" | "light" | "dark";

type AppState = {
  query: string;
  albums: Album[];
  status: "idle" | "loading" | "error";

  selectedAlbum: Album | null;
  tracks: Track[];
  activeTrack: Track | null;
  // Captured by AlbumCard right before selectAlbum() so VinylPanel can
  // Flip.from() it once its own element has mounted in its final layout.
  pendingFlipState: Flip.FlipState | null;

  isPlaying: boolean;
  isVisualizerOpen: boolean;
  visualizerMode: VisualizerMode;

  sensitivity: number;
  colorScheme: ColorScheme;
  themePreference: ThemePreference;
  ambientMuted: boolean;
  // The active track's own volume (0-1), set via VisualizerStage's volume
  // slider — separate from the play/pause fade tweens, which animate el.volume
  // toward this value rather than a hardcoded 1.
  volume: number;

  isMenuOpen: boolean;
  introComplete: boolean;

  setQuery: (query: string) => void;
  setAlbums: (albums: Album[]) => void;
  setStatus: (status: AppState["status"]) => void;
  selectAlbum: (album: Album | null) => void;
  setTracks: (tracks: Track[]) => void;
  setPendingFlipState: (state: Flip.FlipState | null) => void;
  playTrack: (track: Track) => void;
  // Same as playTrack but leaves isPlaying false — used by the /v deep-link
  // route, which opens straight into the visualizer on page load. Autoplay
  // requires a real user gesture (see the crossOrigin/AudioContext gotcha
  // in CLAUDE.md); a cold page load has none, so el.play() would just be
  // silently blocked while isPlaying claimed the track was already playing.
  // Landing paused with the Play button visible is honest about needing
  // that first click.
  openTrack: (track: Track) => void;
  togglePlaying: (playing?: boolean) => void;
  closeVisualizer: () => void;
  setVisualizerMode: (mode: VisualizerMode) => void;
  setSensitivity: (value: number) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  setThemePreference: (preference: ThemePreference) => void;
  toggleAmbientMuted: () => void;
  setAmbientMuted: (muted: boolean) => void;
  setVolume: (value: number) => void;
  setMenuOpen: (open: boolean) => void;
  setIntroComplete: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  query: "",
  albums: [],
  status: "idle",

  selectedAlbum: null,
  tracks: [],
  activeTrack: null,
  pendingFlipState: null,

  isPlaying: false,
  isVisualizerOpen: false,
  visualizerMode: "orb",

  sensitivity: 1,
  colorScheme: "mono",
  themePreference: "system",
  ambientMuted: false,
  volume: 1,

  isMenuOpen: false,
  introComplete: false,

  setQuery: (query) => set({ query }),
  setAlbums: (albums) => set({ albums }),
  setStatus: (status) => set({ status }),
  selectAlbum: (album) =>
    set({ selectedAlbum: album, tracks: [], activeTrack: null, isPlaying: false }),
  setTracks: (tracks) => set({ tracks }),
  setPendingFlipState: (pendingFlipState) => set({ pendingFlipState }),
  playTrack: (track) =>
    set({ activeTrack: track, isPlaying: true, isVisualizerOpen: true }),
  openTrack: (track) =>
    set({ activeTrack: track, isPlaying: false, isVisualizerOpen: true }),
  togglePlaying: (playing) =>
    set((state) => ({ isPlaying: playing ?? !state.isPlaying })),
  closeVisualizer: () =>
    set({ isVisualizerOpen: false, isPlaying: false }),
  setVisualizerMode: (visualizerMode) => set({ visualizerMode }),
  setSensitivity: (sensitivity) => set({ sensitivity }),
  setColorScheme: (colorScheme) => set({ colorScheme }),
  setThemePreference: (themePreference) => set({ themePreference }),
  toggleAmbientMuted: () => set((state) => ({ ambientMuted: !state.ambientMuted })),
  setAmbientMuted: (ambientMuted) => set({ ambientMuted }),
  setVolume: (volume) => set({ volume }),
  setMenuOpen: (isMenuOpen) => set({ isMenuOpen }),
  setIntroComplete: () => set({ introComplete: true }),
}));

import { create } from "zustand";
import type { Flip } from "gsap/Flip";
import type { Album, Track } from "@/lib/itunes";

export type VisualizerMode = "orb" | "terrain";
export type ColorScheme = "clay" | "mono" | "sage" | "neon";

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

  isMenuOpen: boolean;
  introComplete: boolean;

  setQuery: (query: string) => void;
  setAlbums: (albums: Album[]) => void;
  setStatus: (status: AppState["status"]) => void;
  selectAlbum: (album: Album | null) => void;
  setTracks: (tracks: Track[]) => void;
  setPendingFlipState: (state: Flip.FlipState | null) => void;
  playTrack: (track: Track) => void;
  togglePlaying: (playing?: boolean) => void;
  closeVisualizer: () => void;
  setVisualizerMode: (mode: VisualizerMode) => void;
  setSensitivity: (value: number) => void;
  setColorScheme: (scheme: ColorScheme) => void;
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
  togglePlaying: (playing) =>
    set((state) => ({ isPlaying: playing ?? !state.isPlaying })),
  closeVisualizer: () =>
    set({ isVisualizerOpen: false, isPlaying: false }),
  setVisualizerMode: (visualizerMode) => set({ visualizerMode }),
  setSensitivity: (sensitivity) => set({ sensitivity }),
  setColorScheme: (colorScheme) => set({ colorScheme }),
  setMenuOpen: (isMenuOpen) => set({ isMenuOpen }),
  setIntroComplete: () => set({ introComplete: true }),
}));

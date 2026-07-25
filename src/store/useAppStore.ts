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
  musicMuted: boolean;
  // The active track's own volume (0-1), set via VisualizerStage's volume
  // slider — separate from the play/pause fade tweens, which animate el.volume
  // toward this value rather than a hardcoded 1.
  volume: number;

  isMenuOpen: boolean;
  introComplete: boolean;

  // Set by playLocalTrack() when a picked file fails validation (too large,
  // not audio) or by VisualizerStage's <audio onError> when a file that
  // passed validation still can't actually be decoded (corrupt / codec the
  // browser doesn't support) — UploadTrackButton surfaces whichever is set.
  localTrackError: string | null;
  setLocalTrackError: (error: string | null) => void;

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
  // Loads a user-picked audio file straight into the visualizer, bypassing
  // the album/track flow entirely (no selectedAlbum, no iTunes lookup) —
  // TrackMeta and the share/history effect in VisualizerStage both branch on
  // `selectedAlbum` being null to treat this as a local track.
  playLocalTrack: (file: File) => void;
  togglePlaying: (playing?: boolean) => void;
  closeVisualizer: () => void;
  setVisualizerMode: (mode: VisualizerMode) => void;
  setSensitivity: (value: number) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  setThemePreference: (preference: ThemePreference) => void;
  toggleMusicMuted: () => void;
  setMusicMuted: (muted: boolean) => void;
  setVolume: (value: number) => void;
  setMenuOpen: (open: boolean) => void;
  setIntroComplete: () => void;
};

// Object URL of the currently (or most recently) loaded local file, tracked
// outside the store since it's cleanup bookkeeping rather than render state —
// revoked whenever a new one is created so repeated uploads don't leak.
let activeLocalObjectUrl: string | null = null;
let localTrackIdCounter = -1;

// Generous for a single track (a 10-minute FLAC is still well under this)
// but enough to stop an accidental multi-hundred-MB pick (a video file, a
// whole album folder zipped) from loading straight into memory as a blob.
const MAX_LOCAL_FILE_BYTES = 100 * 1024 * 1024;

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
  musicMuted: false,
  volume: .5,

  isMenuOpen: false,
  introComplete: false,

  localTrackError: null,
  setLocalTrackError: (localTrackError) => set({ localTrackError }),

  setQuery: (query) => set({ query }),
  setAlbums: (albums) => set({ albums }),
  setStatus: (status) => set({ status }),
  selectAlbum: (album) =>
    set({ selectedAlbum: album, tracks: [], activeTrack: null, isPlaying: false }),
  setTracks: (tracks) => set({ tracks }),
  setPendingFlipState: (pendingFlipState) => set({ pendingFlipState }),
  playTrack: (track) =>
    set({ activeTrack: track, isPlaying: true, isVisualizerOpen: true, localTrackError: null }),
  openTrack: (track) =>
    set({ activeTrack: track, isPlaying: false, isVisualizerOpen: true, localTrackError: null }),
  playLocalTrack: (file) => {
    // Empty `type` isn't necessarily a bad file — Safari in particular
    // leaves it blank for some containers (e.g. .flac) it can still decode
    // just fine — so this only rejects a *confirmed* non-audio type, not an
    // unknown one. A file that's still bad despite passing this (corrupt
    // bytes, a codec the browser can't decode) gets caught later by the
    // <audio onError> handler in VisualizerStage instead.
    if (file.type && !file.type.startsWith("audio/")) {
      set({ localTrackError: `"${file.name}" doesn't look like an audio file.` });
      return;
    }
    if (file.size > MAX_LOCAL_FILE_BYTES) {
      set({
        localTrackError: `"${file.name}" is too large (max ${Math.floor(MAX_LOCAL_FILE_BYTES / (1024 * 1024))}MB).`,
      });
      return;
    }

    if (activeLocalObjectUrl) URL.revokeObjectURL(activeLocalObjectUrl);
    const url = URL.createObjectURL(file);
    activeLocalObjectUrl = url;
    set({
      selectedAlbum: null,
      tracks: [],
      activeTrack: {
        trackId: localTrackIdCounter--,
        trackName: file.name.replace(/\.[^/.]+$/, ""),
        trackNumber: 0,
        previewUrl: url,
        durationMs: 0,
      },
      isPlaying: true,
      isVisualizerOpen: true,
      localTrackError: null,
    });
  },
  togglePlaying: (playing) =>
    set((state) => ({ isPlaying: playing ?? !state.isPlaying })),
  // Closing is the only way out of a local track (there's no "resume"
  // affordance for one, unlike an iTunes track's VinylPanel) — safe to
  // revoke its object URL here rather than waiting for the next upload to
  // do it, so a track left open in a background tab doesn't hold its blob
  // in memory indefinitely.
  closeVisualizer: () =>
    set((state) => {
      if (activeLocalObjectUrl && state.activeTrack?.previewUrl === activeLocalObjectUrl) {
        URL.revokeObjectURL(activeLocalObjectUrl);
        activeLocalObjectUrl = null;
      }
      return { isVisualizerOpen: false, isPlaying: false };
    }),
  setVisualizerMode: (visualizerMode) => set({ visualizerMode }),
  setSensitivity: (sensitivity) => set({ sensitivity }),
  setColorScheme: (colorScheme) => set({ colorScheme }),
  setThemePreference: (themePreference) => set({ themePreference }),
  toggleMusicMuted: () => set((state) => ({ musicMuted: !state.musicMuted })),
  setMusicMuted: (musicMuted) => set({ musicMuted }),
  setVolume: (volume) => set({ volume }),
  setMenuOpen: (isMenuOpen) => set({ isMenuOpen }),
  setIntroComplete: () => set({ introComplete: true }),
}));

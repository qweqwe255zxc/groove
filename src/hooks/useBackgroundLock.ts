import { useAppStore } from "@/store/useAppStore";

/**
 * True whenever a fullscreen overlay (intro loader, nav menu, vinyl detail
 * panel, or visualizer) is covering the page. Drives both the Lenis/native
 * scroll lock and `inert` on the background content — kept in one place so
 * a future overlay can't update one without the other.
 */
export function useBackgroundLock(): boolean {
  const introComplete = useAppStore((s) => s.introComplete);
  const isMenuOpen = useAppStore((s) => s.isMenuOpen);
  const isVisualizerOpen = useAppStore((s) => s.isVisualizerOpen);
  const hasSelectedAlbum = useAppStore((s) => s.selectedAlbum !== null);

  return !introComplete || isMenuOpen || isVisualizerOpen || hasSelectedAlbum;
}

"use client";

import { useAppStore } from "@/store/useAppStore";
import GrooveMark from "./GrooveMark";
import HashLink from "./HashLink";

export default function SiteHeader() {
  const isMenuOpen = useAppStore((s) => s.isMenuOpen);
  const isVisualizerOpen = useAppStore((s) => s.isVisualizerOpen);
  const hasSelectedAlbum = useAppStore((s) => s.selectedAlbum !== null);
  const setMenuOpen = useAppStore((s) => s.setMenuOpen);

  // Both the visualizer and the vinyl panel are fullscreen overlays that sit
  // BELOW this header's z-50 (visualizer is z-50 itself but hides the header
  // outright; the vinyl panel is z-30) — without hiding it here too, the
  // header keeps floating on top and silently swallows clicks meant for
  // "click outside the vinyl panel to close it," since the header's own
  // logo/menu-toggle actions have nothing to do with that panel.
  if (isVisualizerOpen || hasSelectedAlbum) return null;

  return (
    // Fixed white text/bars, not text-fg/bg-fg — mix-blend-difference only
    // inverts cleanly against whatever's underneath (hero art, the opaque
    // menu backdrop, either theme) when the source itself is white. Theme-fg
    // flips dark in light mode, which broke the invert into a washed-out gray.
    <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-5 text-white mix-blend-difference sm:px-10">
      <HashLink
        href="#top"
        className="-m-2 flex items-center gap-2 p-2 font-display text-lg italic tracking-tight"
      >
        <GrooveMark variant="cutout" className="h-5 w-5" />
        groove
      </HashLink>

      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => setMenuOpen(!isMenuOpen)}
          className="-m-2 flex items-center gap-3 p-2 text-xs uppercase tracking-[0.2em] cursor-pointer"
          aria-expanded={isMenuOpen}
        >
          <span>{isMenuOpen ? "Close" : "Menu"}</span>
          <span className="relative block h-3 w-6">
            <span
              className={`absolute left-0 top-0 h-px w-6 bg-white transition-transform duration-300 ${
                isMenuOpen ? "translate-y-[6px] rotate-45" : ""
              }`}
            />
            <span
              className={`absolute left-0 bottom-0 h-px w-6 bg-white transition-transform duration-300 ${
                isMenuOpen ? "-translate-y-[6px] -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </div>
    </header>
  );
}

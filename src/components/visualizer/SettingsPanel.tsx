"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useAppStore, type ColorScheme } from "@/store/useAppStore";
import type { SystemTheme } from "@/hooks/useSystemTheme";
import { getParticleColors, getPalette } from "./palettes";

const SCHEMES: ColorScheme[] = ["mono", "clay", "sage", "neon"];

export default function SettingsPanel({
  theme,
}: {
  theme: SystemTheme;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sensitivity = useAppStore((s) => s.sensitivity);
  const setSensitivity = useAppStore((s) => s.setSensitivity);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const setColorScheme = useAppStore((s) => s.setColorScheme);

  // Mirrors VisualizerStage's handleClose: animate the panel out first,
  // only flip `open` (which actually unmounts it) once the tween finishes —
  // an instant unmount on outside-click/Escape/toggle would skip the close
  // animation entirely.
  const handleClose = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) {
      setOpen(false);
      return;
    }
    gsap.to(panel, {
      autoAlpha: 0,
      y: 8,
      scale: 0.96,
      duration: 0.18,
      ease: "power2.in",
      onComplete: () => setOpen(false),
    });
  }, []);

  // Dropdown-style panel: clicking anywhere outside it (not just the
  // toggle button) should close it, same expectation as VinylPanel's
  // backdrop click.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) handleClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    // Capture phase: this dropdown should close on its own Escape press
    // without also closing the fullscreen visualizer behind it in the same
    // keystroke — stopping propagation here keeps that listener from firing.
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, handleClose]);

  // Entrance animation — grows out of the toggle button rather than
  // popping in instantly.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    gsap.fromTo(
      panel,
      { autoAlpha: 0, y: 8, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.22, ease: "power3.out" }
    );
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Absolutely positioned rather than a flex sibling of the toggle
          button below: as a normal-flow sibling, this panel's own width
          (256px open vs. 0 closed) changed the width of the row it sits in
          (VisualizerStage's bottom-right control row, alongside
          VolumeSlider) — that row is right-anchored, so growing it pushed
          VolumeSlider left every time this opened. Taking it out of flow
          entirely means opening/closing this never resizes anything else. */}
      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-full right-0 mb-3 w-64 origin-bottom-right rounded-2xl border border-line bg-surface/90 p-5 backdrop-blur-sm"
        >
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted">
              <span>Bass sensitivity</span>
              <span>{sensitivity.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.1}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-muted">
              Palette
            </div>
            <div className="flex gap-2">
              {SCHEMES.map((key) => {
                const palette = getPalette(key, theme);
                // Neither scene actually renders `getPalette`'s bass/treble
                // — both are point clouds and draw from `getParticleColors`
                // instead (see the comment on that function in palettes.ts).
                // A swatch built from the wrong pair looks like a settings
                // bug the moment you compare it against what's on screen.
                const swatch = getParticleColors(key, theme);
                const isActive = key === colorScheme;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setColorScheme(key)}
                    aria-label={palette.label}
                    aria-pressed={isActive}
                    className="-m-1.5 cursor-pointer rounded-full p-1.5"
                  >
                    <span
                      className={`block h-9 w-9 rounded-full border-2 transition-transform ${
                        isActive ? "border-fg scale-110" : "border-line"
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${swatch.bass}, ${swatch.treble})`,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => (open ? handleClose() : setOpen(true))}
        className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
        aria-expanded={open}
      >
        Settings
      </button>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useAppStore, type ColorScheme } from "@/store/useAppStore";
import type { SystemTheme } from "@/hooks/useSystemTheme";
import { useGsapClose } from "@/hooks/useGsapClose";
import { getParticleColors, getPalette } from "./palettes";
import { PILL_BUTTON } from "./controlStyles";

const SCHEMES: ColorScheme[] = ["mono", "clay", "sage", "neon"];

/**
 * One labelled, full-width row in this panel. Both sliders go through it so
 * they can't drift apart: volume used to be a compact icon-plus-track pill
 * sitting next to a full-width sensitivity track, which read as two
 * unrelated controls that happened to share a panel.
 *
 * `.range-slider` (globals.css) rather than a native `accent-color` input,
 * matching the seek bar — its --range-progress is a unitless 0–1 fraction of
 * the way along the track, not a percentage, so each caller's own min/max
 * has to be normalised into that here.
 */
function PanelSlider({
  label,
  readout,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  readout: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted">
        <span>{label}</span>
        <span className="tabular-nums">{readout}</span>
      </div>
      {/* step="any" for the same reason the seek bar uses it: a native thumb
          snaps to its step, so sensitivity's old step of 0.1 gave the whole
          0.5–2.5 range just 20 stops — about 11px apart on this track, which
          under a dragging finger reads as the thumb stuttering rather than
          following. Neither value needs quantising; the readouts round for
          display on their own. */}
      <input
        type="range"
        min={min}
        max={max}
        step="any"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={readout}
        className="range-slider"
        style={
          {
            "--range-progress": String((value - min) / (max - min)),
          } as React.CSSProperties
        }
      />
    </div>
  );
}

export default function SettingsPanel({
  theme,
  volume,
  onVolumeChange,
}: {
  theme: SystemTheme;
  // Passed down rather than read from the store: setting the store's
  // `volume` alone doesn't move the audio element — VisualizerStage's
  // handleVolumeChange writes `el.volume` directly too, for the reason
  // documented on it there (the fade effect can't depend on `volume`).
  volume: number;
  onVolumeChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sensitivity = useAppStore((s) => s.sensitivity);
  const setSensitivity = useAppStore((s) => s.setSensitivity);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const setColorScheme = useAppStore((s) => s.setColorScheme);

  const handlePanelClosed = useCallback(() => setOpen(false), []);
  const animateClose = useGsapClose(panelRef, handlePanelClosed);
  const handleClose = useCallback(() => {
    animateClose({ autoAlpha: 0, y: 8, scale: 0.96, duration: 0.18, ease: "power2.in" });
  }, [animateClose]);

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
          (256px open vs. 0 closed) changed the width of the row it sits in,
          shoving its neighbours sideways every time it opened. Taking it out
          of flow entirely means opening/closing this never resizes
          anything else. */}
      {open && (
        <div
          ref={panelRef}
          /* min() rather than a flat w-64: the panel is right-anchored to a
             button that already sits at the viewport edge, so on a 320px
             screen a fixed 16rem would have nowhere left to go. */
          className="absolute bottom-full right-0 mb-3 w-[min(16rem,calc(100vw-2rem))] origin-bottom-right rounded-2xl border border-line bg-surface/90 p-5 backdrop-blur-sm"
        >
          <PanelSlider
            label="Volume"
            readout={`${Math.round(volume * 100)}%`}
            min={0}
            max={1}
            value={volume}
            onChange={onVolumeChange}
          />

          <PanelSlider
            label="Bass sensitivity"
            readout={`${sensitivity.toFixed(1)}×`}
            min={0.5}
            max={2.5}
            value={sensitivity}
            onChange={setSensitivity}
          />

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
        className={PILL_BUTTON}
        aria-expanded={open}
      >
        Settings
      </button>
    </div>
  );
}

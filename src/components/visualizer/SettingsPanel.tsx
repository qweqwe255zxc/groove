"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore, type ColorScheme } from "@/store/useAppStore";
import { PALETTES } from "./palettes";

const SCHEMES: ColorScheme[] = ["mono", "clay", "sage", "neon"];

export default function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sensitivity = useAppStore((s) => s.sensitivity);
  const setSensitivity = useAppStore((s) => s.setSensitivity);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const setColorScheme = useAppStore((s) => s.setColorScheme);

  // Dropdown-style panel: clicking anywhere outside it (not just the
  // toggle button) should close it, same expectation as VinylPanel's
  // backdrop click.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
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
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-6 right-6 flex flex-col items-end gap-3 sm:bottom-10 sm:right-10"
    >
      {open && (
        <div className="w-64 rounded-2xl border border-line bg-surface/90 p-5 backdrop-blur-sm">
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
                const palette = PALETTES[key];
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
                        background: `linear-gradient(135deg, ${palette.bass}, ${palette.treble})`,
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
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.2em] text-fg transition-colors hover:border-fg cursor-pointer"
        aria-expanded={open}
      >
        Settings
      </button>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import gsap from "gsap";
import { useGsapClose } from "./useGsapClose";

/**
 * The open/close behaviour behind the visualizer's bottom-row dropdowns
 * (SettingsPanel, TrackListPanel): grow-out-of-the-button entrance, animated
 * close, dismiss on an outside press or Escape.
 *
 * Extracted when the second one arrived rather than copied — the pieces that
 * are easy to get subtly wrong (closing through useGsapClose so the panel
 * animates before it unmounts, and the capture-phase Escape below) would
 * have been the pieces most likely to drift between the two.
 *
 * Two of these can be mounted side by side: opening one presses outside the
 * other, which the outside-press handler already treats as a dismiss, so
 * they close each other without knowing about each other.
 */
export function useDropdown(
  containerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>
) {
  const [open, setOpen] = useState(false);

  const handleClosed = useCallback(() => setOpen(false), []);
  const animateClose = useGsapClose(panelRef, handleClosed);
  const close = useCallback(() => {
    animateClose({ autoAlpha: 0, y: 8, scale: 0.96, duration: 0.18, ease: "power2.in" });
  }, [animateClose]);
  const toggle = useCallback(() => {
    if (open) close();
    else setOpen(true);
  }, [open, close]);

  // Dropdown-style panel: pressing anywhere outside it (not just the toggle
  // button) should close it, same expectation as VinylPanel's backdrop.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) close();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    // Capture phase: a dropdown should close on its own Escape press without
    // also closing the fullscreen visualizer behind it in the same keystroke
    // — stopping propagation here keeps that listener from firing.
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, close, containerRef]);

  // Entrance animation — grows out of the toggle button rather than popping
  // in instantly.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    gsap.fromTo(
      panel,
      { autoAlpha: 0, y: 8, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.22, ease: "power3.out" }
    );
  }, [open, panelRef]);

  return { open, close, toggle };
}

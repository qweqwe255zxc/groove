"use client";

import { useEffect } from "react";
import { useAppStore, type ThemePreference } from "@/store/useAppStore";

const STORAGE_KEY = "groove-theme-preference";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark";
}

// Mounted once in layout.tsx. Owns two jobs no component-local effect could:
// (1) restore a saved override from localStorage on first load — deferred to
// a microtask rather than a synchronous setState at the top of the effect
// body, same rule as LiveClock/VinylPanel elsewhere in this codebase; (2)
// keep `<html data-theme>` in sync with the store so globals.css's
// `:root[data-theme]` rules (see the comment there) can override the OS
// `prefers-color-scheme` media query in either direction — the CSS custom
// properties driving the whole site's look have no other way to hear about
// a manual choice made through ThemeToggle.
export default function ThemeEffect() {
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isThemePreference(stored)) {
      Promise.resolve().then(() => setThemePreference(stored));
    }
    // Restore once, on mount only — subsequent preference changes are the
    // user acting through ThemeToggle, not something to re-read from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (themePreference === "system") {
      delete document.documentElement.dataset.theme;
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      document.documentElement.dataset.theme = themePreference;
      window.localStorage.setItem(STORAGE_KEY, themePreference);
    }
  }, [themePreference]);

  return null;
}

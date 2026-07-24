"use client";

import { useSystemTheme, type SystemTheme } from "./useSystemTheme";
import { useAppStore } from "@/store/useAppStore";

// Every themed piece of the app (CSS variables via ThemeEffect, the
// visualizer scenes, SettingsPanel, ThemeToggle's own label) should read
// this instead of useSystemTheme directly — it's the single place that
// combines the OS-detected theme with ThemeToggle's manual override.
export function useResolvedTheme(): SystemTheme {
  const systemTheme = useSystemTheme();
  const themePreference = useAppStore((s) => s.themePreference);
  return themePreference === "system" ? systemTheme : themePreference;
}

// Theme bootstrap (epic #533 design-system foundation).
//
// Theme is a DEVICE preference — "this browser prefers the light theme" —
// not project data, so it is deliberately NOT routed through
// lib/draftPersistence.ts (which persists the working copy / survey
// session). lib/i18n.ts's locale choice is the precedent: same
// localStorage-key-plus-guard idiom, same "never throw, harmless fallback"
// contract, same "static default painted before JS runs, then possibly
// corrected" boot sequence — index.html hardcodes `data-theme="navy"` on
// <html> so the default theme paints with zero FOUC, and this module only
// needs to *change* that attribute when a saved non-default choice exists.
import { loadSavedValue, saveSavedValue } from "./storageGuard.ts";

export type AppTheme = "light" | "navy";

export const DEFAULT_THEME: AppTheme = "navy";

/** localStorage key for the persisted theme choice. */
const THEME_KEY = "ks.theme";

function isAppTheme(value: string): value is AppTheme {
  return value === "light" || value === "navy";
}

/** The persisted theme choice, or null if none / invalid / unavailable. */
export function loadSavedTheme(): AppTheme | null {
  return loadSavedValue(THEME_KEY, isAppTheme);
}

/** Persist the choice — durable across reloads. */
export function saveTheme(theme: AppTheme): void {
  saveSavedValue(THEME_KEY, theme);
}

/** Paint the theme by setting `data-theme` on the document root. */
export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
}

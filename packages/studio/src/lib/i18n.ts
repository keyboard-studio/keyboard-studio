// i18n bootstrap (Lingui spike).
//
// English is bundled synchronously (static import) so it is always available
// as a fallback; a non-English persisted/detected locale is then fetched
// async and awaited by main.tsx before first paint (T039), so the fallback
// that matters isn't "renders before the fetch" but "renders English if the
// fetch never resolves" — see localeReady below. The `?lingui` suffix makes
// @lingui/vite-plugin compile the JSON catalog to a runtime Messages object at
// import time. Message ids are explicit and stable — see WelcomeScreen.tsx.
import { i18n } from "@lingui/core";
import { messages as enMessages } from "../locales/en/messages.json?lingui";
import { storageAvailable } from "./storageGuard.ts";
import { activateContentLocale } from "./contentI18n.ts";

export const SUPPORTED_LOCALES = { en: "English", fr: "Français" } as const;
export type Locale = keyof typeof SUPPORTED_LOCALES;
export const DEFAULT_LOCALE: Locale = "en";

/** localStorage key for the persisted UI-locale choice. */
const LOCALE_KEY = "ks.locale";

function isSupported(value: string): value is Locale {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_LOCALES, value);
}

/** The persisted locale choice, or null if none / invalid / unavailable. */
export function loadSavedLocale(): Locale | null {
  if (!storageAvailable()) return null;
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return v !== null && isSupported(v) ? v : null;
  } catch {
    return null;
  }
}

/** Persist the choice — durable across reloads and the OAuth sign-in round trip. */
export function saveLocale(locale: Locale): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Quota / private-mode — re-detecting next boot is a harmless fallback.
  }
}

/**
 * Resolve a BCP47 tag against SUPPORTED_LOCALES: the exact tag first (so a
 * future region entry like `pt-BR` matches directly), then its base-language
 * subtag (`pt-BR` -> `pt`), else null. Adding a region locale is then just a
 * SUPPORTED_LOCALES entry + catalog files — no resolver change (SC-004).
 */
function resolveSupportedTag(tag: string): Locale | null {
  const lower = tag.toLowerCase();
  if (isSupported(lower)) return lower;
  const primary = lower.split("-")[0];
  return primary !== undefined && isSupported(primary) ? primary : null;
}

/** Best-effort match of the browser's preferred language to a supported locale. */
function detectBrowserLocale(): Locale {
  try {
    const lang =
      typeof navigator !== "undefined" ? (navigator.language ?? "") : "";
    return resolveSupportedTag(lang) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Saved choice wins; else detect from the browser; else English. */
export function resolveInitialLocale(): Locale {
  return loadSavedLocale() ?? detectBrowserLocale();
}

/**
 * Switch the active UI locale, lazily loading its catalog on first use.
 * Loads the Tier B content-i18n sidecar catalogs (spec 046 T028) in parallel
 * with the Tier A chrome catalog — same lazy/code-split treatment (D6),
 * same never-block-on-failure contract (activateContentLocale swallows a
 * missing/404'd catalog per type rather than rejecting).
 */
export async function activateLocale(locale: Locale): Promise<void> {
  if (locale !== DEFAULT_LOCALE) {
    const [{ messages }] = await Promise.all([
      import(`../locales/${locale}/messages.json?lingui`),
      activateContentLocale(locale),
    ]);
    i18n.load(locale, messages);
  }
  i18n.activate(locale);
}

// Bootstrap: load + activate English synchronously (always-available
// fallback) so `i18n` is usable the instant this module evaluates, then apply
// the persisted/detected locale. `localeReady` resolves once that locale (if
// non-English) has finished loading, so callers that await it before their
// first render never show an English flash (T039) — main.tsx does this.
// A failed catalog fetch (chunk 404 after a deploy, transient network error,
// …) must NOT block that first render: English is already active, so
// localeReady always resolves — it swallows the rejection and stays on the
// English fallback rather than propagating a boot-blocking rejection.
i18n.load(DEFAULT_LOCALE, enMessages);
i18n.activate(DEFAULT_LOCALE);

const initialLocale = resolveInitialLocale();
export const localeReady: Promise<void> =
  initialLocale !== DEFAULT_LOCALE
    ? activateLocale(initialLocale).catch(() => {
        // English stays active (already loaded above) — a harmless fallback,
        // same as this used to fail silently before T039 awaited it.
      })
    : Promise.resolve();

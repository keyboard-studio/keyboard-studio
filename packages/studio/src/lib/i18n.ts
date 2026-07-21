// i18n bootstrap (Lingui spike).
//
// English is bundled synchronously (static import) so first paint never blocks
// on a fetch and there is always a fallback; the persisted/detected locale is
// then applied (async for non-source locales). The `?lingui` suffix makes
// @lingui/vite-plugin compile the JSON catalog to a runtime Messages object at
// import time. Message ids are explicit and stable — see WelcomeScreen.tsx.
import { i18n } from "@lingui/core";
import { messages as enMessages } from "../locales/en/messages.json?lingui";
import { storageAvailable } from "./storageGuard.ts";

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

/** Best-effort match of the browser's preferred language to a supported locale. */
function detectBrowserLocale(): Locale {
  try {
    const lang =
      typeof navigator !== "undefined" ? (navigator.language ?? "") : "";
    const primary = lang.toLowerCase().split("-")[0];
    return primary !== undefined && isSupported(primary)
      ? primary
      : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Saved choice wins; else detect from the browser; else English. */
export function resolveInitialLocale(): Locale {
  return loadSavedLocale() ?? detectBrowserLocale();
}

/** Switch the active UI locale, lazily loading its catalog on first use. */
export async function activateLocale(locale: Locale): Promise<void> {
  if (locale !== DEFAULT_LOCALE) {
    const { messages } = await import(
      `../locales/${locale}/messages.json?lingui`
    );
    i18n.load(locale, messages);
  }
  i18n.activate(locale);
}

// Bootstrap: load + activate English synchronously (always-available fallback),
// then apply the persisted/detected locale. For a non-English returning visitor
// the target catalog loads async, so first paint may briefly show English before
// switching — acceptable at this stage.
i18n.load(DEFAULT_LOCALE, enMessages);
i18n.activate(DEFAULT_LOCALE);

const initialLocale = resolveInitialLocale();
if (initialLocale !== DEFAULT_LOCALE) {
  void activateLocale(initialLocale);
}

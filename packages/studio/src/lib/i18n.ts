// i18n bootstrap (Lingui spike).
//
// English is bundled synchronously (static import) so first paint never blocks
// on a fetch; other locales are code-split and pulled in on demand via
// activateLocale(). The `?lingui` suffix makes @lingui/vite-plugin compile the
// JSON catalog to a runtime Messages object at import time. Message ids are
// explicit and stable — see WelcomeScreen.tsx for the authoring pattern.
import { i18n } from "@lingui/core";
import { messages as enMessages } from "../locales/en/messages.json?lingui";

export const SUPPORTED_LOCALES = { en: "English", fr: "Français" } as const;
export type Locale = keyof typeof SUPPORTED_LOCALES;
export const DEFAULT_LOCALE: Locale = "en";

i18n.load(DEFAULT_LOCALE, enMessages);
i18n.activate(DEFAULT_LOCALE);

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

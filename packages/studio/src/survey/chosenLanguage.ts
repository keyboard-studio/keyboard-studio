// chosenLanguage — what the language chooser reports beyond a langtags summary
// (spec 115 R12, R14, R15). A pick of a language that langtags does not index (a
// typed code, an unlisted language, a Glottolog language with no ISO code), or one
// that carries a proposed script or region, travels through the same
// `onEntryResolved` channel as a summary, with these extras riding on it. The
// identity resolution records them as `default` proposals; the chooser never
// writes another question's decision as an answer (FR-047).

import type { LanguageSummary } from "@keyboard-studio/contracts";

export interface ChosenExtras {
  /** The Glottolog code of a language with no ISO code (`language-glottocode`, FR-045). */
  glottocode?: string;
  /** A region to propose at `il_language_region`; its presence routes that question (FR-047). */
  region?: { code: string; source: string };
  /** A script to propose at `il_target_script`, with where it came from (FR-046). */
  script?: { script: string; source: string };
}

/** A language summary with the chooser's extras. A plain `LanguageSummary` is the same type without them. */
export type ChosenSummary = LanguageSummary & { extras?: ChosenExtras };

export function extrasOf(entry: LanguageSummary | null): ChosenExtras | undefined {
  return entry === null ? undefined : (entry as ChosenSummary).extras;
}

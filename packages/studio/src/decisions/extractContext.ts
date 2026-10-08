// Extraction context (spec 087, clarify Q1).
//
// `extract()` receives the whole import bundle: the parsed KeyboardIR plus
// the catalog entry. Language identity lives in catalog metadata (the codec
// leaves the IR header's bcp47 empty on real catalog imports); behavior,
// touch layout, and character inventory live in the IR. Each decision reads
// from whichever holds it.

import type { BaseKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import { getLoadedLangtags } from "../lib/langtagsDefaults.ts";

/**
 * The import bundle every `extract()` probe reads (spec 087 Q1).
 *
 * `ir` is null when parsing failed — every extract then yields absent and
 * the author is asked. `catalog` is null for non-catalog imports.
 */
/**
 * Spec 092 (T036): the live-only Phase F inputs — the RESULTS of the
 * Phase F derivations (`lib/adaptiveDescription.ts`'s prefill,
 * `lib/phaseFSeeds.ts`'s two proposals), computed by the live wiring
 * (`runLiveExtractionFromStores`) from the working-copy store, plus the
 * two identity-derived survey values (`author_contact`, `bcp47_tag`)
 * read from the recorded identity decisions. Absent in the demo runner
 * and in unit tests, where Phase F extracts/defaults resolve to
 * absent — the same result the old seed table produced against an
 * empty store.
 */
export interface PhaseFSeedInputs {
  /**
   * The welcome-paragraph prefill, computed by the wiring from
   * `lib/adaptiveDescription.ts`'s `prefill` — that derivation is
   * engine-backed, and question modules stay engine-free (the standalone
   * content-i18n extractor loads them), so the module's `extract` reads
   * the computed value here rather than calling the derivation itself.
   * The adapter's `requiredWhen` uses the same single derivation.
   */
  welcomePrefill?: string;
  /**
   * `pf_project_url`'s proposal, computed by the wiring from
   * `lib/phaseFSeeds.ts`'s `proposeProjectUrl` over the working-copy
   * slices (G-17). Same pattern as the welcome prefill: question
   * modules import nothing from lib/ (the mutate-seam depcruise rule;
   * the standalone content-i18n extractor loads them), so the module's
   * `extract` reads the computed value here rather than calling the
   * derivation itself.
   */
  projectUrlProposal?: string;
  /**
   * `pf_provenance_basis`'s proposal — `lib/phaseFSeeds.ts`'
   * `proposeProvenanceBasis`, computed by the wiring (G-17), same
   * pattern as `projectUrlProposal`.
   */
  provenanceBasisProposal?: string;
  authorContact?: string;
  bcp47Tag?: string;
}

export interface ExtractContext {
  /** Parsed base keyboard. */
  ir: KeyboardIR | null;
  /**
   * Catalog entry: id, script, languages[], displayName, version.
   * Where language identity lives when the IR does not carry it.
   */
  catalog: BaseKeyboard | null;
  /**
   * Resolves a bare language subtag to its English name via the (lazily
   * loaded) langtags dataset; undefined when not loaded or unknown.
   */
  resolveLanguageName?: (subtag: string) => string | undefined;
  /** Spec 092: Phase F seed inputs (live wiring only — see PhaseFSeedInputs). */
  phaseF?: PhaseFSeedInputs;
  /**
   * Spec 092 (T033): identity lookup inputs — the resolved langtags
   * entry's seed values and the stored author profile, in the exact
   * shapes IdentityLite's seeders used. The il_* modules' lookup defaults
   * read these; absent outside the identity evaluation (the setup pass
   * leaves it unset, so the defaults resolve to absent there).
   */
  identity?: IdentityLookupInputs;
}

/** Spec 092 (T033): see ExtractContext.identity. */
export interface IdentityLookupInputs {
  /** The resolved entry's own-script names; [0] is the autonym default. */
  localNames?: readonly string[];
  /** The resolved entry's language code (ISO 639-3 preferred, else the subtag). */
  languageCode?: string;
  /** The resolved entry's script, as a target-script option value. */
  targetScript?: string;
  /** The Q1 English answer (the autonym fallback when no local name exists). */
  q1English?: string;
  /** The stored author profile; a missing name/email seeds nothing. */
  authorProfile?: { name?: string | null; email?: string | null };
}

/**
 * Build the bundle from the working-copy store's canonical slots
 * (`baseIr`, `baseKeyboard`) — no new store, no new fetch.
 */
export function buildExtractContext(
  baseIr: KeyboardIR | null,
  baseKeyboard: BaseKeyboard | null,
): ExtractContext {
  return {
    ir: baseIr,
    catalog: baseKeyboard,
    resolveLanguageName: (subtag) => {
      const key = subtag.toLowerCase();
      return getLoadedLangtags()
        ?.lookupByName(key)
        .find((l) => l.code.toLowerCase() === key)?.englishName;
    },
  };
}

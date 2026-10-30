// identityResolution — the identity step's language resolution, lifted out of
// IdentityLite (spec 107 FR-040) so the UI and the headless author resolve a
// picked language the same way.
//
// One instance holds what IdentityLite kept in refs for the life of the step:
// the summary the author picked at il_language_english, the full langtags entry
// resolved from it, the own-script / English names that head the autonym
// dropdown, and the lookup inputs the langtags il_* modules' declared
// `lookupDefault`s read (spec 092 T033). The instance is plain state plus
// callbacks; the component keeps one for its lifetime and renders from its
// getters.
//
// Seeds are decision records: this resolution supersedes any previous entry's
// `default` records and re-evaluates the declared lookup defaults against the
// new inputs, so SurveyRunner's record-first seeding renders them.

import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { questionRegistry } from "./questions/registry.ts";
import type { ExtractContext, IdentityLookupInputs } from "../decisions/extractContext.ts";
import { loadLangtags, getLoadedLangtags, scriptToTargetOption } from "../lib/langtagsDefaults.ts";

const SEEDED_QUESTIONS = ["il_language_autonym", "il_language_code", "il_target_script"] as const;

export interface IdentityResolution {
  /** The author selected (entry) or cleared / free-texted (null) a language at il_language_english. */
  onEntryResolved(questionId: string, entry: LanguageSummary | null): void;
  /** An answer was committed (Next): the Q1 name and the region pick feed the seeds. */
  onAnswerCommit(questionId: string, value: string | string[] | undefined): void;
  /** Route il_language_english to the region question only when the picked language is region-ambiguous. */
  nextOverride(questionId: string): string | undefined;
  /** The full langtags entry resolved from the pick (read by the region and code options). */
  resolvedEntry(): LanguageDefaults | null;
  /** Own-script names (primary first) that head the autonym dropdown. */
  localNames(): readonly string[] | undefined;
  /** Alternate English names: the autonym dropdown's fallback when there is no own-script name. */
  englishNames(): readonly string[] | undefined;
}

export function createIdentityResolution(): IdentityResolution {
  // The English name the author entered/picked at Q1 (il_language_english). Used
  // as Q2's FALLBACK own-language name (spec 030 US2) only when langtags has no
  // recorded own-script name for the language, and for free-text languages.
  let q1English = "";
  let localNames: readonly string[] | undefined;
  let englishNames: readonly string[] | undefined;
  // Spec 092 (T033, plan.md G-12): the identity lookup inputs, accumulated
  // across this step's resolutions, in the exact shapes the langtags il_*
  // modules' declared `lookupDefault`s read (ExtractContext.identity).
  let identityInputs: IdentityLookupInputs = {};
  // The search summary the author selected at il_language_english (spec 030 US1).
  // Its `hasRegionVariants` flag decides whether the region step follows.
  let resolvedSummary: LanguageSummary | null = null;
  // The full langtags entry resolved from the selected summary (spec 030 US3).
  let resolvedEntry: LanguageDefaults | null = null;

  // Evaluate the three declared lookup defaults against the accumulated
  // inputs and record each result as a `default` decision record. Write rule
  // (the extraction pass's merge rule, G-12): seed when absent, replace a
  // record this mechanism itself seeded (`default` provenance), and NEVER
  // touch an author-shaped record. Re-evaluating an unchanged snapshot writes
  // nothing.
  function evaluateIdentityDefaults(): void {
    const ctx: ExtractContext = { ir: null, catalog: null, identity: identityInputs };
    const store = useDecisionStore.getState();
    for (const questionId of SEEDED_QUESTIONS) {
      const mod = questionRegistry[questionId];
      if (mod?.lookupDefault === undefined || mod.provides === undefined) continue;
      const dflt = mod.lookupDefault(ctx);
      if (dflt === undefined || dflt.value === undefined || dflt.value === null) continue;
      for (const id of mod.provides) {
        const existing = store.decisions[id];
        if (existing !== undefined && existing.provenance !== "default") continue;
        if (existing !== undefined && existing.value === dflt.value && existing.source === dflt.source) {
          continue;
        }
        store.record({
          id,
          value: dflt.value,
          provenance: "default",
          ...(dflt.source !== undefined ? { source: dflt.source } : {}),
        });
      }
    }
  }

  // Forget the `default` records for the given questions — the replacement
  // half of a re-resolution. Only `default` records are forgotten; an answered
  // question keeps its record (the author owns it).
  function forgetIdentityDefaults(questionIds: readonly string[]): void {
    const store = useDecisionStore.getState();
    for (const questionId of questionIds) {
      const mod = questionRegistry[questionId];
      if (mod?.provides === undefined) continue;
      for (const id of mod.provides) {
        if (store.decisions[id]?.provenance === "default") store.forget(id);
      }
    }
  }

  // Seed the downstream fields from a resolved langtags entry. The dropdown
  // option state stays here; the SEEDS themselves are decision records.
  function seedFromEntry(defaults: LanguageDefaults): void {
    // Own-script names head Q2's dropdown; English/alternate names are the
    // dropdown's fallback only (used when there is no own-script name).
    localNames =
      defaults.localNames !== undefined && defaults.localNames.length > 0 ? defaults.localNames : undefined;
    englishNames =
      defaults.englishNames !== undefined && defaults.englishNames.length > 0 ? defaults.englishNames : undefined;

    forgetIdentityDefaults(SEEDED_QUESTIONS);
    // 3-letter ISO 639-3 code preferred (author's choice), else the bare
    // subtag; absent when the entry carries neither.
    const languageCode =
      defaults.iso639_3 !== undefined && defaults.iso639_3 !== ""
        ? defaults.iso639_3
        : defaults.code !== ""
          ? defaults.code
          : undefined;
    const targetScript = scriptToTargetOption(defaults.defaultScript) ?? undefined;
    const q1 = defaults.englishName ?? (q1English !== "" ? q1English : undefined);
    // The new entry's inputs REPLACE the previous entry's wholesale —
    // destructure the entry-derived keys out first so a field this entry lacks
    // cannot survive from the superseded resolution.
    const {
      localNames: _ln,
      languageCode: _lc,
      targetScript: _ts,
      q1English: _q1,
      ...restInputs
    } = identityInputs;
    identityInputs = {
      ...restInputs,
      ...(defaults.localNames !== undefined && defaults.localNames.length > 0
        ? { localNames: defaults.localNames }
        : {}),
      ...(languageCode !== undefined ? { languageCode } : {}),
      ...(targetScript !== undefined ? { targetScript } : {}),
      ...(q1 !== undefined ? { q1English: q1 } : {}),
    };
    evaluateIdentityDefaults();
  }

  // Reset every resolved-entry-derived seed. Called when the English name is
  // cleared / matches nothing (free text → graceful degradation, FR-003). The
  // autonym is re-evaluated afterwards: with no entry behind it, its declared
  // default falls back to the Q1 English answer itself.
  function clearSeeds(): void {
    localNames = undefined;
    englishNames = undefined;
    resolvedEntry = null;
    forgetIdentityDefaults(SEEDED_QUESTIONS);
    identityInputs = { ...(q1English !== "" ? { q1English } : {}) };
    evaluateIdentityDefaults();
  }

  return {
    onEntryResolved(questionId, entry) {
      if (questionId !== "il_language_english") return;
      resolvedSummary = entry;
      if (entry === null) {
        clearSeeds();
        return;
      }
      const applyDefaults = (mod: NonNullable<ReturnType<typeof getLoadedLangtags>>): void => {
        const defaults = mod.getLanguageDefaults(entry.code);
        if (defaults !== null) {
          resolvedEntry = defaults;
          seedFromEntry(defaults);
        } else {
          clearSeeds();
        }
      };
      // Seed SYNCHRONOUSLY when the module is already loaded. The name picker
      // cannot present a selectable row until it has loaded langtags, so on a
      // real selection the module is present here — applying the seeds now, in
      // the same tick as the selection, guarantees they are set BEFORE the
      // survey auto-advances (advanceOnSelect) and reads them for the next
      // question. An async `.then` would lose that race on the no-region path,
      // silently defaulting Q2 to the English name instead of the local name.
      const loaded = getLoadedLangtags();
      if (loaded !== null) {
        applyDefaults(loaded);
        return;
      }
      // Fallback: module not yet resolved this session (improbable at selection
      // time). Degrade silently on import failure — seeds stay undefined and
      // fields remain free-text (FR-009); no unhandled rejection.
      void loadLangtags()
        .then(applyDefaults)
        .catch(() => {});
    },

    onAnswerCommit(questionId, value) {
      if (questionId === "il_language_english") {
        // Capture the Q1 name so it can seed Q2's default own-language name and
        // head its choice list (spec 030 US2). Works for a picked language and
        // for free text with no langtags match alike. Re-evaluating here is
        // what records the autonym's Q1 fallback for the free-text path (no
        // entry resolution ever fires there); for a picked language the
        // resolution already recorded its seeds and this is a no-op.
        q1English = typeof value === "string" ? value.trim() : "";
        const { q1English: _q1, ...restInputs } = identityInputs;
        identityInputs = { ...restInputs, ...(q1English !== "" ? { q1English } : {}) };
        evaluateIdentityDefaults();
      }

      if (questionId === "il_language_region") {
        // The chosen region narrows the resolved variant (spec 030 US3): its own-
        // script names / script can differ by region, so override those seeds.
        // Skipping (blank) leaves the primary-variant seeds in place. englishNames
        // stay the entry-level set (region variants carry no English names).
        const region = typeof value === "string" ? value.trim() : "";
        const variant = resolvedEntry?.regionVariants?.find((v) => v.region === region);
        if (variant !== undefined) {
          localNames = variant.localNames.length > 0 ? variant.localNames : undefined;

          // The variant's autonym / script seeds replace the primary's
          // (FR-010): forget the primary's `default` records for those two
          // questions and re-evaluate against the variant's inputs — a variant
          // with no own-script name drops the autonym back to the Q1 fallback
          // (sourceless, uncaptioned), and one with no script leaves the script
          // unseeded. il_language_code is untouched (region variants share the
          // subtag).
          forgetIdentityDefaults(["il_language_autonym", "il_target_script"]);
          const variantScript = scriptToTargetOption(variant.defaultScript) ?? undefined;
          const { localNames: _ln, targetScript: _ts, ...restInputs } = identityInputs;
          identityInputs = {
            ...restInputs,
            ...(variant.localNames.length > 0 ? { localNames: variant.localNames } : {}),
            ...(variantScript !== undefined ? { targetScript: variantScript } : {}),
          };
          evaluateIdentityDefaults();
        }
      }
    },

    // Route il_language_english -> il_language_region only when the picked language
    // is region-ambiguous (spec 030 US3 / FR-014). Reads the summary set
    // synchronously by onEntryResolved when the author selects a suggestion, so
    // it is current at render time (no dependency on onAnswerCommit ordering).
    nextOverride(questionId) {
      if (questionId === "il_language_english" && resolvedSummary?.hasRegionVariants === true) {
        return "il_language_region";
      }
      return undefined;
    },

    resolvedEntry: () => resolvedEntry,
    localNames: () => localNames,
    englishNames: () => englishNames,
  };
}

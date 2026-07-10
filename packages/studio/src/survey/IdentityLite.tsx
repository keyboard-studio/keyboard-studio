// Identity-lite survey step — the head of the hybrid flow (spec §8 "Workflow
// ordering"). Loads content/flows/identity_lite.yaml, runs it through
// SurveyRunner, and on completion extracts the language autonym, English name,
// and the INDEPENDENT target script, deriving the routing/A2 prefill
// confirmations (spec §5, §9). Language and script are decoupled. refs #369.

import { useMemo, useRef, useCallback } from "react";
import type { SurveyPhaseResult, LintFinding, LangtagsProvenance, LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext, FlowOption } from "./types.ts";
import {
  deriveScriptPrefill,
  normalizeTargetScript,
  type ScriptPrefill,
} from "../lib/scriptAxes.ts";
import {
  loadLangtags,
  getLoadedLangtags,
  scriptToTargetOption,
} from "../lib/langtagsDefaults.ts";

import identityLiteRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

// Scripts gated out of v1 (spec §9). When the target is one of these the flow
// ends on the "not supported" notice and the slice should not proceed.
const UNSUPPORTED_SCRIPTS = new Set(["Ethi", "Hani", "Hang"]);

// Shared caption for every langtags-derived seed (spec 030 FR-010). Frozen: it
// is stored by reference into provenanceRef at multiple sites, so an in-place
// mutation would silently corrupt every other seeded field's caption.
const LANGTAGS_PROVENANCE: LangtagsProvenance = Object.freeze({
  source: "langtags",
  caption: "Suggested from langtags — edit if needed",
});

/** Typed result of the identity-lite step. */
export interface IdentityLiteResult {
  /** Language name in its own script (autonym). */
  autonym: string;
  /** Language name in English. */
  english: string;
  /**
   * ISO 639 language subtag entered by the author (e.g. "ha", "hi", "fr").
   * Empty string when the author left the field blank.
   * Region and variant refinement are deferred to the documentation stage (§8).
   */
  languageSubtag: string;
  /**
   * Region subtag chosen at `il_language_region` (spec 030 US3), e.g. "DJ".
   * Empty string when the language was unambiguous by region or the step was
   * skipped. Folded into `bcp47` at the region position.
   */
  region: string;
  /** Raw `il_target_script` answer (e.g. "Latn", "romanization-Latn", "fonipa"). */
  targetScriptRaw: string;
  /**
   * Full BCP47 target tag combining language subtag + normalized script/variant,
   * e.g. "ha-Latn", "hi-Deva", "fr-Latn", "und-fonipa".
   * Empty string when `languageSubtag` was left blank — `suggestBases()` falls
   * back to script-match ranking in that case.
   */
  bcp47: string;
  /** Whether the chosen target script is supported in v1. */
  supported: boolean;
  /** Routing/A2 prefill confirmations derived from the target script (spec §5). */
  prefill: ScriptPrefill;
}

/**
 * Build the full BCP47 target tag from an ISO 639 language subtag and a raw
 * `il_target_script` value.
 *
 * Rules (language + script → BCP47):
 * - `lang` + plain script subtag (Latn/Deva/…) → `${lang}-${script}`
 *   e.g. "ha" + "Latn" → "ha-Latn", "hi" + "Deva" → "hi-Deva"
 * - `lang` + "romanization-Latn" → `${lang}-Latn`
 *   (Latn script implied; the fact it is a romanization is a strategy detail)
 * - `lang` + "fonipa" → `${lang}-fonipa`
 *   (Latin is implied by the variant; BCP47 omits the script subtag for fonipa)
 * - empty `lang` → "" (no BCP47; caller degrades to script-match ranking)
 *
 * An optional `region` subtag (from il_language_region, spec 030 US3) is folded
 * in at the BCP47 region position (language-script-region-variant). Empty region
 * (unambiguous or skipped) leaves the tag exactly as before.
 *
 * @param languageSubtag  ISO 639 subtag from `il_language_code`, may be "".
 * @param targetScriptRaw Raw `il_target_script` value from the survey.
 * @param region          Optional region subtag from il_language_region, may be "".
 */
export function buildTargetBcp47(
  languageSubtag: string,
  targetScriptRaw: string,
  region = "",
): string {
  const lang = languageSubtag.trim();
  if (lang === "") return "";
  const reg = region.trim();
  // BCP47 order: language-script-region-variant.
  if (targetScriptRaw === "fonipa") return [lang, reg, "fonipa"].filter((p) => p !== "").join("-");
  if (targetScriptRaw === "romanization-Latn") return [lang, "Latn", reg].filter((p) => p !== "").join("-");
  const { script } = normalizeTargetScript(targetScriptRaw);
  // "other" and empty string are not valid ISO-15924 subtags; omit the script
  // rather than emit the malformed "lang-other".
  const scriptPart = script === "" || script === "other" ? "" : script;
  return [lang, scriptPart, reg].filter((p) => p !== "").join("-");
}

function answerString(result: SurveyPhaseResult, questionId: string): string {
  const answer = result.answers.find((a) => a.questionId === questionId);
  if (answer === undefined) return "";
  if (answer.answerType === "text" || answer.answerType === "select") {
    return String(answer.value);
  }
  return "";
}

/** Derive the typed identity-lite result from a completed flow. */
export function extractIdentityLite(result: SurveyPhaseResult): IdentityLiteResult {
  const targetScriptRaw = answerString(result, "il_target_script");
  const languageSubtag = answerString(result, "il_language_code");
  const region = answerString(result, "il_language_region");
  return {
    autonym: answerString(result, "il_language_autonym"),
    english: answerString(result, "il_language_english"),
    languageSubtag,
    region,
    targetScriptRaw,
    bcp47: buildTargetBcp47(languageSubtag, targetScriptRaw, region),
    supported: !UNSUPPORTED_SCRIPTS.has(targetScriptRaw),
    prefill: deriveScriptPrefill(targetScriptRaw),
  };
}

export interface IdentityLiteProps {
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult, identity: IdentityLiteResult) => void;
  onBack?: () => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
  /**
   * Phase result of a previously completed run of this flow. When provided,
   * SurveyRunner replays the flow from these answers and mounts on the LAST
   * question — used when back-navigation re-enters the identity step so the
   * author does not restart from question 1.
   */
  resume?: SurveyPhaseResult;
}

/**
 * Flatten a completed phase result into SurveyRunner's resumeAnswers shape.
 * Exhaustive over SurveyAnswer.answerType — the inverse of toSurveyAnswer()'s
 * per-type mapping — so a new AnswerType member fails the build here instead
 * of silently falling through to a blanket String() coercion.
 * Exported for tests.
 */
export function toResumeAnswers(
  result: SurveyPhaseResult,
): Readonly<Record<string, string | string[]>> {
  const map: Record<string, string | string[]> = {};
  for (const a of result.answers) {
    switch (a.answerType) {
      case "char-list":
        map[a.questionId] = [...a.value];
        break;
      case "boolean":
        map[a.questionId] = a.value ? "true" : "false";
        break;
      case "char-single":
      case "key-name":
      case "store-content":
      case "select":
      case "text":
        map[a.questionId] = a.value;
        break;
      default: {
        const _exhaustive: never = a;
        void _exhaustive;
        break;
      }
    }
  }
  return map;
}

export function IdentityLite({
  context = {},
  onComplete,
  onBack,
  findingsByQuestionId,
  resume,
}: IdentityLiteProps) {
  const flow = useMemo(() => loadModularFlow(identityLiteRaw as string), []);

  const resumeAnswers = useMemo(
    () => (resume !== undefined ? toResumeAnswers(resume) : undefined),
    [resume],
  );

  // The English name the author entered/picked at Q1 (il_language_english). Used
  // as Q2's FALLBACK own-language name (spec 030 US2, per author request) only when
  // langtags has no recorded own-script name for the language — the ~60% with no
  // localname (T008), and free-text/unmatched languages. Captured on Q1 commit.
  const q1EnglishRef = useRef<string>("");

  // Own-script names from the resolved entry / selected region variant (langtags
  // `localname` + `localnames`). Head Q2's dropdown and, when present, seed its
  // default (localNames[0] = the primary autonym). Frequently undefined (~60% of
  // languages carry no local name — T008).
  const localNamesSeedRef = useRef<readonly string[] | undefined>(undefined);

  // Alternate/English names from the resolved entry (langtags `name` + `names`).
  // Q2 dropdown FALLBACK only (spec 030 US2, per author request): offered as the
  // choice list solely when the language has no own-script name; never mixed in
  // alongside localNames. Not used as a default — an English name is never
  // auto-selected as the own-language name.
  const englishNamesSeedRef = useRef<readonly string[] | undefined>(undefined);

  // Proposed target-script seed from langtags (from the resolved variant).
  // "Default once, then user owns it" — SurveyRunner enforces the seed only on
  // first forward arrival at il_target_script; Back discards unsaved edits so
  // re-arrival re-seeds from this ref, which is correct (spec §8).
  const scriptSeedRef = useRef<string | undefined>(undefined);

  // Language-code seed (spec 030 US4): the 3-letter ISO 639-3 code of the
  // resolved entry (falling back to the canonical bare subtag when the entry has
  // no 639-3 code). Seeds il_language_code for confirmation. Undefined when the
  // English name matched nothing — the author types a code or leaves it blank.
  const codeSeedRef = useRef<string | undefined>(undefined);

  // Provenance map: questionId → LangtagsProvenance, for seeded fields.
  // Stored in a ref so getSeedProvenance reads it without re-renders.
  const provenanceRef = useRef<Map<string, LangtagsProvenance>>(new Map());

  // The search summary the author selected at il_language_english (spec 030 US1).
  // Its `hasRegionVariants` flag is read synchronously by getNextOverride at
  // render time to decide whether the region step follows — a name string alone
  // cannot carry this. Null until a listed language is picked (free text → null).
  const resolvedSummaryRef = useRef<LanguageSummary | null>(null);

  // The full langtags entry resolved from the selected summary (spec 030 US3):
  // read by the region question's options and its variant-selection handler, and
  // the source of the autonym / local-name / script / code seeds. Null until a
  // known language is picked; populated asynchronously right after selection.
  const resolvedEntryRef = useRef<LanguageDefaults | null>(null);

  // The region subtag chosen at il_language_region (spec 030 US3), folded into
  // the BCP47 tag. Empty when unambiguous or skipped.
  const selectedRegionRef = useRef<string>("");

  // Seed the downstream fields from a resolved langtags entry. Shared by the
  // English-name selection (primary variant) and — via reseedFromVariant — the
  // region pick. Records provenance only for the fields actually seeded (FR-010).
  const seedFromEntry = useCallback((defaults: LanguageDefaults) => {
    scriptSeedRef.current = scriptToTargetOption(defaults.defaultScript) ?? undefined;
    // 3-letter ISO 639-3 code preferred (author's choice), else the bare subtag.
    codeSeedRef.current =
      defaults.iso639_3 !== undefined && defaults.iso639_3 !== ""
        ? defaults.iso639_3
        : defaults.code !== ""
          ? defaults.code
          : undefined;
    // Own-script names head Q2's dropdown and seed its default (localNames[0]);
    // English/alternate names are the dropdown's fallback only (used when there is
    // no own-script name). When a recorded own-script name IS the default, the
    // autonym field shows the langtags caption.
    localNamesSeedRef.current =
      defaults.localNames !== undefined && defaults.localNames.length > 0
        ? defaults.localNames
        : undefined;
    englishNamesSeedRef.current =
      defaults.englishNames !== undefined && defaults.englishNames.length > 0
        ? defaults.englishNames
        : undefined;

    const provenance = new Map<string, LangtagsProvenance>();
    if (scriptSeedRef.current !== undefined) provenance.set("il_target_script", LANGTAGS_PROVENANCE);
    if (codeSeedRef.current !== undefined) provenance.set("il_language_code", LANGTAGS_PROVENANCE);
    // The autonym default is a langtags value only when an own-script name exists.
    if (localNamesSeedRef.current !== undefined) provenance.set("il_language_autonym", LANGTAGS_PROVENANCE);
    provenanceRef.current = provenance;
  }, []);

  // Reset every resolved-entry-derived seed. Called when the English name is
  // cleared / matches nothing (free text → graceful degradation, FR-003).
  const clearSeeds = useCallback(() => {
    scriptSeedRef.current = undefined;
    codeSeedRef.current = undefined;
    localNamesSeedRef.current = undefined;
    englishNamesSeedRef.current = undefined;
    resolvedEntryRef.current = null;
    selectedRegionRef.current = "";
    provenanceRef.current = new Map();
  }, []);

  // Side-channel from the @langtags_names picker (spec 030 US1): the author
  // selected (entry) or cleared/free-texted (null) a concrete language at
  // il_language_english. resolvedSummaryRef is set synchronously so
  // getNextOverride sees hasRegionVariants on the same render; the full entry is
  // fetched asynchronously to seed the downstream steps (module already loaded).
  const handleEntryResolved = useCallback(
    (questionId: string, entry: LanguageSummary | null) => {
      if (questionId !== "il_language_english") return;
      resolvedSummaryRef.current = entry;
      selectedRegionRef.current = "";
      if (entry === null) {
        clearSeeds();
        return;
      }
      const applyDefaults = (mod: NonNullable<ReturnType<typeof getLoadedLangtags>>) => {
        const defaults = mod.getLanguageDefaults(entry.code);
        if (defaults !== null) {
          resolvedEntryRef.current = defaults;
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
    [seedFromEntry, clearSeeds],
  );

  const handleAnswerCommit = useCallback(
    (questionId: string, value: string | string[] | undefined) => {
      if (questionId === "il_language_english") {
        // Capture the Q1 name so it can seed Q2's default own-language name and
        // head its choice list (spec 030 US2). Works for a picked language and
        // for free text with no langtags match alike.
        q1EnglishRef.current = typeof value === "string" ? value.trim() : "";
      }

      if (questionId === "il_language_region") {
        // The chosen region narrows the resolved variant (spec 030 US3): its own-
        // script names / script can differ by region, so override those seeds.
        // Skipping (blank) leaves the primary-variant seeds in place. englishNames
        // stay the entry-level set (region variants carry no English names).
        const region = typeof value === "string" ? value.trim() : "";
        selectedRegionRef.current = region;
        const variant = resolvedEntryRef.current?.regionVariants?.find((v) => v.region === region);
        if (variant !== undefined) {
          localNamesSeedRef.current = variant.localNames.length > 0 ? variant.localNames : undefined;
          scriptSeedRef.current = scriptToTargetOption(variant.defaultScript) ?? undefined;

          // Keep provenance in step with the reseeded fields (FR-010): the autonym
          // default is a langtags value only when the variant has an own-script
          // name; il_language_code is untouched (region variants share the subtag).
          const nextProvenance = new Map(provenanceRef.current);
          if (scriptSeedRef.current !== undefined) {
            nextProvenance.set("il_target_script", LANGTAGS_PROVENANCE);
          } else {
            nextProvenance.delete("il_target_script");
          }
          if (localNamesSeedRef.current !== undefined) {
            nextProvenance.set("il_language_autonym", LANGTAGS_PROVENANCE);
          } else {
            nextProvenance.delete("il_language_autonym");
          }
          provenanceRef.current = nextProvenance;
        }
      }
    },
    [],
  );

  // Pre-fill the autonym / code / script steps from the langtags entry resolved
  // at il_language_english (spec 030 US2/US4).
  //
  // "Default once, then user owns it" contract is upheld by SurveyRunner:
  // the seed only fires on forward push; Back discards unsaved edits (stack pop),
  // so re-arriving re-seeds from the current ref values — correct behavior.
  //
  // FR-008: the seed value is only returned when the ref is non-empty. Since
  // SurveyRunner only calls getSeedValue when pushing a *new* stack entry
  // (never when restoring a saved entry via Back), a previously user-edited
  // value that was saved on the stack is restored directly and getSeedValue is
  // NOT called for that entry — preserving author override.
  const getSeedValue = useCallback(
    (questionId: string): string | string[] | undefined => {
      if (questionId === "il_language_autonym") {
        // Default own-language name (spec 030 US2, per author request): the primary
        // recorded own-script name (localNames[0]) when langtags has one; otherwise
        // fall back to the Q1 response. The author keeps it or picks from the
        // dropdown (own-script + English/alternate names).
        const locals = localNamesSeedRef.current;
        if (locals !== undefined && locals.length > 0 && locals[0]!.trim() !== "") {
          return locals[0];
        }
        return q1EnglishRef.current !== "" ? q1EnglishRef.current : undefined;
      }
      if (questionId === "il_language_code") {
        // 3-letter language-code confirmation, seeded from the resolved entry.
        return codeSeedRef.current;
      }
      if (questionId === "il_target_script") {
        return scriptSeedRef.current;
      }
      return undefined;
    },
    [],
  );

  // Return a LangtagsProvenance for a question if it has a langtags-derived
  // seed, or undefined when no provenance applies.
  const getSeedProvenance = useCallback(
    (questionId: string): LangtagsProvenance | undefined => {
      return provenanceRef.current.get(questionId);
    },
    [],
  );

  // Dynamic datalist options (spec 030 US2, per author request). For
  // il_language_autonym the choice list comes from langtags as a FALLBACK CHAIN,
  // not a concatenation: prefer the recorded own-script names (langtags localname
  // + localnames, merged into localNames with the primary first). ONLY when the
  // language has no own-script name at all does the list fall back to the English/
  // alternate names (langtags name + names). English names are never mixed in
  // alongside own-script names. De-duplicated case-insensitively; when langtags
  // has neither the list is empty (undefined) and the field falls back to the Q1
  // name as plain free text.
  const getSeedOptions = useCallback(
    (questionId: string): FlowOption[] | undefined => {
      if (questionId === "il_language_autonym") {
        const locals = localNamesSeedRef.current ?? [];
        const source = locals.length > 0 ? locals : (englishNamesSeedRef.current ?? []);
        const seen = new Set<string>();
        const opts: FlowOption[] = [];
        for (const n of source) {
          const trimmed = n.trim();
          const key = trimmed.toLowerCase();
          if (trimmed === "" || seen.has(key)) continue;
          seen.add(key);
          opts.push({ value: trimmed, label: trimmed });
        }
        return opts.length > 0 ? opts : undefined;
      }
      if (questionId === "il_language_region") {
        // The resolved entry's region variants (spec 030 US3): value = region
        // code (folded into BCP47), label = region name.
        const variants = resolvedEntryRef.current?.regionVariants;
        if (variants !== undefined && variants.length > 0) {
          return variants.map((v) => ({ value: v.region, label: v.regionName ?? v.region }));
        }
      }
      return undefined;
    },
    [],
  );

  // Route il_language_english -> il_language_region only when the picked language
  // is region-ambiguous (spec 030 US3 / FR-014). Reads resolvedSummaryRef, set
  // synchronously by handleEntryResolved when the author selects a suggestion, so
  // it is current at render time (no dependency on onAnswerCommit ordering, and
  // no need to re-derive from the name — which a homonym could not).
  const getNextOverride = useCallback(
    (questionId: string, _value: string | string[] | undefined): string | undefined => {
      if (questionId === "il_language_english") {
        if (resolvedSummaryRef.current?.hasRegionVariants === true) {
          return "il_language_region";
        }
      }
      return undefined;
    },
    [],
  );

  function handleComplete(result: SurveyPhaseResult) {
    onComplete(result, extractIdentityLite(result));
  }

  return (
    <div
      data-testid="identity-panel"
      style={{
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h2
        style={{
          margin: "0 0 20px 0",
          fontSize: "1.1rem",
          color: "#6ea8fe",
          fontWeight: 600,
        }}
      >
        Let's identify your language
      </h2>
      <SurveyRunner
        key={flow.flow_id}
        flow={flow}
        context={context}
        onComplete={handleComplete}
        onAnswerCommit={handleAnswerCommit}
        getSeedValue={getSeedValue}
        getSeedProvenance={getSeedProvenance}
        getSeedOptions={getSeedOptions}
        getNextOverride={getNextOverride}
        onEntryResolved={handleEntryResolved}
        advanceOnSelect
        // 220px ≈ the tallest identity question's label + help text + field, so
        // Back/Next hold a steady vertical position as the help text varies in
        // length across Q1–Q5 (tuned by eye against the live flow).
        contentMinHeight={220}
        {...(onBack !== undefined ? { onBack } : {})}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
        {...(resumeAnswers !== undefined ? { resumeAnswers } : {})}
      />
    </div>
  );
}

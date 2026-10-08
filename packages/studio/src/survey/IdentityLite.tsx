// Identity-lite survey step — the head of the hybrid flow (spec §8 "Workflow
// ordering"). Derives the identity_lite flow from its question modules, runs it through
// SurveyRunner, and on completion extracts the language autonym, English name,
// and the INDEPENDENT target script, deriving the routing/A2 prefill
// confirmations (spec §5, §9). Language and script are decoupled. refs #369.

import { useMemo, useRef, useCallback } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { SurveyPhaseResult, LintFinding, LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { questionRegistry } from "./questions/registry.ts";
import type { ExtractContext, IdentityLookupInputs } from "../decisions/extractContext.ts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { surveyPageColumn, phaseHeading, leadParagraph } from "./surveyStyles.ts";
import type { SurveyContext, FlowOption } from "./types.ts";
import { deriveScriptPrefill } from "../lib/scriptAxes.ts";
import type { IdentityLiteResult } from "./identityLiteResult.ts";
import {
  loadLangtags,
  getLoadedLangtags,
  scriptToTargetOption,
} from "../lib/langtagsDefaults.ts";
import { buildTargetBcp47, normalizeRegionSubtag } from "./targetBcp47.ts";
import { answerString } from "./answerString.ts";
import { normalizeForCompare } from "../lib/normalizeForCompare.ts";
import { flowSources, loadFlowSourceDef } from "../steps/flowSources.ts";

// Scripts gated out of v1 (spec §9). When the target is one of these the flow
// ends on the "not supported" notice and the slice should not proceed.
const UNSUPPORTED_SCRIPTS = new Set(["Ethi", "Hani", "Hang"]);

// `IdentityLiteResult` lives in its own type-only leaf module so the
// survey-session store can name it without closing an import cycle through this
// component — see identityLiteResult.ts's header. Re-exported here because this
// is where every existing call site imports it from.
export type { IdentityLiteResult };

// The BCP47 composer and its region normalizer live in their own leaf module so
// the decision trail can recompose the tag it attributes without importing this
// component (see targetBcp47.ts). Re-exported because this is where every
// existing call site imports them from.
export { buildTargetBcp47, normalizeRegionSubtag } from "./targetBcp47.ts";

/** Derive the typed identity-lite result from a completed flow. */
export function extractIdentityLite(result: SurveyPhaseResult): IdentityLiteResult {
  const targetScriptRaw = answerString(result, "il_target_script");
  const languageSubtag = answerString(result, "il_language_code");
  // Normalize so the recorded region and the folded bcp47 subtag agree: a
  // free-text region name that is not a valid BCP47 subtag is dropped, not
  // stored (see normalizeRegionSubtag).
  const region = normalizeRegionSubtag(answerString(result, "il_language_region"));
  return {
    autonym: answerString(result, "il_language_autonym"),
    english: answerString(result, "il_language_english"),
    languageSubtag,
    region,
    targetScriptRaw,
    bcp47: buildTargetBcp47(languageSubtag, targetScriptRaw, region),
    supported: !UNSUPPORTED_SCRIPTS.has(targetScriptRaw),
    prefill: deriveScriptPrefill(targetScriptRaw),
    // #1901: the author/copyright questions moved to the post-track
    // attribution step, so this flow's answers no longer carry them. The
    // result's attribution is composed from the DECISIONS by
    // decisions/identitySelectors.ts (deriveIdentityResult), which
    // StudioShell merges over this value — the sole live source since 089.
    attribution: null,
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
  const { t } = useLingui();

  const flow = useMemo(() => loadFlowSourceDef(flowSources["identity_lite"]!), []);

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

  // Spec 092 (T033, plan.md G-12): the identity lookup inputs, accumulated
  // across this step's resolutions — the resolved langtags entry's seed
  // values and the Q1 English answer, in the exact shapes the langtags
  // il_* modules' declared `lookupDefault`s read (ExtractContext.identity).
  // Kept in a ref because the resolutions fire from callbacks that must not
  // re-subscribe on every keystroke.
  const identityInputsRef = useRef<IdentityLookupInputs>({});

  // Evaluate the three declared lookup defaults against the accumulated
  // inputs and record each result as a `default` decision record.
  // SurveyRunner's record-first seeding then renders the record — value,
  // the langtags caption for "langtags"-sourced records, and the proposal
  // source the completed answer's record will name — exactly as the old
  // getSeedValue / getSeedProvenance / getSeedSource host props did
  // (spec 092 T031). Write rule (the extraction pass's merge rule,
  // G-12): seed when absent, replace a record this mechanism itself
  // seeded (`default` provenance), and NEVER touch an author-shaped
  // record — a restored asked record is neither overwritten nor offered
  // a lookup default. Re-evaluating an unchanged snapshot writes nothing.
  const evaluateIdentityDefaults = useCallback(() => {
    const ctx: ExtractContext = {
      ir: null,
      catalog: null,
      identity: identityInputsRef.current,
    };
    const store = useDecisionStore.getState();
    for (const questionId of [
      "il_language_autonym",
      "il_language_code",
      "il_target_script",
    ] as const) {
      const mod = questionRegistry[questionId];
      if (mod?.lookupDefault === undefined || mod.provides === undefined) continue;
      const dflt = mod.lookupDefault(ctx);
      if (dflt === undefined || dflt.value === undefined || dflt.value === null) continue;
      for (const id of mod.provides) {
        const existing = store.decisions[id];
        if (existing !== undefined && existing.provenance !== "default") continue;
        if (
          existing !== undefined &&
          existing.value === dflt.value &&
          existing.source === dflt.source
        ) {
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
  }, []);

  // Forget the `default` records for the given questions — the replacement
  // half of a re-resolution (a new entry picked, a region variant chosen,
  // the entry cleared): the superseded entry's seeds must not survive
  // into the new resolution. Only `default` records are forgotten; an
  // answered question keeps its record (the author owns it).
  const forgetIdentityDefaults = useCallback((questionIds: readonly string[]) => {
    const store = useDecisionStore.getState();
    for (const questionId of questionIds) {
      const mod = questionRegistry[questionId];
      if (mod?.provides === undefined) continue;
      for (const id of mod.provides) {
        if (store.decisions[id]?.provenance === "default") store.forget(id);
      }
    }
  }, []);

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
  // region pick. The dropdown option state (local/English names) stays in
  // refs; the SEEDS themselves are decision records now (spec 092 T033):
  // this resolution supersedes any previous entry's `default` records and
  // re-evaluates the declared lookup defaults against the new inputs.
  const seedFromEntry = useCallback(
    (defaults: LanguageDefaults) => {
      // Own-script names head Q2's dropdown; English/alternate names are
      // the dropdown's fallback only (used when there is no own-script
      // name).
      localNamesSeedRef.current =
        defaults.localNames !== undefined && defaults.localNames.length > 0
          ? defaults.localNames
          : undefined;
      englishNamesSeedRef.current =
        defaults.englishNames !== undefined && defaults.englishNames.length > 0
          ? defaults.englishNames
          : undefined;

      forgetIdentityDefaults(["il_language_autonym", "il_language_code", "il_target_script"]);
      // 3-letter ISO 639-3 code preferred (author's choice), else the
      // bare subtag; absent when the entry carries neither.
      const languageCode =
        defaults.iso639_3 !== undefined && defaults.iso639_3 !== ""
          ? defaults.iso639_3
          : defaults.code !== ""
            ? defaults.code
            : undefined;
      const targetScript = scriptToTargetOption(defaults.defaultScript) ?? undefined;
      const q1English =
        defaults.englishName ??
        (q1EnglishRef.current !== "" ? q1EnglishRef.current : undefined);
      // The new entry's inputs REPLACE the previous entry's wholesale —
      // destructure the entry-derived keys out first so a field this
      // entry lacks cannot survive from the superseded resolution.
      const {
        localNames: _ln,
        languageCode: _lc,
        targetScript: _ts,
        q1English: _q1,
        ...restInputs
      } = identityInputsRef.current;
      identityInputsRef.current = {
        ...restInputs,
        ...(defaults.localNames !== undefined && defaults.localNames.length > 0
          ? { localNames: defaults.localNames }
          : {}),
        ...(languageCode !== undefined ? { languageCode } : {}),
        ...(targetScript !== undefined ? { targetScript } : {}),
        ...(q1English !== undefined ? { q1English } : {}),
      };
      evaluateIdentityDefaults();
    },
    [evaluateIdentityDefaults, forgetIdentityDefaults],
  );

  // Reset every resolved-entry-derived seed. Called when the English name is
  // cleared / matches nothing (free text → graceful degradation, FR-003).
  // The autonym is re-evaluated afterwards: with no entry behind it, its
  // declared default falls back to the Q1 English answer itself.
  const clearSeeds = useCallback(() => {
    localNamesSeedRef.current = undefined;
    englishNamesSeedRef.current = undefined;
    resolvedEntryRef.current = null;
    selectedRegionRef.current = "";
    forgetIdentityDefaults(["il_language_autonym", "il_language_code", "il_target_script"]);
    identityInputsRef.current = {
      ...(q1EnglishRef.current !== "" ? { q1English: q1EnglishRef.current } : {}),
    };
    evaluateIdentityDefaults();
  }, [evaluateIdentityDefaults, forgetIdentityDefaults]);

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
        // for free text with no langtags match alike. Re-evaluating here is
        // what records the autonym's Q1 fallback for the free-text path (no
        // entry resolution ever fires there); for a picked language the
        // resolution already recorded its seeds and this is a no-op.
        q1EnglishRef.current = typeof value === "string" ? value.trim() : "";
        const { q1English: _q1, ...restInputs } = identityInputsRef.current;
        identityInputsRef.current = {
          ...restInputs,
          ...(q1EnglishRef.current !== "" ? { q1English: q1EnglishRef.current } : {}),
        };
        evaluateIdentityDefaults();
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

          // The variant's autonym / script seeds replace the primary's
          // (FR-010): forget the primary's `default` records for those two
          // questions and re-evaluate against the variant's inputs — a
          // variant with no own-script name drops the autonym back to the
          // Q1 fallback (sourceless, uncaptioned), and one with no script
          // leaves the script unseeded. il_language_code is untouched
          // (region variants share the subtag).
          forgetIdentityDefaults(["il_language_autonym", "il_target_script"]);
          const variantScript = scriptToTargetOption(variant.defaultScript) ?? undefined;
          const {
            localNames: _ln,
            targetScript: _ts,
            ...restInputs
          } = identityInputsRef.current;
          identityInputsRef.current = {
            ...restInputs,
            ...(variant.localNames.length > 0 ? { localNames: variant.localNames } : {}),
            ...(variantScript !== undefined ? { targetScript: variantScript } : {}),
          };
          evaluateIdentityDefaults();
        }
      }
    },
    [evaluateIdentityDefaults, forgetIdentityDefaults],
  );

  // Soft mismatch warning for il_language_code: when the typed/selected code
  // reverse-resolves (via langtags) to a DIFFERENT language than the one
  // picked at il_language_english, surface a non-blocking caption so the
  // author notices before it ships in the .kps <Language> element. Nothing
  // else catches this — Layer A' only checks that a bcp47 tag is PRESENT
  // (engine/src/validator/layer-a-prime.ts), never that it matches the
  // author's actual language.
  //
  // Only fires when Q1 resolved to a known langtags entry (resolvedEntryRef
  // set). Free-text Q1 (no match) has no confirmed English name to compare
  // against, and typing an arbitrary code in that case is the field's
  // legitimate escape hatch (spec 030 FR-003/US4-3), not a mistake to flag.
  const getFieldWarning = useCallback(
    (questionId: string, value: string | string[] | undefined): string | undefined => {
      if (questionId !== "il_language_code") return undefined;
      const selectedName = resolvedEntryRef.current?.englishName;
      if (selectedName === undefined) return undefined;
      const typed = typeof value === "string" ? value.trim() : "";
      if (typed === "") return undefined;
      const typedName = getLoadedLangtags()?.getLanguageDefaults(typed)?.englishName;
      if (typedName === undefined) return undefined;
      if (normalizeForCompare(typedName) === normalizeForCompare(selectedName)) return undefined;
      return t({
        id: "survey.identityLite.codeMismatchWarning",
        message: `${{ code: typed }} is the code for ${{ typedName }} — not ${{ selectedName }}. You can keep it, or pick a different code.`,
      });
    },
    // `t` closes over the live useLingui() binding directly (required for the
    // lingui macro extractor to track this call site) so it must be a
    // dependency here.
    [t],
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
          // Normalize before case-folding so NFC/NFD variants of the same
          // name (Vietnamese, Yorùbá/Akan, Ainu diacritics) don't produce
          // duplicate rows; resolveTyped in QuestionField matches the same way.
          const key = normalizeForCompare(n);
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
      if (questionId === "il_language_code") {
        // Possible code matches FOR THE RESOLVED LANGUAGE (spec 030 US4): the two
        // plausible subtag forms langtags records — the ISO 639-3 code (the seeded
        // default) and the canonical bare/2-letter subtag — so the author can pick
        // the form they want (e.g. Hausa: "hau" or "ha"). De-duplicated (many
        // languages carry only one form). Undefined when no language resolved — the
        // field then falls back to a full langtags code search / free text.
        const d = resolvedEntryRef.current;
        if (d === null) return undefined;
        const seen = new Set<string>();
        const opts: FlowOption[] = [];
        const add = (code: string | undefined, label: string) => {
          const c = code?.trim();
          if (c === undefined || c === "" || seen.has(c)) return;
          seen.add(c);
          opts.push({ value: c, label });
        };
        add(
          d.iso639_3,
          t({
            id: "survey.identityLite.codeOption.iso6393",
            message: `${{ code: d.iso639_3 ?? "" }} — ISO 639-3`,
          }),
        );
        add(
          d.code,
          t({
            id: "survey.identityLite.codeOption.bcp47",
            message: `${{ code: d.code }} — BCP 47 language subtag`,
          }),
        );
        return opts.length > 0 ? opts : undefined;
      }
      return undefined;
    },
    // `t` closes over the live useLingui() binding directly (required for the
    // lingui macro extractor to track this call site) so it must be a
    // dependency here.
    [t],
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
    <div style={surveyPageColumn}>
      <div data-testid="identity-panel">
        <h2 style={phaseHeading}>
          <Trans id="survey.identityLite.heading">Let's identify your language</Trans>
        </h2>
        <p style={leadParagraph}>
          <Trans id="survey.identityLite.lead">
            Answer a few quick questions about your language. Nothing is final — you can
            change any answer later.
          </Trans>
        </p>
        <SurveyRunner
          key={flow.flow_id}
          flow={flow}
          context={context}
          onComplete={handleComplete}
          onAnswerCommit={handleAnswerCommit}
          getFieldWarning={getFieldWarning}
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
    </div>
  );
}

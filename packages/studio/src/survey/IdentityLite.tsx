// Identity-lite survey step — the head of the hybrid flow (spec §8 "Workflow
// ordering"). Derives the identity_lite flow from its question modules, runs it through
// SurveyRunner, and on completion extracts the language autonym, English name,
// and the INDEPENDENT target script, deriving the routing/A2 prefill
// confirmations (spec §5, §9). Language and script are decoupled. refs #369.

import { useMemo, useState, useCallback } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { createIdentityResolution } from "./identityResolution.ts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { surveyPageColumn, phaseHeading, leadParagraph } from "./surveyStyles.ts";
import type { SurveyContext, FlowOption } from "./types.ts";
import { deriveScriptPrefill } from "../lib/scriptAxes.ts";
import type { IdentityLiteResult } from "./identityLiteResult.ts";
import { getLoadedLangtags } from "../lib/langtagsDefaults.ts";
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

  // The step's language resolution (survey/identityResolution.ts): the picked
  // entry, its seeds as decision records, the autonym dropdown's names, the
  // region routing. One instance for the life of the step.
  const [resolution] = useState(createIdentityResolution);

  // Soft mismatch warning for il_language_code: when the typed/selected code
  // reverse-resolves (via langtags) to a DIFFERENT language than the one
  // picked at il_language_english, surface a non-blocking caption so the
  // author notices before it ships in the .kps <Language> element. Nothing
  // else catches this — Layer A' only checks that a bcp47 tag is PRESENT
  // (engine/src/validator/layer-a-prime.ts), never that it matches the
  // author's actual language.
  //
  // Only fires when Q1 resolved to a known langtags entry (the resolution's entry
  // set). Free-text Q1 (no match) has no confirmed English name to compare
  // against, and typing an arbitrary code in that case is the field's
  // legitimate escape hatch (spec 030 FR-003/US4-3), not a mistake to flag.
  const getFieldWarning = useCallback(
    (questionId: string, value: string | string[] | undefined): string | undefined => {
      if (questionId !== "il_language_code") return undefined;
      const selectedName = resolution.resolvedEntry()?.englishName;
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
    [t, resolution],
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
        const locals = resolution.localNames() ?? [];
        const source = locals.length > 0 ? locals : (resolution.englishNames() ?? []);
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
        const variants = resolution.resolvedEntry()?.regionVariants;
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
        const d = resolution.resolvedEntry();
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
    [t, resolution],
  );

  // Route il_language_english -> il_language_region only when the picked language
  // is region-ambiguous (spec 030 US3 / FR-014): the resolution decides.
  const getNextOverride = useCallback(
    (questionId: string, _value: string | string[] | undefined): string | undefined =>
      resolution.nextOverride(questionId),
    [resolution],
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
          onAnswerCommit={resolution.onAnswerCommit}
          getFieldWarning={getFieldWarning}
          getSeedOptions={getSeedOptions}
          getNextOverride={getNextOverride}
          onEntryResolved={resolution.onEntryResolved}
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

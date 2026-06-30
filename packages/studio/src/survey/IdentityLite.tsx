// Identity-lite survey step — the head of the hybrid flow (spec §8 "Workflow
// ordering"). Loads content/flows/identity_lite.yaml, runs it through
// SurveyRunner, and on completion extracts the language autonym, English name,
// and the INDEPENDENT target script, deriving the routing/A2 prefill
// confirmations (spec §5, §9). Language and script are decoupled. refs #369.

import { useMemo, useRef, useCallback } from "react";
import type { SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext } from "./types.ts";
import {
  deriveScriptPrefill,
  normalizeTargetScript,
  type ScriptPrefill,
} from "../lib/scriptAxes.ts";

import identityLiteRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

// Scripts gated out of v1 (spec §9). When the target is one of these the flow
// ends on the "not supported" notice and the slice should not proceed.
const UNSUPPORTED_SCRIPTS = new Set(["Ethi", "Hani", "Hang"]);

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
 * @param languageSubtag  ISO 639 subtag from `il_language_code`, may be "".
 * @param targetScriptRaw Raw `il_target_script` value from the survey.
 */
export function buildTargetBcp47(
  languageSubtag: string,
  targetScriptRaw: string,
): string {
  const lang = languageSubtag.trim();
  if (lang === "") return "";
  if (targetScriptRaw === "fonipa") return `${lang}-fonipa`;
  if (targetScriptRaw === "romanization-Latn") return `${lang}-Latn`;
  const { script } = normalizeTargetScript(targetScriptRaw);
  return `${lang}-${script}`;
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
  return {
    autonym: answerString(result, "il_language_autonym"),
    english: answerString(result, "il_language_english"),
    languageSubtag,
    targetScriptRaw,
    bcp47: buildTargetBcp47(languageSubtag, targetScriptRaw),
    supported: !UNSUPPORTED_SCRIPTS.has(targetScriptRaw),
    prefill: deriveScriptPrefill(targetScriptRaw),
  };
}

export interface IdentityLiteProps {
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult, identity: IdentityLiteResult) => void;
  onBack?: () => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
}

export function IdentityLite({
  context = {},
  onComplete,
  onBack,
  findingsByQuestionId,
}: IdentityLiteProps) {
  const flow = useMemo(() => loadModularFlow(identityLiteRaw as string), []);

  // Track the latest committed autonym synchronously via a ref so that
  // getSeedValue can read it in the same tick as the onAnswerCommit call,
  // without waiting for a React state update cycle.
  const autonymRef = useRef<string>("");

  const handleAnswerCommit = useCallback(
    (questionId: string, value: string | string[] | undefined) => {
      if (questionId === "il_language_autonym") {
        autonymRef.current = typeof value === "string" ? value : "";
      }
    },
    [],
  );

  // Pre-fill il_language_english with the autonym when the user first arrives
  // at that question. Returns undefined for all other question IDs so they
  // remain empty. The "default once, then user owns it" contract is upheld by
  // SurveyRunner: the seed only fires on forward push; Back discards unsaved
  // edits (standard stack pop behavior), so re-arriving re-seeds from the
  // current autonym — which is the expected behavior.
  const getSeedValue = useCallback(
    (questionId: string): string | string[] | undefined => {
      if (questionId === "il_language_english") {
        const autonym = autonymRef.current;
        return autonym !== "" ? autonym : undefined;
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
        {...(onBack !== undefined ? { onBack } : {})}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />
    </div>
  );
}

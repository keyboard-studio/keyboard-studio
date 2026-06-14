// Identity-lite survey step — the head of the hybrid flow (spec §8 "Workflow
// ordering"). Loads content/flows/identity_lite.yaml, runs it through
// SurveyRunner, and on completion extracts the language autonym, English name,
// and the INDEPENDENT target script, deriving the routing/A2 prefill
// confirmations (spec §5, §9). Language and script are decoupled. refs #369.

import { useMemo } from "react";
import type { SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { parseFlow } from "./loadFlow.ts";
import type { SurveyContext } from "./types.ts";
import { deriveScriptPrefill, type ScriptPrefill } from "../lib/scriptAxes.ts";

import identityLiteRaw from "../../../../content/flows/identity_lite.yaml?raw";

// Scripts gated out of v1 (spec §9). When the target is one of these the flow
// ends on the "not supported" notice and the slice should not proceed.
const UNSUPPORTED_SCRIPTS = new Set(["Ethi", "Hani", "Hang"]);

/** Typed result of the identity-lite step. */
export interface IdentityLiteResult {
  /** Language name in its own script (autonym). */
  autonym: string;
  /** Language name in English. */
  english: string;
  /** Raw `il_target_script` answer (e.g. "Latn", "romanization-Latn", "fonipa"). */
  targetScriptRaw: string;
  /** Whether the chosen target script is supported in v1. */
  supported: boolean;
  /** Routing/A2 prefill confirmations derived from the target script (spec §5). */
  prefill: ScriptPrefill;
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
  return {
    autonym: answerString(result, "il_language_autonym"),
    english: answerString(result, "il_language_english"),
    targetScriptRaw,
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
  const flow = useMemo(() => parseFlow(identityLiteRaw as string), []);

  function handleComplete(result: SurveyPhaseResult) {
    onComplete(result, extractIdentityLite(result));
  }

  return (
    <div
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
        {...(onBack !== undefined ? { onBack } : {})}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />
    </div>
  );
}

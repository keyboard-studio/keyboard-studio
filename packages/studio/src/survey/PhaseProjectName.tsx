// PhaseProjectName — modular survey runner for the project-name wizard step.
//
// Loads project_name.modular.yaml, resolves project_display_name and
// project_keyboard_id via the registry, and runs them through SurveyRunner.
//
// Seed behavior (mirrors ProjectNameStep.tsx "default once, then user owns it"):
//   - project_display_name is seeded from defaultDisplayName (autonym || english).
//   - project_keyboard_id is seeded by applying slugifyKeyboardId to the
//     committed project_display_name answer via onAnswerCommit + getSeedValue.
//     The slug is re-derived on Back→forward re-arrival from the then-current
//     committed name (SurveyRunner stack-pop semantics).
//
// Behavior parity contract:
//   onComplete fires onProjectNameNext(displayName, keyboardId) — identical to
//   ProjectNameStep's onNext callback shape — letting StudioShell's
//   handleProjectNameNext run without modification.
//
// The slug-derivation and validation logic lives in @keyboard-studio/contracts
// (slugifyKeyboardId, validateKeyboardId). Both this file and ProjectNameStep.tsx
// import from that single source so the logic is not duplicated.

import { useMemo, useRef, useCallback } from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { slugifyKeyboardId } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext } from "./types.ts";

// Vite ?raw import — typed via the `*.yaml?raw` declaration in src/vite-env.d.ts.
import projectNameRaw from "../../../../content/flows/project_name.modular.yaml?raw";

// ---------------------------------------------------------------------------
// PhaseProjectName component
// ---------------------------------------------------------------------------

export interface PhaseProjectNameProps {
  /**
   * Default display name — autonym from identity_lite (il_language_autonym), or
   * English name as fallback. Seeded into project_display_name on first arrival.
   */
  defaultDisplayName: string;
  /**
   * Called when both project_display_name and project_keyboard_id are confirmed.
   * Maps directly to handleProjectNameNext(displayName, keyboardId) in StudioShell.
   */
  onProjectNameNext: (displayName: string, keyboardId: string) => void;
  /** Back handler — maps to handleProjectNameBack in StudioShell. */
  onBack: () => void;
}

export function PhaseProjectName({
  defaultDisplayName,
  onProjectNameNext,
  onBack,
}: PhaseProjectNameProps) {
  const flow = useMemo(() => loadModularFlow(projectNameRaw as string), []);

  // Context is minimal for this flow (no survey-phase interpolations needed).
  const context: SurveyContext = useMemo(() => ({}), []);

  // Track the latest committed display name so getSeedValue for project_keyboard_id
  // can derive the slug synchronously in the same tick as the commit.
  const displayNameRef = useRef<string>(defaultDisplayName);

  // Seed project_display_name on first arrival from defaultDisplayName.
  // Seed project_keyboard_id from the slugified displayName whenever it arrives.
  const handleAnswerCommit = useCallback(
    (questionId: string, value: string | string[] | undefined) => {
      if (questionId === "project_display_name") {
        displayNameRef.current = typeof value === "string" ? value : "";
      }
    },
    [],
  );

  const getSeedValue = useCallback(
    (questionId: string): string | string[] | undefined => {
      if (questionId === "project_display_name") {
        return defaultDisplayName !== "" ? defaultDisplayName : undefined;
      }
      if (questionId === "project_keyboard_id") {
        const name = displayNameRef.current;
        const slug = slugifyKeyboardId(name);
        return slug !== "" ? slug : undefined;
      }
      return undefined;
    },
    // defaultDisplayName is stable across the lifetime of this component
    // (it is set once from identityResult when the step is entered).
    [defaultDisplayName],
  );

  function handleComplete(result: SurveyPhaseResult) {
    // Extract display name and keyboard ID from the flow answers.
    const displayNameAnswer = result.answers.find(
      (a) => a.questionId === "project_display_name",
    );
    const keyboardIdAnswer = result.answers.find(
      (a) => a.questionId === "project_keyboard_id",
    );

    const displayName =
      displayNameAnswer !== undefined && displayNameAnswer.answerType === "text"
        ? String(displayNameAnswer.value).trim()
        : "";
    const keyboardId =
      keyboardIdAnswer !== undefined && keyboardIdAnswer.answerType === "text"
        ? String(keyboardIdAnswer.value).trim()
        : "";

    if (displayName !== "" && keyboardId !== "") {
      onProjectNameNext(displayName, keyboardId);
    }
    // If answers are empty (e.g., required validation was bypassed), stay on step.
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
        Name your keyboard
      </h2>
      <SurveyRunner
        key={flow.flow_id}
        flow={flow}
        context={context}
        onComplete={handleComplete}
        onBack={onBack}
        onAnswerCommit={handleAnswerCommit}
        getSeedValue={getSeedValue}
      />
    </div>
  );
}

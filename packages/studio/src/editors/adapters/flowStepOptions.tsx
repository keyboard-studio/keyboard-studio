// flowStepOptions.tsx — per-flow options records for makeFlowStepComponent.
// (spec 029 Stage 6, T005)
//
// Each record replaces the bespoke logic of the corresponding survey wrapper:
//   trackOptions        ← TrackStepAdapter / PhaseTrack
//   projectNameOptions  ← ProjectNameStepAdapter / PhaseProjectName
//   phaseFOptions       ← PhaseFAdapter / PhaseF
//
// Parity table (contract §3): every store effect, every extraction guard, and
// every context shape exactly reproduces the pre-Stage-6 wrapper behaviour.
//
// These records are consumed by makeFlowStepComponent to produce
// EditorStepProps-compatible components that register in registerEditorSteps.ts.

import { slugifyKeyboardId } from "@keyboard-studio/contracts";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { makeFlowStepComponent } from "./makeFlowStepComponent.tsx";
import type { FlowStepOptions, FlowStepDeps } from "./makeFlowStepComponent.tsx";

// ---------------------------------------------------------------------------
// track options — reproduces TrackStepAdapter + PhaseTrack behaviour exactly.
//
// Context: { base_name: localBase.displayName }
// Guard: localBase must be non-null (adapter rendered null if null; factory
//   will produce a null return to match).
// Extract: track_choice answer → "copy" | "adapt" only; else undefined (stay).
// onCommit: setSelectedTrack(track); if track!=="copy" also setScaffoldSpec(null).
// Payload: { track }.
// ---------------------------------------------------------------------------

export type TrackPayload = { track: "copy" | "adapt" };

export const trackOptions: FlowStepOptions<TrackPayload> = {
  flowRef: "track",
  title: "Authoring Track",

  buildContext(deps: FlowStepDeps) {
    // Match TrackStepAdapter: base_name from localBase.displayName.
    return { base_name: deps.localBase?.displayName ?? "" };
  },

  extract(result: SurveyPhaseResult): TrackPayload | undefined {
    const answer = result.answers.find((a) => a.questionId === "track_choice");
    if (!answer || (answer.answerType !== "select" && answer.answerType !== "text")) {
      return undefined;
    }
    const v = String(answer.value);
    return v === "copy" || v === "adapt" ? { track: v } : undefined;
  },

  onCommit(extracted: TrackPayload, deps: FlowStepDeps): void {
    // R7 ordering: setSelectedTrack BEFORE onComplete → StepHost advance.
    deps.setSelectedTrack(extracted.track);
    if (extracted.track !== "copy") {
      // Adapt-track: null scaffold spec (advanceOutcome carries setCharactersSubStage
      // which fires AFTER advance — matches pre-Stage-6 ordering).
      deps.setScaffoldSpec(null);
    }
    // Copy-track intentionally does NOT clear scaffoldSpec here;
    // scaffoldSpec is set downstream by projectNameStep.onCommit.
  },
};

// ---------------------------------------------------------------------------
// projectNameOptions — reproduces ProjectNameStepAdapter + PhaseProjectName.
//
// Context: {} (empty — matches PhaseProjectName today).
// Seeds: displayName from identityResult autonym/english; keyboardId slug.
//   Back→forward re-derivation: the ref-based pattern from PhaseProjectName
//   is preserved via a closure ref inside getSeedValue/onAnswerCommit.
// Extract: display + id (both trimmed); undefined unless both non-empty.
// onCommit: setScaffoldSpec({keyboardId,displayName}) → setIdentity({keyboardId,displayName}).
// Payload: { displayName, keyboardId }.
// ---------------------------------------------------------------------------

export type ProjectNamePayload = { displayName: string; keyboardId: string };

export const projectNameOptions: FlowStepOptions<ProjectNamePayload> = {
  flowRef: "project_name",
  title: "Name your keyboard",

  buildContext(_deps: FlowStepDeps) {
    // Match PhaseProjectName: empty context.
    return {};
  },

  seeds: {
    getSeedValue(questionId: string, deps: FlowStepDeps): string | string[] | undefined {
      const defaultDisplayName =
        deps.identityResult !== null
          ? deps.identityResult.autonym || deps.identityResult.english
          : "";

      if (questionId === "project_display_name") {
        // Seed from defaultDisplayName on first arrival; also re-seed on Back→forward.
        // Initialize the per-mount ref on first seed so re-derivation has a starting value.
        // deps.displayNameRef is allocated by useRef() inside the factory component —
        // always "" on a fresh mount, so re-entry never retains a prior session's value.
        if (deps.displayNameRef.current === "") {
          deps.displayNameRef.current = defaultDisplayName;
        }
        return defaultDisplayName !== "" ? defaultDisplayName : undefined;
      }
      if (questionId === "project_keyboard_id") {
        // Derive slug from the committed display name (via the per-mount ref).
        const name = deps.displayNameRef.current !== "" ? deps.displayNameRef.current : defaultDisplayName;
        const slug = slugifyKeyboardId(name);
        return slug !== "" ? slug : undefined;
      }
      return undefined;
    },

    onAnswerCommit(
      questionId: string,
      value: string | string[] | undefined,
      deps: FlowStepDeps,
    ): void {
      // Track the latest committed display name for Back→forward re-derivation.
      // Written to the per-mount ref so it does not leak across re-entries.
      if (questionId === "project_display_name") {
        deps.displayNameRef.current = typeof value === "string" ? value : "";
      }
    },
  },

  extract(result: SurveyPhaseResult): ProjectNamePayload | undefined {
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
      return { displayName, keyboardId };
    }
    return undefined;
  },

  onCommit(extracted: ProjectNamePayload, deps: FlowStepDeps): void {
    // R7 ordering: setScaffoldSpec BEFORE setIdentity BEFORE onComplete → advance.
    deps.setScaffoldSpec({ keyboardId: extracted.keyboardId, displayName: extracted.displayName });
    deps.setIdentity({ keyboardId: extracted.keyboardId, displayName: extracted.displayName });
  },
};

// ---------------------------------------------------------------------------
// phaseFOptions — reproduces PhaseFAdapter + PhaseF behaviour exactly.
//
// Context: surveySessionStore.surveyContext (matches PhaseFAdapter today).
// usesFindings: true — derives findingsByQuestionId via buildFindingsByQuestionId.
// Extract: identity (raw SurveyPhaseResult — the host's applyStepCompletion / advance
//   already handles the result shape downstream).
// onCommit: none (PhaseFAdapter had no pre-onComplete store writes).
// ---------------------------------------------------------------------------

export type PhaseFPayload = SurveyPhaseResult;

export const phaseFOptions: FlowStepOptions<PhaseFPayload> = {
  flowRef: "phase_f_helpdocs",
  title: "Phase F — Help documentation",

  buildContext(deps: FlowStepDeps) {
    // Match PhaseFAdapter: pass surveyContext from session store.
    return deps.surveyContext;
  },

  usesFindings: true,

  extract(result: SurveyPhaseResult): PhaseFPayload | undefined {
    // Identity extraction — raw result forwarded to StepHost's generic path.
    return result;
  },

  // No onCommit — PhaseF had no pre-onComplete store writes.
};

// ---------------------------------------------------------------------------
// Factory-produced step components — EditorStepProps-compatible.
//
// These are the canonical factory outputs for the three converged flows.
// registerEditorSteps.ts may use these directly (C4.1 "factory output directly")
// instead of the adapter wrappers. They render FlowStepHost internally.
// ---------------------------------------------------------------------------

export const TrackStepFactoryComponent = makeFlowStepComponent(trackOptions);
export const ProjectNameStepFactoryComponent = makeFlowStepComponent(projectNameOptions);
export const PhaseFStepFactoryComponent = makeFlowStepComponent(phaseFOptions);


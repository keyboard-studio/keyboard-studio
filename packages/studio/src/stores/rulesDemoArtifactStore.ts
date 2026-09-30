// rulesDemoArtifactStore — the Track A demo pane's view of the compile artifact
// (spec 082, FR-001/FR-004).
//
// Written by SurveyView as a pure projection of its `useKeyboardArtifact`
// `Stage` — the SAME single 300 ms compile-cycle artifact the live OSK
// preview consumes (076 D3). This is the same store-bridge pattern as
// basePreviewStatusStore: the rules step cannot prop-drill through StepHost's
// generic EditorStepProps, and it MUST NOT mount its own useKeyboardArtifact
// (that would be a second compile) or its own debounce timer (SC-006 forbids
// it). The pane is a pure READER: typing re-runs the cheap synchronous
// simulator against the published bytes, never a compile.
//
// The projection carries the compiled `.js` as a blob URL (the Stage's own
// form), the compile diagnostics (FR-004: a compile error shows the
// diagnostic, never stale output), and the coarse status. It deliberately
// does NOT carry the VFS — the demo pane needs bytes, not the file tree.

import { create } from "zustand";
import type { CompilerDiagnostic } from "@keyboard-studio/contracts";

export type RulesDemoArtifactStatus = "idle" | "loading" | "ready" | "error";

export interface RulesDemoArtifact {
  status: RulesDemoArtifactStatus;
  /** Blob URL of the compiled `.js` artifact; set when status is "ready". */
  jsBlobUrl: string | null;
  /** The keyboard id the artifact was compiled for. */
  keyboardId: string | null;
  /** WASM-oracle diagnostics from the compile that produced this artifact. */
  diagnostics: readonly CompilerDiagnostic[];
  /** Compile-pipeline step that failed ("fetch" | "vfs" | "compile"). */
  errorStep: string | null;
  /** Human-readable failure message; set when status is "error". */
  errorMessage: string | null;
}

const IDLE_ARTIFACT: RulesDemoArtifact = {
  status: "idle",
  jsBlobUrl: null,
  keyboardId: null,
  diagnostics: [],
  errorStep: null,
  errorMessage: null,
};

/** Build a "loading" artifact value (the SurveyView publisher). */
export function makeLoadingRulesDemoArtifact(): RulesDemoArtifact {
  return { ...IDLE_ARTIFACT, status: "loading" };
}

/** The idle artifact value (the SurveyView publisher). */
export function makeIdleRulesDemoArtifact(): RulesDemoArtifact {
  return { ...IDLE_ARTIFACT };
}

interface RulesDemoArtifactState {
  artifact: RulesDemoArtifact;
  setArtifact: (artifact: RulesDemoArtifact) => void;
}

export const useRulesDemoArtifactStore = create<RulesDemoArtifactState>((set) => ({
  artifact: IDLE_ARTIFACT,
  setArtifact: (artifact) => set({ artifact }),
}));

/** Test helper — publish an artifact without the SurveyView pipeline. */
export function setRulesDemoArtifactForTest(artifact: RulesDemoArtifact): void {
  useRulesDemoArtifactStore.getState().setArtifact(artifact);
}

/** Build a "ready" artifact value (tests and the SurveyView publisher). */
export function makeReadyRulesDemoArtifact(
  jsBlobUrl: string,
  keyboardId: string,
  diagnostics: readonly CompilerDiagnostic[] = [],
): RulesDemoArtifact {
  return {
    status: "ready",
    jsBlobUrl,
    keyboardId,
    diagnostics,
    errorStep: null,
    errorMessage: null,
  };
}

/** Build an "error" artifact value (tests and the SurveyView publisher). */
export function makeErrorRulesDemoArtifact(
  errorStep: string,
  errorMessage: string,
  diagnostics: readonly CompilerDiagnostic[] = [],
): RulesDemoArtifact {
  return {
    status: "error",
    jsBlobUrl: null,
    keyboardId: null,
    diagnostics,
    errorStep,
    errorMessage,
  };
}

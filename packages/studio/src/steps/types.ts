// Step model contract — Phase 4 (P4a).
// The common abstraction over question modules, galleries, and wizard panels.
// Consumed by the manifest (P4b), the reducer (P4b), the register adapters (P4b),
// and the dashboard (P4b). All P4a adapters satisfy EditorStepProps.
//
// Contract source: specs/012-step-model-manifest/contracts/step-model.contract.md

import type { IRPath } from "@keyboard-studio/contracts";
import type { SurveyContext } from "../survey/types.ts";
import type { EvidenceKeyFnId } from "./evidence.ts";

// Re-export SurveyContext so consumers can import from one place.
export type { SurveyContext };

// ---------------------------------------------------------------------------
// StepKind — discriminant (G1: exactly two kinds)
// ---------------------------------------------------------------------------

export type StepKind = "question-step" | "editor-step";

// ---------------------------------------------------------------------------
// Answer persistence declarations (spec 079 R-02, R-12)
// ---------------------------------------------------------------------------

/** What earlier answers shape this step's questions (FR-011). */
export interface EvidenceDeclaration {
  /** Plain-language list of the shape-determining inputs, for reviewers. */
  inputs: readonly string[];
  /** Id of the pure key function in steps/evidence.ts. */
  keyFn: EvidenceKeyFnId;
}

/**
 * Where a step's answers are kept so that leaving and returning loses nothing
 * (FR-007). `{ exempt }` needs a written justification; the manifest test fails
 * on an empty one, which is what makes "unjustified exemptions: zero" (SC-007)
 * a failing test rather than a checklist item.
 */
export type PersistenceDeclaration =
  | "answer-store"
  | "phase-b-draft"
  | "working-copy"
  | { exempt: string };

// ---------------------------------------------------------------------------
// StepBase — fields shared by all steps (FR-002)
// ---------------------------------------------------------------------------

export interface StepBase {
  /** Unique across the whole flow. The reducer and completeness graph key on this. */
  id: string;
  kind: StepKind;
  /** Human label (dashboard + chrome). */
  title: string;
  /**
   * true = on the main spine; false / absent = side trail (needs joinTarget).
   * Default: false (side trail).
   */
  spine?: boolean;
  /**
   * Lock gate placed AFTER this step completes. Only two locks exist in the flow
   * (spec §3.5): "physical" and "touch". Spine steps only.
   */
  lock?: "physical" | "touch";
  /**
   * Required when spine === false. The spine step id this side trail rejoins.
   */
  joinTarget?: string;
  /** IR locations this step reads — reused from the P2 QuestionModule contract (G5). */
  inputs: readonly IRPath[];
  /** IR locations this step will populate — declared now, executed in P5 (G5). */
  writes: readonly IRPath[];
  /**
   * Visual layout for this step in the studio shell.
   * "pane"  — default; rendered inside the three-pane editor area.
   * "full"  — full-screen editor unit (carve, mechanisms, touch galleries).
   * Omitting this field is equivalent to "pane".
   */
  layout?: "full" | "pane";
  /**
   * Right-pane content for a "pane"-layout step. Default "preview" (live OSK).
   * Ignored when layout:"full".
   */
  rightPane?: "preview" | "character-map";
  /**
   * ids into steps/flowSources.ts: survey flows that run inside / hang under
   * this step on the Flow Map. Used by Stage 1 to derive drill-downs without
   * a separate FLOW_SOURCES array (spec 024, ADR-0001).
   */
  flowRefs?: readonly string[];
  /**
   * Which spec unit(s) govern this step (spec 031 FR-001). Vocabulary:
   * `§N` / `§Na` (spec.md monolith section), or `specs/<slug>` (extracted
   * feature folder) — each MUST resolve against docs/spec-trace.json's
   * unit ids. Required on every manifest step (enforced by
   * dashboard/completeness.ts's checkSpecRef, not by this type).
   */
  specRef?: string | readonly string[];
  /**
   * The evidence this step's questions depend on (spec 079 R-02). Absent when
   * no earlier answer shapes the step.
   */
  evidence?: EvidenceDeclaration;
  /**
   * Where this step's answers persist (spec 079 R-12, FR-007). Required;
   * cross-checked against contracts/step-classification.md by
   * manifest.persistence.test.ts.
   */
  persistence: PersistenceDeclaration;
  // Reserved seam (spec §9 loop primitive, not built): iterates?: string
}

// ---------------------------------------------------------------------------
// QuestionStep — wraps a registered QuestionModule (resolved by definition.id)
// ---------------------------------------------------------------------------

export interface QuestionStep extends StepBase {
  kind: "question-step";
  /** Resolved via the existing registry by definition.id (never by file path). */
  questionId: string;
}

// ---------------------------------------------------------------------------
// EditorStep — wraps a gallery or hand-built panel
// ---------------------------------------------------------------------------

export interface EditorStep extends StepBase {
  kind: "editor-step";
  /**
   * A gallery or panel adapter. Must satisfy React.ComponentType<EditorStepProps>.
   * Compile-checked by G3 (adapter conformance).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<EditorStepProps>;
  /** For the carve/add editors (surface-parameterized shell). */
  surface?: "physical" | "touch";
}

// ---------------------------------------------------------------------------
// Step — the discriminated union (G1)
// ---------------------------------------------------------------------------

export type Step = QuestionStep | EditorStep;

// ---------------------------------------------------------------------------
// EditorStepProps — the ONE prop contract all editor adapters satisfy (FR-003)
//
// Editors MUST NOT call store mutators that perform survey-level transitions
// (lock, touch-layout build, instantiate). Those fire from the manifest-level
// reducer keyed by step id (P4b). Editors are pure: they report completion and
// receive context.
// ---------------------------------------------------------------------------

export interface EditorStepProps {
  /**
   * Hands the step result to the manifest reducer (P4b).
   * The component itself performs NO survey-level side effects (G2 / FR-003).
   */
  onComplete: (result: unknown) => void;
  /**
   * Panels that are entry points (TrackOneIdentityPanel, ScaffoldForm) may
   * omit this; galleries and branching steps supply it.
   */
  onBack?: () => void;
  /** Shared survey/identity context (existing shape from survey/types.ts). */
  ctx?: SurveyContext;
}

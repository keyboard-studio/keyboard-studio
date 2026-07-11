// registerQuestionSteps — adapt QuestionModules from the registry into QuestionStep descriptors.
//
// T022 (P4b foundation). Resolves every registered QuestionModule by its
// definition.id and wraps it as a QuestionStep with the P2 inputs/writes
// carried through. The manifest (manifest.ts) consumes this list to source
// all question-step entries — it does not call the registry directly.
//
// Boundary: steps/ -> survey/ is allowed by the steps-layer depcruise rule.
// steps/ -> stores/ and steps/ -> lib/ are forbidden — this file imports neither.

import type { QuestionStep } from "./types.ts";
import { questionRegistry } from "../survey/questions/registry.ts";

/**
 * All registered QuestionModules adapted to QuestionStep descriptors.
 *
 * Order within the list mirrors the registry insertion order (A → B → F).
 * The manifest imposes the final spine order; this list is an unordered pool
 * the manifest picks from by id.
 *
 * `inputs` and `writes` default to [] when the module omits them (legacy
 * modules or notice-type questions that declare nothing). The coverage gate
 * in CI enforces explicit [] on all shipped modules; defaulting here makes
 * the adapter resilient to the transient window before that gate is enforced
 * on every entry.
 */
export const registeredQuestionSteps: readonly QuestionStep[] = Object.entries(
  questionRegistry,
).map(([id, mod]): QuestionStep => ({
  kind: "question-step",
  id,
  title: mod.definition.prompt ?? mod.definition.label ?? id,
  spine: true,
  inputs: mod.inputs ?? [],
  writes: mod.writes ?? [],
  questionId: mod.definition.id,
}));

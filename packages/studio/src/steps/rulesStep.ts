// rulesStep — the "Rules" EditorStep descriptor (spec 082, Track A).
//
// The component lives under survey/rules/ (steps/ may import survey/ per the
// steps-layer depcruise rule — same as flowSources.ts importing the question
// registries). The step is a read-only view over the working copy: the demo
// pane simulates against the already-compiled artifact, and the sibling
// builder owns its own answers — so this step declares no writes and no
// inputs, and persists as `working-copy` like the other working-copy steps.

import type { EditorStep } from "./types.ts";
import RulesStep from "../survey/rules/RulesStep.tsx";

export const rulesStep: EditorStep = {
  kind: "editor-step",
  id: "rules",
  title: "Rules",
  spine: true,
  layout: "full",
  component: RulesStep,
  inputs: [],
  writes: [],
  specRef: ["§8", "specs/082-rule-access-tracks"],
  persistence: "working-copy",
};

// Phase G sub-registry — Track selection and project naming wizard questions.
//
// Fan-out rule: do NOT edit registry.ts directly — this file is the Phase G
// sub-registry. The main registry.ts merges all phase sub-registries.
//
// All imports are static (not dynamic) so the registry is synchronous.

import type { QuestionModule } from "../types.ts";

import trackChoiceMod from "./g/track_choice.ts";
import projectDisplayNameMod from "./g/project_display_name.ts";
import projectKeyboardIdMod from "./g/project_keyboard_id.ts";

/**
 * Flow-scoped sub-registries. Each wizard flow (track / project_name) gets its
 * OWN registry so the Flow Map drill-down's reserve-node computation
 * (computeReserveNodes) does not surface the sibling flow's questions as
 * "library-not-in-flow" nodes — mirroring how Phase A/B/F each have a dedicated
 * registry. Use these as the per-flow `registry` in FLOW_SOURCES.
 */
export const phaseTrackRegistry: Readonly<Record<string, QuestionModule>> = {
  track_choice: trackChoiceMod,
} as const;

export const phaseProjectRegistry: Readonly<Record<string, QuestionModule>> = {
  project_display_name: projectDisplayNameMod,
  project_keyboard_id: projectKeyboardIdMod,
} as const;

/**
 * Phase G synchronous sub-registry: { [questionId]: QuestionModule }
 * The union of the flow-scoped registries — merged into the main consolidated
 * registry by registry.ts (so loadModularFlow resolves every Phase G id).
 */
export const phaseGRegistry: Readonly<Record<string, QuestionModule>> = {
  ...phaseTrackRegistry,
  ...phaseProjectRegistry,
} as const;

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
 * Phase G synchronous sub-registry: { [questionId]: QuestionModule }
 * Merged into the main registry by registry.ts.
 */
export const phaseGRegistry: Readonly<Record<string, QuestionModule>> = {
  track_choice: trackChoiceMod,
  project_display_name: projectDisplayNameMod,
  project_keyboard_id: projectKeyboardIdMod,
} as const;

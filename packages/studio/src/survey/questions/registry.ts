// Question module registry.
//
// Maps question IDs to their QuestionModule objects via static imports.
// Static imports (not dynamic) keep the registry synchronous so loadModularFlow
// never needs to await a per-question lookup — the FlowDef is assembled on the
// call stack, not behind a microtask queue.
//
// Fan-out rule: when a new question module lands in questions/<phase>/<id>.ts,
// add one import + one entry here. The ID key MUST match definition.id exactly.

import type { QuestionModule } from "../types.ts";

import languageNameAutonymMod from "./a/language_name_autonym.ts";

/**
 * Synchronous registry: { [questionId]: QuestionModule }
 *
 * All entries are populated at module-init time; the map never grows at runtime.
 * If a question ID is not found here, loadModularFlow throws immediately rather
 * than silently skipping the question.
 */
export const questionRegistry: Readonly<Record<string, QuestionModule>> = {
  language_name_autonym: languageNameAutonymMod,
} as const;

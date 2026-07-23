// Phase A sub-registry.
//
// Fan-out rule: do NOT edit registry.ts directly — this file is the Phase A
// sub-registry. The main registry.ts will be consolidated by the team lead
// after all parallel agents return.
//
// One import + one entry per question module. Key MUST match definition.id exactly.
//
// This registry holds ONLY the live il_* identity-lite modules. The full
// non-identity Phase A battery (identity + provenance_*) has been physically
// relocated to questions/reserve/ and lives in registry.reserve.ts — see
// content/flows/README.md's Leftover section.

import type { QuestionModule } from "../types.ts";

import il_language_autonym from "./a/il_language_autonym.ts";
import il_language_english from "./a/il_language_english.ts";
import il_language_code from "./a/il_language_code.ts";
import il_language_region from "./a/il_language_region.ts";
import il_target_script from "./a/il_target_script.ts";
import il_script_not_supported from "./a/il_script_not_supported.ts";

/**
 * Synchronous Phase A question registry.
 * Consumed by the consolidated registry.ts once the team lead merges all
 * per-phase sub-registries.
 */
export const phaseARegistry: Readonly<Record<string, QuestionModule>> = {
  il_language_autonym,
  il_language_english,
  il_language_code,
  il_language_region,
  il_target_script,
  il_script_not_supported,
} as const;

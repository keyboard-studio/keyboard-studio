/**
 * ruleFamilies — re-export shim (spec 082 FR-018).
 *
 * The real rule-family implementation lives in the engine's kmAssist layer
 * (`@keyboard-studio/engine/kmAssist`: `groupRules`, `familyOfRule`,
 * `RuleFamily`). This module keeps the rules step's historical import path
 * stable; it carries no logic of its own. The interim studio-local grouping
 * implementation was retired once the engine version landed.
 */
export type { RuleFamily } from "@keyboard-studio/engine/kmAssist";
export { familyOfRule, groupRules } from "@keyboard-studio/engine/kmAssist";

// layout-attribution barrel export — spec 117 (Layout tab), Phase 2.
//
// Per-key attribution of a desktop layout: which rule fires for each key in
// each layer, whether the Layout tab may edit it, and why not when it can't
// (contracts/attribution.md).

export type { KeyCellAttribution, ReadOnlyReason, RowAttribution, RowShape } from "./types.js";
export { classifyRule, parseBracketKey } from "./classifyRule.js";
export type { FanoutTable, KeyRef, RuleClassification } from "./classifyRule.js";
export { attributeLayer } from "./attributeLayer.js";
export { listLayers } from "./listLayers.js";
export { listContexts } from "./listContexts.js";
export { isMnemonic } from "./isMnemonic.js";
export { isContextReachable } from "./isContextReachable.js";
export { findShadowedRules } from "./findShadowedRules.js";
export { verifyCells } from "./verifyCells.js";
export type { CellStep, FiredRuleCheck } from "./verifyCells.js";

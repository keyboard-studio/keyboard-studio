/**
 * kmAssist — the Track C language-service layer (spec 082, read-only v1).
 *
 * Rule classifier, KMN highlighter, plain-language explainer, and inventory
 * summary over IR-owned rules. READ-ONLY ONLY: no editing affordances live
 * here; editable mode arrives behind the playground gates (FR-012).
 */
export type { RuleKind } from "./classify.js";
export {
  classifyRuleKind,
  isBareContextOutput,
  isIndexedContextOutput,
  isLayerDirective,
  isNulOutput,
  isPlatformGuard,
  isSuppressionOnlyOutput,
  shapeContext,
  shapeOutput,
} from "./classify.js";
export type { SpanKind, TokenSpan } from "./highlight.js";
export { highlightRule } from "./highlight.js";
export { explainFragment, explainRule } from "./explain.js";
export type { RuleFamily } from "./group.js";
export { groupRules } from "./group.js";
export type { RuleInventory } from "./inventory.js";
export { summarizeInventory } from "./inventory.js";
// --- spec 082 FR-019/FR-020/FR-022 additions (append-only) ---
export type { ExplainContext } from "./explain.js";
export {
  analyzeDiacriticGuards,
  proposeGuardStore,
} from "./suggestGuards.js";
export type {
  DiacriticGuardAnalysis,
  MissingGuard,
  MissingGuardGroup,
  OrthographyModel,
  OverBroadGuard,
} from "./suggestGuards.js";
export { getCategory, getCCC, getName } from "./unicodeAdapter.js";

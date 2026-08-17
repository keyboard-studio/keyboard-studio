// see spec.md section 5 / section 8 — fixtures barrel

export * from "./baseKeyboards";
export * from "./patterns";
export * from "./lintFindings";
export * from "./compileResults";
export * from "./provenance";
export * from "./keyboard-ir";
export * from "./linguistInventories";
export * from "./placementMaps";
export * from "./surveySessions";
// The single reduced Cameroon-derived fixture behind the touch key<->rule join
// (spec 063). Feeds the role matrix, reachability, and the applier twins — see
// its module doc for why there is deliberately only one.
export * from "./touchKeyRuleJoin";

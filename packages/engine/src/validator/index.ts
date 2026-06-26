import type { LintFinding } from "@keyboard-studio/contracts";
import { checkIdentifiers } from "./checks/identifiers.js";
import { checkDuplicateGroups } from "./checks/duplicateGroups.js";
import { checkDuplicateStores } from "./checks/duplicateStores.js";
import { checkDeprecatedStores } from "./checks/deprecatedStores.js";
import { checkCodepointFormat } from "./checks/codepointFormat.js";
import { checkDeadkeyResolution } from "./checks/deadkeyResolution.js";
import { checkIfStoreResolution } from "./checks/ifStoreResolution.js";
import { checkContextOrdering } from "./checks/contextOrdering.js";
import { checkIndexBounds } from "./checks/indexBounds.js";

// Group taxonomy authority (mirrors the §10 group definitions in types.ts).
// `lexical`   = stateless token-level checks: #1-#4 + #7 (codepoint format).
// `reference` = symbol-table integrity (TS half): #5/#6/#8/#9.
// oracle.ts consumes these two helpers so the group->check mapping lives in
// exactly one place and runAllChecks never drifts from the oracle's grouping.

// Callers are responsible for setting location.file on each returned finding;
// individual checks always emit file: "" because they operate on raw source strings.
export function runLexicalChecks(source: string): LintFinding[] {
  return [
    ...checkIdentifiers(source),
    ...checkDuplicateGroups(source),
    ...checkDuplicateStores(source),
    ...checkDeprecatedStores(source),
    ...checkCodepointFormat(source),
  ];
}

export function runReferenceChecks(source: string): LintFinding[] {
  return [
    ...checkDeadkeyResolution(source),
    ...checkIfStoreResolution(source),
    ...checkContextOrdering(source),
    ...checkIndexBounds(source),
  ];
}

export function runAllChecks(source: string): LintFinding[] {
  return [...runLexicalChecks(source), ...runReferenceChecks(source)];
}

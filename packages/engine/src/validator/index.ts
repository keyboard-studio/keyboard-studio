import type { LintFinding } from "@keyboard-studio/contracts";
import { checkIdentifiers } from "./checks/identifiers.js";
import { checkDuplicateGroups } from "./checks/duplicateGroups.js";
import { checkDuplicateStores } from "./checks/duplicateStores.js";
import { checkDeprecatedStores } from "./checks/deprecatedStores.js";
import { checkDeadkeyResolution } from "./checks/deadkeyResolution.js";
import { checkIfStoreResolution } from "./checks/ifStoreResolution.js";
import { checkCodepointFormat } from "./checks/codepointFormat.js";
import { checkContextOrdering } from "./checks/contextOrdering.js";
import { checkIndexBounds } from "./checks/indexBounds.js";

// Callers are responsible for setting location.file on each returned finding;
// individual checks always emit file: "" because they operate on raw source strings.
export function runLexicalChecks(source: string): LintFinding[] {
  return [
    ...checkIdentifiers(source),
    ...checkDuplicateGroups(source),
    ...checkDuplicateStores(source),
    ...checkDeprecatedStores(source),
  ];
}

export function runSemanticChecks(source: string): LintFinding[] {
  return [
    ...checkDeadkeyResolution(source),
    ...checkIfStoreResolution(source),
    ...checkCodepointFormat(source),
    ...checkContextOrdering(source),
    ...checkIndexBounds(source),
  ];
}

export function runAllChecks(source: string): LintFinding[] {
  return [...runLexicalChecks(source), ...runSemanticChecks(source)];
}

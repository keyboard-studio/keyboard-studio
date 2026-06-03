import type { LintFinding } from "@keyboard-studio/contracts";
import { checkIdentifiers } from "./checks/identifiers.js";
import { checkDuplicateGroups } from "./checks/duplicateGroups.js";
import { checkDuplicateStores } from "./checks/duplicateStores.js";
import { checkDeprecatedStores } from "./checks/deprecatedStores.js";

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

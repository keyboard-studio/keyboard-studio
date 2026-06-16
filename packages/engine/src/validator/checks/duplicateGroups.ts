import type { LintFinding } from "@keyboard-studio/contracts";
import { checkForDuplicateDeclarations } from "./_shared.js";

// Matches a group declaration line: group(name) ...
// Case-insensitive per CheckForDuplicates.cpp:13-29
const GROUP_DECL_RE = /^\s*group\s*\(\s*([^)]+?)\s*\)/i;

export function checkDuplicateGroups(source: string): LintFinding[] {
  return checkForDuplicateDeclarations(
    source,
    GROUP_DECL_RE,
    "KM_ERROR_DUPLICATE_GROUP",
    "group",
  );
}

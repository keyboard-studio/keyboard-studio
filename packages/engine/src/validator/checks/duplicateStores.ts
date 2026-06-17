import type { LintFinding } from "@keyboard-studio/contracts";
import { STORE_DECL_RE, checkForDuplicateDeclarations } from "./_shared.js";

export function checkDuplicateStores(source: string): LintFinding[] {
  // System stores (&BITMAP, &PLATFORM, etc.) are exempt from duplicate checking.
  return checkForDuplicateDeclarations(
    source,
    STORE_DECL_RE,
    "KM_ERROR_DUPLICATE_STORE",
    "store",
    "&",
  );
}

import type { LintFinding } from "@keyboard-studio/contracts";
import { forEachMatch, stripNonCodeSource } from "./_shared.js";

// Deprecated system store IDs per DeprecationChecks.cpp:16-50 — illegal since Keyman v10.
// Keys are lowercase KMN system-store names (without &); values are the C constant name.
const DEPRECATED_STORES = new Map<string, string>([
  ["language", "TSS_LANGUAGE"],
  ["layout", "TSS_LAYOUT"],
  ["languagename", "TSS_LANGUAGENAME"],
  ["ethnologuecode", "TSS_ETHNOLOGUECODE"],
  ["windowslanguages", "TSS_WINDOWSLANGUAGES"],
]);

// Matches &identifier anywhere in a line (e.g. store(&LANGUAGE) or if(&layout = ...))
const SYSTEM_STORE_RE = /&([A-Za-z_][A-Za-z0-9_]*)/g;

export function checkDeprecatedStores(source: string): LintFinding[] {
  const findings: LintFinding[] = [];

  // Strip quoted-string and comment spans first so an `&store` in prose (a
  // trailing `c` comment or a quoted doc value) is not read as a store ref.
  forEachMatch(stripNonCodeSource(source), SYSTEM_STORE_RE, (match, lineIdx) => {
    const rawName = match[1] ?? "";
    const tssName = DEPRECATED_STORES.get(rawName.toLowerCase());
    if (tssName !== undefined) {
      findings.push({
        code: "KM_ERROR_DEPRECATED_STORE",
        severity: "error",
        layer: "A",
        message: `&${rawName} (${tssName}) is deprecated and illegal since Keyman v10`,
        location: { file: "", line: lineIdx + 1, column: match.index + 1 },
      });
    }
  });

  return findings;
}

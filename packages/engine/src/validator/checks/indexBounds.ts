import type { LintFinding } from "@keyboard-studio/contracts";
import { collectDeclaredStores, type StoreInfo } from "./_shared.js";

// index(store, N) bounds — lint.md check #13 (warn-only).
// Validates that:
//   1. The store name referenced in index(store, N) is declared in the source.
//   2. The offset N is >= 1 (1-based).
//   3. If an any() call appears on the same line (context side), the declared
//      store must have length >= the number of any() tokens (warn, not error).
// All findings are warnings (KM_WARN_*).

// Matches index(storeName, offset) — captures store name and offset.
const INDEX_RE = /\bindex\s*\(\s*([^,)]+?)\s*,\s*(\d+)\s*\)/;

// Matches any() in a line.
const ANY_RE = /\bany\s*\([^)]*\)/g;

export function checkIndexBounds(source: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const declared = collectDeclaredStores(source);
  const lines = source.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const re = new RegExp(INDEX_RE.source, "gi");
    let match: RegExpExecArray | null;

    while ((match = re.exec(line)) !== null) {
      const rawName = (match[1] ?? "").trim();
      const offset = parseInt(match[2] ?? "0", 10);
      const key = rawName.toLowerCase();

      // Check 1: store must be declared.
      if (!declared.has(key)) {
        findings.push({
          code: "KM_WARN_INDEX_STORE_UNDECLARED",
          severity: "warning",
          layer: "A",
          message: `Store "${rawName}" used in index() is not declared`,
          location: { file: "", line: lineIdx + 1, column: match.index + 1 },
        });
        continue; // can't check further without knowing the store
      }

      // Check 2: offset must be >= 1.
      if (offset < 1) {
        findings.push({
          code: "KM_WARN_INDEX_OFFSET_INVALID",
          severity: "warning",
          layer: "A",
          message: `index() offset ${offset} is invalid; offsets are 1-based (minimum 1)`,
          location: { file: "", line: lineIdx + 1, column: match.index + 1 },
        });
      }

      // Check 3: store length >= any() count on this line (warn only).
      const anyCount = (line.match(ANY_RE) ?? []).length;
      const storeInfo = declared.get(key);
      if (anyCount > 0 && storeInfo?.length !== null && storeInfo?.length !== undefined) {
        if (storeInfo.length < anyCount) {
          findings.push({
            code: "KM_WARN_INDEX_STORE_TOO_SHORT",
            severity: "warning",
            layer: "A",
            message: `Store "${rawName}" has ${storeInfo.length} entries but there are ${anyCount} any() token(s) on this line; store length should be >= any() count`,
            location: { file: "", line: lineIdx + 1, column: match.index + 1 },
          });
        }
      }
    }
  }

  return findings;
}

import type { LintFinding } from "@keyboard-studio/contracts";

// if() store resolution — lint.md check #9 (Compiler.cpp:2833-2906).
// Every store name referenced in an if() condition must be declared somewhere
// in the source (either as a user store or as a recognised system store such as
// &platform, &layer, &baselayout, &mnemoniclayout, &bitmap).
// Unresolved references are errors.

// Recognised system stores that are always available without a store() declaration.
const SYSTEM_STORES = new Set([
  "&platform",
  "&layer",
  "&baselayout",
  "&mnemoniclayout",
  "&bitmap",
]);

// Matches an if() condition and captures the store name (first arg before = or ,).
// Handles: if(storeName = 'val') and if(storeName, 'val').
// Quantifier is capped at 255 chars (the KMN identifier limit) to prevent ReDoS.
const IF_COND_RE = /\bif\s*\(\s*([^=,)]{1,255})/;

// Matches a store declaration: store(name)
const STORE_DECL_RE = /^\s*store\s*\(\s*([^)]+?)\s*\)/i;

function collectDeclaredStores(source: string): Set<string> {
  const stores = new Set<string>();
  for (const line of source.split("\n")) {
    const m = STORE_DECL_RE.exec(line);
    if (m) {
      const name = (m[1] ?? "").trim();
      stores.add(name.toLowerCase());
    }
  }
  return stores;
}

export function checkIfStoreResolution(source: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const declared = collectDeclaredStores(source);
  const lines = source.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const re = new RegExp(IF_COND_RE.source, "gi");
    let match: RegExpExecArray | null;

    while ((match = re.exec(line)) !== null) {
      const raw = (match[1] ?? "").trim();

      // System stores (start with &) are always valid if recognised.
      if (raw.startsWith("&")) {
        if (!SYSTEM_STORES.has(raw.toLowerCase())) {
          findings.push({
            code: "KM_ERROR_UNRESOLVED_IF_STORE",
            severity: "error",
            layer: "A",
            message: `Unrecognised system store "${raw}" in if() condition`,
            location: { file: "", line: lineIdx + 1, column: match.index + 1 },
          });
        }
        continue;
      }

      if (!declared.has(raw.toLowerCase())) {
        findings.push({
          code: "KM_ERROR_UNRESOLVED_IF_STORE",
          severity: "error",
          layer: "A",
          message: `Store "${raw}" used in if() condition is not declared`,
          location: { file: "", line: lineIdx + 1, column: match.index + 1 },
        });
      }
    }
  }

  return findings;
}

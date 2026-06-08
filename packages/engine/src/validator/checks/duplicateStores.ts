import type { LintFinding } from "@keyboard-studio/contracts";
import { STORE_DECL_RE } from "./_shared.js";

export function checkDuplicateStores(source: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const seen = new Map<string, number>(); // lowercase name -> first line (1-based)
  const lines = source.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const match = STORE_DECL_RE.exec(line);
    if (!match) continue;

    const name = (match[1] ?? "").trim();
    // System stores (&BITMAP, &PLATFORM, etc.) are exempt from duplicate checking
    if (name.startsWith("&")) continue;

    const key = name.toLowerCase();
    const firstLine = seen.get(key);

    if (firstLine !== undefined) {
      findings.push({
        code: "KM_ERROR_DUPLICATE_STORE",
        severity: "error",
        layer: "A",
        message: `Duplicate store name "${name}" (first declared on line ${firstLine})`,
        location: { file: "", line: lineIdx + 1, column: match.index + 1 },
      });
    } else {
      seen.set(key, lineIdx + 1);
    }
  }

  return findings;
}

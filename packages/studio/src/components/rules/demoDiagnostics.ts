// Pure helper for the demo pane's compile-diagnostics lists.
//
// The compiler can emit hundreds of identical diagnostics for one keyboard
// (one per affected rule). This groups them by code, keeping a count, the
// distinct .kmn lines and one representative diagnostic. The wording for each
// group comes from lib/plainDiagnosticMessage.ts (rendering stays in DemoPane).

import type { CompilerDiagnostic, DiagnosticPlatform } from "@keyboard-studio/contracts";

/** HINT_UnreachableRule as the kmc-kmn bridge emits it: a later rule repeats an earlier left-hand side. */
export const CODE_UNREACHABLE_RULE = "KM_HINT_KMCMP_3154094";

export interface DemoDiagnosticGroup {
  code: string;
  /** Number of distinct (code, line, message) occurrences sharing this code. */
  count: number;
  /** Distinct .kmn line numbers, ascending. */
  lines: number[];
  /** First diagnostic seen for the code; feeds plainDiagnosticMessage. */
  representative: CompilerDiagnostic;
}

/**
 * Group by code in first-seen order. Info-severity diagnostics are dropped
 * unless `includeInfo` is set: the demo's notes list is for actionable
 * notes, and info detail stays available in the error branch (which keeps
 * every severity) and on the review screen. Warnings, errors and fatals
 * are never hidden.
 *
 * When `platform` is set, diagnostics tagged for the OTHER platform are
 * dropped (#2378): the desktop demo shows desktop notes, and the touch
 * step's surface will show web notes once it ships. Diagnostics with no
 * platform tag (unowned — synthesized or from another producer) are NEVER
 * dropped by this filter: an unknown home is not a reason to hide a note.
 * The review screen's DiagnosticsPanel takes no `platform` and shows
 * everything, so nothing is dropped from the app as a whole.
 */
export function groupDemoDiagnostics(
  diagnostics: readonly CompilerDiagnostic[],
  options: { includeInfo?: boolean; platform?: DiagnosticPlatform } = {},
): DemoDiagnosticGroup[] {
  const byCode = new Map<string, DemoDiagnosticGroup>();
  const lineSets = new Map<string, Set<number>>();
  // kmc-kmn runs kmcmplib twice (desktop and web passes), so most diagnostics
  // arrive twice with the same code, line and message; count each once.
  const seen = new Set<string>();
  for (const d of diagnostics) {
    if (d.severity === "info" && options.includeInfo !== true) continue;
    if (
      options.platform !== undefined &&
      d.platform !== undefined &&
      d.platform !== options.platform
    ) {
      continue;
    }
    const key = `${d.code}|${d.location?.line ?? ""}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let g = byCode.get(d.code);
    if (g === undefined) {
      g = { code: d.code, count: 0, lines: [], representative: d };
      byCode.set(d.code, g);
      lineSets.set(d.code, new Set());
    }
    g.count += 1;
    if (d.location !== undefined) lineSets.get(d.code)?.add(d.location.line);
  }
  for (const [code, g] of byCode) {
    g.lines = [...(lineSets.get(code) ?? [])].sort((a, b) => a - b);
  }
  return [...byCode.values()];
}

/** Total diagnostics across groups (the disclosure headline count). */
export function totalDemoDiagnostics(groups: readonly DemoDiagnosticGroup[]): number {
  return groups.reduce((n, g) => n + g.count, 0);
}

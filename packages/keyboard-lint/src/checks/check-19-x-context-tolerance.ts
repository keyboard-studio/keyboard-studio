// Check 19.x — KM_WARN_CONTEXT_NOT_TOLERANT / KM_HINT_CONTEXT_NOT_ANALYSED
// (spec 062, US2). Classifies a precomputed `ToleranceReport`
// (packages/engine/src/validator/context-tolerance.ts) into Layer C findings.
// No fix is applied here or anywhere in Layer C — see spec 062 US2's
// "diagnose only" scope.
//
// Boundary note (plan.md Constitution Check / Complexity Tracking): the
// behavioural both-forms comparison that produces `ToleranceReport` runs
// entirely inside `packages/engine` because it needs the simulator.
// `keyboard-lint` is dependency-cruiser-forbidden from importing
// `packages/engine` (`lint-not-to-engine`), so this check only classifies an
// already-computed report — it never runs the comparison itself.
//
// FR-012 wording note (tasks.md T012's open design question, resolved here) —
// KNOWN GAP, tracked, not silently satisfied: FR-012 asks for characters to
// be named "by codepoint AND Unicode name". `RuleToleranceFinding.
// precomposedOutput`/`decomposedOutput` hold raw codepoints only
// (data-model.md's stated intent for the contract type), and the only
// Unicode-name lookup table (`engine/src/character-discovery/charNames.ts`)
// is engine-side and async — wiring it in here would cross the same
// forbidden boundary this check exists to respect. This check therefore
// names characters by codepoint ONLY (`U+XXXX`, the same notation
// `check-18-6-inventory-coverage.ts` already uses) — the "Unicode name" half
// of FR-012 is NOT met by this check. The intended resolution is a
// studio-side renderer that decorates a `KM_WARN_CONTEXT_NOT_TOLERANT`
// finding's `U+XXXX` codepoints with names (e.g. via `charNames.ts`, or the
// studio's own `survey/codepointLabel.ts`) at display time — no such
// wiring exists in `packages/studio` as of spec 062's implementation; this
// is a genuine, open follow-up, not a completed deferral.

import type { KeyboardIR, LintFinding, RuleToleranceFinding, ToleranceReport } from "@keyboard-studio/contracts";

function toCodepointNotation(text: string): string {
  return [...text]
    .map((ch) => "U+" + (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"))
    .join(" ");
}

function describeOutput(text: string): string {
  return `"${text}" (${toCodepointNotation(text)})`;
}

/** A diagnosed behavioural gap — the pre-fix "gap found" state (both outputs populated). */
function isDiagnosedGap(finding: RuleToleranceFinding): boolean {
  return finding.failingKeystrokes !== undefined;
}

function gapFinding(finding: RuleToleranceFinding): LintFinding {
  return {
    code: "KM_WARN_CONTEXT_NOT_TOLERANT",
    severity: "warning",
    layer: "C",
    message:
      `Rule "${finding.ruleId}" produces different output depending on how the text before ` +
      `the key was entered: ${describeOutput(finding.precomposedOutput ?? "")} in one case and ` +
      `${describeOutput(finding.decomposedOutput ?? "")} in the other.`,
    location: finding.location,
    hint: "Generate a matching rule for the other input form so this key behaves the same regardless of how the preceding text was typed.",
  };
}

function notAnalysedFinding(finding: RuleToleranceFinding): LintFinding {
  return {
    code: "KM_HINT_CONTEXT_NOT_ANALYSED",
    severity: "hint",
    layer: "C",
    message: finding.notAnalysedReason
      ? `Rule "${finding.ruleId}" could not be checked for canonical-equivalence context tolerance: ${finding.notAnalysedReason}.`
      : `Rule "${finding.ruleId}" could not be checked for canonical-equivalence context tolerance.`,
    location: finding.location,
  };
}

/**
 * Classify a precomputed `ToleranceReport` into Layer C findings. Absent
 * report -> no-op, mirroring the existing `inventory`/`touchLayout` gating in
 * `lintContext.ts`. Never runs the behavioural comparison itself.
 */
export function checkContextTolerance(
  ir: KeyboardIR,
  toleranceReport: ToleranceReport | undefined,
): LintFinding[] {
  if (toleranceReport === undefined) return [];

  const findings: LintFinding[] = [];
  for (const finding of toleranceReport.findings) {
    if (finding.status === "tolerant" || finding.status === "made-tolerant") continue;
    findings.push(isDiagnosedGap(finding) ? gapFinding(finding) : notAnalysedFinding(finding));
  }
  return findings;
}

// The context-tolerance analysis the compile gate runs after `ready`
// (spec 078, contracts/studio-tolerance-state.md § Analysis task).
//
// Pure async function over the keyboard the preview compiled: load the engine
// subpath, diagnose (computeContextTolerance), propose fixes
// (proposeContextVariants), classify through Layer C (lintContextTolerance),
// then derive the fixable rules, their site keys and their fingerprint.
// `isCurrent` is checked after every await so a superseded compile run stops
// as soon as it can; a stale run resolves to `null`.
//
// When a fix is already applied, its rules are in the compiled keyboard. The
// analysis removes them first and works on the keyboard as it would be
// without the fix, so the decision's fingerprint and sites do not change just
// because the fix landed; a fixed site that is really present is then
// reported `made-tolerant` rather than as a gap.

import type { KeyboardIR, LintFinding } from "@keyboard-studio/contracts";
import { lintContextTolerance } from "@keymanapp/keyboard-lint";

import type { AppliedContextTolerance, ContextToleranceState } from "../stores/workingCopyStore.ts";
import { loadContextToleranceEngine } from "./contextToleranceEngine.ts";

export type ContextToleranceResult = Omit<Extract<ContextToleranceState, { status: "ready" }>, "status" | "runId">;

/**
 * Run the analysis on `ir`. Resolves `null` when `isCurrent()` turns false
 * between steps. Throws on an engine error; the caller records `failed`.
 */
export async function analyseContextTolerance(
  ir: KeyboardIR,
  isCurrent: () => boolean,
  applied: AppliedContextTolerance | null = null,
): Promise<ContextToleranceResult | null> {
  const engine = await loadContextToleranceEngine();
  if (!isCurrent()) return null;

  const analysedIr = applied === null ? ir : engine.removeContextToleranceOverlay(ir, applied.overlay);
  const report = await engine.computeContextTolerance(analysedIr);
  if (!isCurrent()) return null;

  const proposal = await engine.proposeContextVariants(analysedIr, report);
  if (!isCurrent()) return null;

  const classification = Object.fromEntries(
    report.findings.map((f) => [f.ruleId, engine.classifyToleranceFinding(f)] as const),
  );
  // A gap rule is fixable when the generator produced at least one variant for
  // it; every other gap was refused (FR-010) and stays advisory only.
  const gapRuleIds = new Set(report.findings.filter((f) => classification[f.ruleId] === "gap").map((f) => f.ruleId));
  const fixableRuleIds = [...new Set(proposal.variants.map((v) => v.sourceRuleId))]
    .filter((id) => gapRuleIds.has(id))
    .sort();
  const siteKeys = engine.toleranceSiteKeys(analysedIr, fixableRuleIds);
  const fingerprint = engine.toleranceFingerprint(analysedIr, fixableRuleIds);

  // Sites whose applied rules really made it into the compiled keyboard.
  const fixedSites = new Set(applied === null ? [] : engine.presentContextToleranceSites(ir, applied.overlay));
  for (const id of fixableRuleIds) {
    if (fixedSites.has(siteKeys[id] ?? "")) classification[id] = "made-tolerant";
  }

  const fixedLines = new Set(
    report.findings.filter((f) => classification[f.ruleId] === "made-tolerant").map((f) => f.location.line),
  );
  const findings: LintFinding[] = lintContextTolerance(analysedIr, report).filter(
    (f) => !(f.code === "KM_WARN_CONTEXT_NOT_TOLERANT" && f.location !== undefined && fixedLines.has(f.location.line)),
  );

  return { report, findings, classification, proposal, analysedIr, fixableRuleIds, siteKeys, fingerprint };
}

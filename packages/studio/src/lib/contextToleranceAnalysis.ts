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
//
// Spec 086: when the report has gap findings, the proposal is the generated
// normalization step (one all-or-nothing site, `normalization-step`), taken
// from the authoring cache. Only when the generator refuses for a reason other
// than `no-alternates`, or a committed verification record says the step
// regressed typed output, does the spec 062 per-rule variants proposal run
// instead (FR-019), with the reason carried for display. `no-alternates`
// proposes nothing.

import type {
  KeyboardIR,
  LintFinding,
  NormalizationRefusalReason,
  NormalizationStep,
  StoredNormalizationStep,
} from "@keyboard-studio/contracts";
import { lintContextTolerance } from "@keymanapp/keyboard-lint";

import type { AppliedContextTolerance, ContextToleranceState } from "../stores/workingCopyStore.ts";
import { loadContextToleranceEngine } from "./contextToleranceEngine.ts";
import { getOrProposeNormalizationStep } from "./normalizationStepCache.ts";

export type ContextToleranceResult = Omit<Extract<ContextToleranceState, { status: "ready" }>, "status" | "runId">;

/** The committed corpus-harness verdict for one keyboard source (spec 086 US4). */
export type NormalizationVerification = "verified" | "regressed" | "refused" | "unknown";

export interface ContextToleranceAnalysisOptions {
  /** The persisted cache entry; used only when its key matches the current source. */
  normalizationSnapshot?: StoredNormalizationStep | null;
  /** Called with the entry to persist after the cache is consulted. */
  onNormalizationStored?: (stored: StoredNormalizationStep) => void;
  /** Looks up the committed verification record; defaults to `"unknown"`. */
  verificationLookup?: (keyboardId: string) => NormalizationVerification | Promise<NormalizationVerification>;
  /**
   * Ids the analysed keyboard was derived from (the base keyboard the working
   * copy was scaffolded from). Copy-a-keyboard instantiation rewrites
   * `header.keyboardId` (resetIdentity), so a copy of a regressed keyboard
   * would escape the id-keyed record; the lineage ids are looked up as well
   * and a `regressed` verdict on any of them vetoes the step.
   */
  verificationLineage?: readonly string[];
}

/**
 * Run the analysis on `ir`. Resolves `null` when `isCurrent()` turns false
 * between steps. Throws on an engine error; the caller records `failed`.
 */
export async function analyseContextTolerance(
  ir: KeyboardIR,
  isCurrent: () => boolean,
  applied: AppliedContextTolerance | null = null,
  options: ContextToleranceAnalysisOptions = {},
): Promise<ContextToleranceResult | null> {
  const engine = await loadContextToleranceEngine();
  if (!isCurrent()) return null;

  const analysedIr = applied === null ? ir : engine.removeContextToleranceOverlay(ir, applied.overlay);
  const report = await engine.computeContextTolerance(analysedIr);
  if (!isCurrent()) return null;

  const classification = Object.fromEntries(
    report.findings.map((f) => [f.ruleId, engine.classifyToleranceFinding(f)] as const),
  );
  // A gap rule is fixable when the generator produced at least one variant for
  // it; every other gap was refused (FR-010) and stays advisory only.
  const gapRuleIds = new Set(report.findings.filter((f) => classification[f.ruleId] === "gap").map((f) => f.ruleId));

  // Spec 086: the normalization step is the default proposal for gap findings.
  let step: NormalizationStep | null = null;
  let stepCacheKey = "";
  let fallbackReason: NormalizationRefusalReason | "verification-regressed" | undefined;
  let proposeVariants = true;
  if (gapRuleIds.size > 0) {
    const lookup = await getOrProposeNormalizationStep(analysedIr, options.normalizationSnapshot);
    if (!isCurrent()) return null;
    if (lookup.stored !== null) options.onNormalizationStored?.(lookup.stored);
    stepCacheKey = lookup.cacheKey;
    if (lookup.result.kind === "step") {
      let verdict: NormalizationVerification = "unknown";
      if (options.verificationLookup !== undefined) {
        for (const id of [analysedIr.header.keyboardId, ...(options.verificationLineage ?? [])]) {
          if ((await options.verificationLookup(id)) === "regressed") {
            verdict = "regressed";
            break;
          }
        }
      }
      if (!isCurrent()) return null;
      if (verdict === "regressed") fallbackReason = "verification-regressed";
      else {
        step = lookup.result.step;
        proposeVariants = false;
      }
    } else if (lookup.result.reason === "no-alternates") {
      proposeVariants = false; // nothing to normalize: neither the step nor the 062 fallback
    } else {
      fallbackReason = lookup.result.reason;
    }
  }

  const proposal = proposeVariants
    ? await engine.proposeContextVariants(analysedIr, report)
    : { ir: analysedIr, variants: [], disclosures: {} };
  if (!isCurrent()) return null;

  let fixableRuleIds: string[];
  let siteKeys: Record<string, string>;
  let fingerprint: string;
  let fixedSites: Set<string>;
  if (step !== null) {
    fixableRuleIds = [engine.NORMALIZATION_STEP_SITE_ID];
    siteKeys = { [engine.NORMALIZATION_STEP_SITE_ID]: engine.NORMALIZATION_STEP_SITE_ID };
    fingerprint = `${engine.NORMALIZATION_STEP_SITE_ID}|${stepCacheKey}`;
    fixedSites = new Set(applied === null ? [] : engine.presentContextToleranceSites(ir, applied.overlay));
    // The step covers every gap: once it is really in the keyboard, none is a gap.
    if (fixedSites.has(engine.NORMALIZATION_STEP_SITE_ID)) {
      for (const id of gapRuleIds) classification[id] = "made-tolerant";
    }
  } else {
    fixableRuleIds = [...new Set(proposal.variants.map((v) => v.sourceRuleId))]
      .filter((id) => gapRuleIds.has(id))
      .sort();
    siteKeys = engine.toleranceSiteKeys(analysedIr, fixableRuleIds);
    fingerprint = engine.toleranceFingerprint(analysedIr, fixableRuleIds);
    // Sites whose applied rules really made it into the compiled keyboard.
    fixedSites = new Set(applied === null ? [] : engine.presentContextToleranceSites(ir, applied.overlay));
    for (const id of fixableRuleIds) {
      if (fixedSites.has(siteKeys[id] ?? "")) classification[id] = "made-tolerant";
    }
  }

  const fixedLines = new Set(
    report.findings.filter((f) => classification[f.ruleId] === "made-tolerant").map((f) => f.location.line),
  );
  const findings: LintFinding[] = lintContextTolerance(analysedIr, report).filter(
    (f) => !(f.code === "KM_WARN_CONTEXT_NOT_TOLERANT" && f.location !== undefined && fixedLines.has(f.location.line)),
  );

  return {
    report,
    findings,
    classification,
    proposal,
    analysedIr,
    fixableRuleIds,
    siteKeys,
    fingerprint,
    ...(step !== null ? { normalizationStep: step } : {}),
    ...(fallbackReason !== undefined ? { fallbackReason } : {}),
  };
}

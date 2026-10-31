// judgeForeign — the foreign-mode criteria assembly as a pure-ish,
// React-free module.
//
// Moved verbatim out of hooks/useCompareCriteria.ts so the SAME assembly
// can run inside a Web Worker (the /review Health Check judges untrusted
// PR snapshots; the battery must not be able to hang the page's main
// thread). useCompareCriteria re-exports these symbols, so the Compare tab
// and its verification tests keep importing from the hook module.
//
// Assembly: doc findings from runDocChecks(collectDocLintInputFromVfs(...))
// over the real shipped files, merged doc-first (mergeLintFindings) with
// the engine findings from KeyboardLintEngine.lintWithContext over
// assembleLintContext's context — NO inventory (a foreign keyboard has
// no linguist inventory in the studio, so §18.6 resolves Not yet
// checkable via contextMissing, never Met), the empty record (no
// attestations or confirmations exist for a keyboard the author does
// not own), and foreign mode. No authoring store is imported here
// (FR-023).
//
// FACTS (plan D7, conservative): fontBundled is read from the VFS with
// the same extension test as deriveCriteriaFacts. For deprecated /
// partnerPackage there is NO reliable signal available here, and this
// module states that rather than guessing: StartKeyboard carries no
// deprecation or partner field, its `path` is always under `release/`
// for catalog keyboards (the keyboards repo's `legacy/` tier — the only
// path-shaped deprecation-adjacent signal — is deliberately never
// offered by the start browser, and "deprecated" is a per-keyboard
// repository state, not a folder), and the VFS holds no such marker
// either. D7's rule is that a criterion is Not applicable only via a
// named predicate with evidence, never merely because data is absent —
// so deprecated: true / partnerPackage: true are passed, making
// §§15–16 APPLICABLE by default. Their rows then resolve honestly
// (Not yet checkable / Needs human) instead of a false Not applicable
// claim about a keyboard whose deprecation/partner status the studio
// simply does not know.

import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import type {
  CompileResult,
  CriteriaPlacement,
  LintFinding,
  ReviewContext,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { KeyboardLintEngine, runDocChecks } from "@keymanapp/keyboard-lint";

import { assembleLintContext } from "./assembleLintContext.ts";
import { deriveCriteriaFacts } from "./deriveCriteriaFacts.ts";
import { licenseTextHints } from "./fontLicense.ts";
import { resolveCriteria } from "./resolveCriteria.ts";
import {
  EMPTY_CRITERIA_RECORD,
  type CriteriaResult,
} from "./criteriaTypes.ts";
import { collectDocLintInputFromVfs } from "../lib/collectDocLintInputFromVfs.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { mergeLintFindings } from "./mergeFindings.ts";

/** Options the host supplies (Compare artifact, /review target). */
export interface JudgeForeignOptions {
  /**
   * The pipeline's compile result for this keyboard (the §§7.6/7.21
   * severity mapping). Omitted when no compile ran — the compile rows
   * then resolve Not yet checkable, never Met.
   */
  compileResult?: CompileResult | null;
  /**
   * Repository placement from the keyboard's repo path (§13.1).
   * Defaults to "release" when the path is unknown.
   */
  placement?: CriteriaPlacement;
  /**
   * Repository context for the /review-only checks (Batch 5 + Group C):
   * repo path, tree/PR file list, PR body, HISTORY.md. The /review host
   * sets this; other foreign hosts (Compare) never do.
   */
  reviewContext?: ReviewContext;
}

/**
 * The repository placement a keyboard's repo path states:
 * `release/…`, `experimental/…`, or `legacy/…` — the first segment is
 * the keyboards repo's tier folder. Anything else is "unknown".
 */
export function placementFromRepoPath(
  path: string | undefined,
): CriteriaPlacement {
  const tier = path?.split("/")[0];
  if (tier === "release" || tier === "experimental" || tier === "legacy") {
    return tier;
  }
  return "unknown";
}

/**
 * Whether the review context carries an adaptation signal (§19): the PR
 * body or HISTORY.md mentions "adapted from". Without it the §19
 * attribution rows resolve Not applicable.
 */
function isAdaptationSignal(
  reviewContext: ReviewContext | undefined,
): boolean {
  if (reviewContext === undefined) return false;
  const haystacks = [
    reviewContext.prBody ?? "",
    reviewContext.historyMd ?? "",
  ];
  return haystacks.some((t) => /adapted\s+from/i.test(t));
}

/**
 * Judge one foreign keyboard VFS: doc + engine findings, merged, run
 * through the pure resolver in foreign mode. A failed engine run does
 * not discard the judgment: the doc findings still stand, and the
 * contextMissing map keeps the checks that could not run resolving
 * Not yet checkable rather than Met.
 *
 * The assembly runs with the foreign flags — scratchScan on (1.13's
 * CHECK-NOW arm; authored mode precertifies instead and never scans) and
 * deprecationInPlay on (mirroring the facts below, §§15–16 applicable by
 * default). No precertified set is ever passed here.
 */
export async function judgeForeignKeyboard(
  vfs: VirtualFS,
  keyboardId: string,
  displayName: string,
  options: JudgeForeignOptions = {},
): Promise<CriteriaResult> {
  const { ctx, contextMissing } = assembleLintContext({
    vfs,
    keyboardId,
    placement: options.placement ?? "release",
    scratchScan: true,
    deprecationInPlay: true,
    ...(options.reviewContext !== undefined
      ? { reviewContext: options.reviewContext }
      : {}),
  });
  const docFindings = runDocChecks(
    collectDocLintInputFromVfs(vfs, keyboardId, displayName),
  );
  let engineFindings: LintFinding[] = [];
  let verifiedByCode = new Map<string, string[]>();
  try {
    const engine = await new KeyboardLintEngine().lintWithContext(
      vfs,
      keyboardId,
      ctx,
    );
    engineFindings = engine.findings;
    verifiedByCode = engine.verifiedByCode;
  } catch {
    engineFindings = [];
  }
  const facts = {
    ...deriveCriteriaFacts(vfs),
    deprecated: true,
    partnerPackage: true,
    // §19 adaptation signal: the PR body or HISTORY.md mentions an
    // adaptation. Without it the §19 rows resolve Not applicable.
    isAdaptation: isAdaptationSignal(options.reviewContext),
  };
  return resolveCriteria({
    criteria: ALL_CRITERIA,
    mode: "foreign",
    lintFindings: mergeLintFindings(docFindings, engineFindings),
    verifiedByCode,
    record: EMPTY_CRITERIA_RECORD,
    facts,
    contextMissing,
    compileResult: options.compileResult ?? null,
    // §9.2 supporting evidence only (never decides the row).
    licenseTextHints: licenseTextHints(readVfsText(vfs, "LICENSE.md")),
  });
}

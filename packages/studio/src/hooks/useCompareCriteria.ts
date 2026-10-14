// useCompareCriteria — the foreign-mode criteria result for the Compare
// tab (spec 084, plan §4/§5, task T5.2).
//
// Gated on the Compare artifact's stage being ready: until the compile
// pipeline settles there is no VFS to judge, and this hook returns
// `{ result: null, ready: false }` — the panel renders a stated loading
// note instead of half-judged verdicts. Once ready, one run per exact
// VFS identity (the run-settling pattern from useCriteriaFindings: a
// recompiled artifact with the same file names never inherits a stale
// run) judges that VFS via judgeForeignKeyboard() below, and the result
// is returned only for the VFS it was computed from.
//
// judgeForeignKeyboard is the whole foreign assembly in one pure-ish
// function (reads only the VFS it is handed), exported so the T5.3
// preview-mutation verification test can run the SAME assembly over a
// pristine VFS and over a preview-mutated copy and compare verdicts —
// duplicating the assembly in the test would verify a copy, not this.
//
// Assembly: doc findings from runDocChecks(collectDocLintInputFromVfs(...))
// over the real shipped files, merged doc-first (mergeLintFindings) with
// the engine findings from KeyboardLintEngine.lintWithContext over
// assembleLintContext's context — NO inventory (a foreign keyboard has
// no linguist inventory in the studio, so §18.6 resolves Not yet
// checkable via contextMissing, never Met), the empty record (no
// attestations or confirmations exist for a keyboard the author does
// not own), and foreign mode. This hook imports no authoring store at
// all (FR-023).
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

import { useEffect, useState } from "react";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import type {
  CompileResult,
  CriteriaPlacement,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { KeyboardLintEngine, runDocChecks } from "@keymanapp/keyboard-lint";

import { assembleLintContext } from "../criteria/assembleLintContext.ts";
import { deriveCriteriaFacts } from "../criteria/deriveCriteriaFacts.ts";
import { licenseTextHints } from "../criteria/fontLicense.ts";
import { resolveCriteria } from "../criteria/resolveCriteria.ts";
import {
  EMPTY_CRITERIA_RECORD,
  type CriteriaResult,
} from "../criteria/criteriaTypes.ts";
import { collectDocLintInputFromVfs } from "../lib/collectDocLintInputFromVfs.ts";
import { readVfsText } from "../lib/vfsText.ts";
import type { CompareArtifact } from "./useCompareArtifact.ts";
import { mergeLintFindings } from "./useCriteriaFindings.ts";

/** Options the Compare host supplies from its artifact (Batch 1). */
export interface JudgeForeignOptions {
  /**
   * The Compare pipeline's compile result for this keyboard (the
   * §§7.6/7.21 severity mapping). Omitted when no compile ran — the
   * compile rows then resolve Not yet checkable, never Met.
   */
  compileResult?: CompileResult | null;
  /**
   * Repository placement from the catalog keyboard's repo path
   * (§13.1). Defaults to "release" when the path is unknown.
   */
  placement?: CriteriaPlacement;
}

/**
 * The repository placement a catalog keyboard's repo path states:
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
 * Judge one foreign keyboard VFS: doc + engine findings, merged, run
 * through the pure resolver in foreign mode. A failed engine run does
 * not discard the judgment: the doc findings still stand, and the
 * contextMissing map keeps the checks that could not run resolving
 * Not yet checkable rather than Met.
 *
 * Batch 1: the assembly runs with the foreign flags — scratchScan on
 * (1.13's CHECK-NOW arm; authored mode precertifies instead and never
 * scans) and deprecationInPlay on (mirroring the facts below, §§15–16
 * applicable by default). No precertified set is ever passed here.
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
  });
  const docFindings = runDocChecks(
    collectDocLintInputFromVfs(vfs, keyboardId, displayName),
  );
  let engineFindings: Awaited<
    ReturnType<KeyboardLintEngine["lintWithContext"]>
  > = [];
  try {
    engineFindings = await new KeyboardLintEngine().lintWithContext(
      vfs,
      keyboardId,
      ctx,
    );
  } catch {
    engineFindings = [];
  }
  const facts = {
    ...deriveCriteriaFacts(vfs),
    deprecated: true,
    partnerPackage: true,
  };
  return resolveCriteria({
    criteria: ALL_CRITERIA,
    mode: "foreign",
    lintFindings: mergeLintFindings(docFindings, engineFindings),
    record: EMPTY_CRITERIA_RECORD,
    facts,
    contextMissing,
    compileResult: options.compileResult ?? null,
    // §9.2 supporting evidence only (never decides the row).
    licenseTextHints: licenseTextHints(readVfsText(vfs, "LICENSE.md")),
  });
}

export interface CompareCriteria {
  /** The foreign-mode judgment, or null until the run for this VFS settles. */
  result: CriteriaResult | null;
  /** True once the stage is ready AND the run for its exact VFS has settled. */
  ready: boolean;
}

interface CompareRun {
  /** The exact VFS object this run judged — identity, not path list. */
  forVfs: VirtualFS;
  result: CriteriaResult;
}

export function useCompareCriteria(artifact: CompareArtifact): CompareCriteria {
  const stage = artifact.stage;
  const readyStage = stage.kind === "ready" ? stage : null;
  const vfs = readyStage?.vfs ?? null;
  const keyboardId = readyStage?.keyboardId ?? null;
  const compileResult = readyStage?.compileResult ?? null;
  const placement = placementFromRepoPath(artifact.startKeyboard?.path);
  const displayName = artifact.startKeyboard?.displayName ?? keyboardId ?? "";

  const [run, setRun] = useState<CompareRun | null>(null);

  useEffect(() => {
    if (vfs === null || keyboardId === null) return;
    let cancelled = false;
    void judgeForeignKeyboard(vfs, keyboardId, displayName, {
      compileResult,
      placement,
    }).then((result) => {
      if (!cancelled) setRun({ forVfs: vfs, result });
    });
    return () => {
      cancelled = true;
    };
  }, [vfs, keyboardId, displayName, compileResult, placement]);

  const runIsCurrent = run !== null && vfs !== null && run.forVfs === vfs;

  return { result: runIsCurrent ? run.result : null, ready: runIsCurrent };
}

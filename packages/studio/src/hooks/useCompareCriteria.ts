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
import type { VirtualFS } from "@keyboard-studio/contracts";
import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import type { CompareArtifact } from "./useCompareArtifact.ts";
import {
  judgeForeignKeyboard,
  placementFromRepoPath,
} from "../criteria/judgeForeign.ts";

// The foreign assembly lives in criteria/judgeForeign.ts (React-free, so the
// /review Health Check can run it in a Web Worker). Re-exported here so the
// Compare tab, its verification tests, and any other importer keep working
// unchanged.
export { judgeForeignKeyboard, placementFromRepoPath } from "../criteria/judgeForeign.ts";
export type { JudgeForeignOptions } from "../criteria/judgeForeign.ts";

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

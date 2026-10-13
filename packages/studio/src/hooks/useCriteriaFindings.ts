// useCriteriaFindings — the authored-mode findings for the criteria page
// (spec 084, plan §4, task T2.2).
//
// Two finding sources, merged and deduped by (code, message):
//   (a) Documentation findings from the existing useDocumentationFindings()
//       path — the 13 doc codes, with their rendered-docs projection and
//       upstream-origin reclassification intact. The engine is NEVER given
//       a docLintInput here (see assembleLintContext), so these codes
//       cannot arrive twice; the merge dedupe below is belt-and-braces
//       and is pinned by test.
//   (b) Engine findings from KeyboardLintEngine.lintWithContext() over
//       the OUTPUT artifact's VFS — what would ship, not the base's
//       startVfs — with the context from assembleLintContext().
//
// WHY THE ARTIFACT STAGE IS A PARAMETER, NOT usePreviewArtifact() CALLED
// HERE: usePreviewArtifact() is a full pipeline instance, not a reader.
// Each call mounts its own useKeyboardArtifact run (fetch/compile, blob
// URLs, download state) and carries an onInstantiate callback that can
// instantiate / rebase the working copy. OutputScreen deliberately owns
// exactly one instance; a second instance mounted from StudioShell for
// the Criteria route would double-instantiate that pipeline (a second
// compile run and a second onInstantiate surface to guard). So the host
// — which already owns the pipeline — passes `artifact.stage` in, and
// this hook only READS the stage it is handed. Exactly one artifact
// pipeline instance exists per screen, as before.
//
// INVENTORY: no production builder turns the author's alphabet decisions
// into a structured LinguistInventory. The studio's confirmed inventory
// is a flat character list (workingCopyStore session.confirmedInventory);
// the LinguistInventory shape additionally requires a language, a script
// and a cased core alphabet, none of which can be derived from that list
// without inventing facts. (The engine's CharacterDiscoveryService can
// synthesise one, but it is an async discovery flow the author confirms
// in Phase B — it is not a pure projection of the current decisions, and
// no studio code calls it for this purpose.) This hook therefore passes
// NO inventory: assembleLintContext names the missing inventory in
// contextMissing and §18.6 resolves Not yet checkable — visible
// degradation, never a fake inventory and never a silent pass.

import { useEffect, useMemo, useState } from "react";
import type {
  CompileResult,
  LintFinding,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { KeyboardLintEngine } from "@keymanapp/keyboard-lint";

import { assembleLintContext } from "../criteria/assembleLintContext.ts";
import type { Stage } from "./useKeyboardArtifact.ts";
import { useDocumentationFindings } from "./useDocumentationFindings.ts";

/**
 * Merge finding lists, deduping identical findings (same code AND same
 * message). First occurrence wins, so callers pass the doc findings
 * first: their `origin: "upstream"` reclassification is preserved if the
 * engine ever reports the same problem.
 */
export function mergeLintFindings(
  ...groups: readonly (readonly LintFinding[])[]
): LintFinding[] {
  const seen = new Set<string>();
  const merged: LintFinding[] = [];
  for (const group of groups) {
    for (const finding of group) {
      const key = `${finding.code}\0${finding.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(finding);
    }
  }
  return merged;
}

export interface CriteriaFindings {
  /** Doc + engine findings, merged and deduped by (code, message). */
  lintFindings: LintFinding[];
  /** Consumable directly as CriteriaInput.contextMissing. */
  contextMissing: Record<string, string>;
  /** True once the stage is ready AND the engine run for it has settled. */
  ready: boolean;
  /** The judged artifact's keyboard id (null until the stage is ready). */
  keyboardId: string | null;
  /** The judged artifact's VFS (null until the stage is ready). */
  vfs: VirtualFS | null;
  /**
   * The stage's compile result (Batch 1: the §§7.6/7.21 severity
   * mapping reads it via CriteriaInput.compileResult). Null until the
   * stage is ready — the resolver never sees a compile result for an
   * artifact whose compile has not completed.
   */
  compileResult: CompileResult | null;
}

interface EngineRun {
  /** The exact VFS object this run judged — identity, not path list, so a
   * recompiled artifact with the same file names never inherits a stale run. */
  forVfs: VirtualFS;
  findings: LintFinding[];
  contextMissing: Record<string, string>;
}

export function useCriteriaFindings(stage: Stage): CriteriaFindings {
  const docFindings = useDocumentationFindings();

  const readyStage = stage.kind === "ready" ? stage : null;
  const vfs = readyStage?.vfs ?? null;
  const keyboardId = readyStage?.keyboardId ?? null;

  const [engineRun, setEngineRun] = useState<EngineRun | null>(null);

  useEffect(() => {
    if (vfs === null || keyboardId === null) return;
    let cancelled = false;
    const { ctx, contextMissing } = assembleLintContext({ vfs, keyboardId });
    void new KeyboardLintEngine()
      .lintWithContext(vfs, keyboardId, ctx)
      .then((findings) => {
        if (!cancelled) setEngineRun({ forVfs: vfs, findings, contextMissing });
      })
      .catch(() => {
        // A failed engine run must not wedge the page: report no engine
        // findings for this artifact, but keep the contextMissing map so
        // checks that could not run still resolve Not yet checkable.
        if (!cancelled)
          setEngineRun({ forVfs: vfs, findings: [], contextMissing });
      });
    return () => {
      cancelled = true;
    };
  }, [vfs, keyboardId]);

  const runIsCurrent = engineRun !== null && engineRun.forVfs === vfs;

  const lintFindings = useMemo(
    () =>
      mergeLintFindings(docFindings, runIsCurrent ? engineRun.findings : []),
    [docFindings, engineRun, runIsCurrent],
  );

  return {
    lintFindings,
    contextMissing: runIsCurrent ? engineRun.contextMissing : {},
    ready: readyStage !== null && runIsCurrent,
    keyboardId,
    vfs,
    compileResult: readyStage?.compileResult ?? null,
  };
}

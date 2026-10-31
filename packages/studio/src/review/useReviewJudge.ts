// useReviewJudge — run the criteria battery over a snapshot VFS in a
// dedicated Web Worker.
//
// This is the /review equivalent of the Compare tab's "Check criteria"
// button: the SAME foreign-mode assembly (judgeForeignKeyboard — doc checks
// + KeyboardLintEngine + pure resolver, EMPTY record, no precertification,
// scratchScan on), over a pristine snapshot VFS that no pipeline step may
// mutate. A finding therefore always means "this is in the published
// keyboard", never tooling residue.
//
// The worker boundary is the security posture (review-design.md §9): the
// battery judges untrusted PR snapshots, so it must not run on the page's
// main thread. A hostile keyboard can at worst kill the worker — the host
// terminates it on a hard timeout and reports "timeout" as a first-class
// report state, never a hung page.

import { useEffect, useRef, useState } from "react";
import type {
  ReviewContext,
  VirtualFS,
} from "@keyboard-studio/contracts";
import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import { placementFromRepoPath } from "../criteria/judgeForeign.ts";
import {
  rehydrateResult,
  type JudgeWorkerInput,
  type JudgeWorkerOutput,
} from "./judgeWorkerProtocol.ts";
import type { ReviewSnapshot } from "./useReviewSnapshot.ts";
import {
  fetchBaseKmnVersion,
  fetchIdConflictAtBase,
  fetchPrContext,
} from "./useReviewIndex.ts";
import type { ReviewTarget } from "./reviewSources.ts";

/** Hard timeout for one battery run: the worker is terminated. */
export const JUDGE_TIMEOUT_MS = 60_000;

export type JudgeState =
  | { kind: "idle" }
  | { kind: "judging" }
  | { kind: "ready"; result: CriteriaResult }
  | { kind: "error"; message: string }
  | { kind: "timeout" };

/**
 * Build the /review-only ReviewContext: repo path, tree/PR file list,
 * PR body, and HISTORY.md text. For PR targets the PR context (files +
 * body) is fetched; for published targets the snapshot's tree is used.
 */
async function buildReviewContext(
  target: ReviewTarget,
  snapshot: ReviewSnapshot,
): Promise<ReviewContext> {
  const historyEntry = snapshot.vfs.get("HISTORY.md");
  const historyMd =
    typeof historyEntry?.content === "string"
      ? historyEntry.content
      : undefined;
  if (target.prNumber !== undefined) {
    const pr = await fetchPrContext(target.owner, target.repo, target.prNumber);
    // 1.5: does the keyboard ID already exist at the base commit?
    // 2.6: what version did the base .kmn declare?
    // A failed lookup leaves the field absent — the assembly names the
    // missing input (contextMissing), never a pass or fail.
    const [idConflict, baseKmn] = await Promise.all([
      fetchIdConflictAtBase(
        target.owner,
        target.repo,
        target.prNumber,
        target.path,
      ),
      fetchBaseKmnVersion(
        target.owner,
        target.repo,
        target.prNumber,
        `${target.path}/source/${target.keyboardId}.kmn`,
      ),
    ]);
    return {
      repoPath: target.path,
      treePaths: pr.filePaths,
      prBody: pr.body,
      isPr: true,
      ...(historyMd !== undefined ? { historyMd } : {}),
      ...(idConflict !== null ? { idConflictAtBase: idConflict } : {}),
      ...(baseKmn !== null ? { baseKmnVersion: baseKmn } : {}),
    };
  }
  return {
    repoPath: target.path,
    treePaths: snapshot.treePaths,
    isPr: false,
    ...(historyMd !== undefined ? { historyMd } : {}),
  };
}

export function useReviewJudge(
  target: ReviewTarget | null,
  snapshot: ReviewSnapshot | null,
  /** Bump to re-fire the battery (Re-run). */
  runToken = 0,
): JudgeState {
  const [state, setState] = useState<JudgeState>({ kind: "idle" });
  const runId = useRef(0);

  useEffect(() => {
    if (!target || !snapshot) {
      setState({ kind: "idle" });
      return;
    }
    const id = ++runId.current;
    setState({ kind: "judging" });

    let worker: Worker | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (timer) clearTimeout(timer);
      worker?.terminate();
      worker = null;
    };

    const vfs: VirtualFS = snapshot.vfs;

    // The PR context fetch is async; start the worker after it lands so
    // the battery sees the complete reviewContext in one pass.
    buildReviewContext(target, snapshot).then(
      (reviewContext) => {
        if (runId.current !== id) return;
        try {
          worker = new Worker(
            new URL("./reviewJudge.worker.ts", import.meta.url),
            { type: "module" },
          );
        } catch (e) {
          setState({
            kind: "error",
            message: `could not start the battery worker: ${e instanceof Error ? e.message : String(e)}`,
          });
          return;
        }

        worker.onmessage = (event: MessageEvent<JudgeWorkerOutput>) => {
          if (runId.current !== id) return;
          const output = event.data;
          done();
          if (output.ok) {
            setState({ kind: "ready", result: rehydrateResult(output.result) });
          } else {
            setState({ kind: "error", message: output.error });
          }
        };
        worker.onerror = (event: ErrorEvent) => {
          if (runId.current !== id) return;
          done();
          setState({
            kind: "error",
            message: `battery worker failed: ${event.message || "unknown error"}`,
          });
        };

        timer = setTimeout(() => {
          if (runId.current !== id) return;
          done(); // hard kill: a hostile keyboard must not hang the page
          setState({ kind: "timeout" });
        }, JUDGE_TIMEOUT_MS);

        const input: JudgeWorkerInput = {
          files: vfs.entries(),
          keyboardId: target.keyboardId,
          displayName: target.displayName,
          options: {
            placement: placementFromRepoPath(target.path),
            // No compileResult: /review does not compile in phase 1. The
            // §§7.6/7.21 rows resolve not-yet-checkable with that reason.
            compileResult: null,
            reviewContext,
          },
        };
        worker.postMessage(input);
      },
      (e) => {
        if (runId.current !== id) return;
        done();
        setState({
          kind: "error",
          message: `could not load the PR context: ${e instanceof Error ? e.message : String(e)}`,
        });
      },
    );

    return () => {
      runId.current += 1; // abandon: a late result must not land
      done();
    };
    // Intentional scalar deps (not `target`/`snapshot` objects): the parent
    // may rebuild them per render; refiring on identity would re-judge
    // needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    target?.source,
    target?.owner,
    target?.repo,
    target?.path,
    target?.sha,
    target?.keyboardId,
    target?.prNumber,
    snapshot,
    runToken,
  ]);

  return state;
}

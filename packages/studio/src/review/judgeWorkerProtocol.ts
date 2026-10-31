// judgeWorkerProtocol — the /review battery's Web Worker contract.
//
// The battery judges untrusted PR snapshots. It runs in a dedicated worker
// so a hostile keyboard can at worst kill the worker (hard timeout via
// terminate()), never hang the page's main thread.
//
// The worker boundary can't carry functions: CriteriaResult rows hold lazy
// `evidence()` closures, so the worker materializes each row's evidence and
// posts plain data. The main thread re-wraps it into the CriteriaResult
// shape (evidence: () => materialized) that CriteriaPage expects.
//
// This module is React-free and worker-safe; runJudgeJob is also the unit
// under test (the .worker.ts file itself is a thin message adapter).

import {
  createVirtualFS,
  type Criterion,
  type VirtualFSEntry,
} from "@keyboard-studio/contracts";
import type {
  CriteriaResult,
  CriterionStatus,
  EvidenceModel,
  ResolvedRow,
} from "../criteria/criteriaTypes.ts";
import {
  judgeForeignKeyboard,
  type JudgeForeignOptions,
} from "../criteria/judgeForeign.ts";

export interface JudgeWorkerInput {
  /** Snapshot files; binary content rides as Uint8Array (structured-cloned). */
  files: VirtualFSEntry[];
  keyboardId: string;
  displayName: string;
  options: JudgeForeignOptions;
}

/** One row with its evidence materialized (no closures). */
export interface SerializedRow {
  criterion: Criterion;
  status: CriterionStatus;
  controls: ResolvedRow["controls"];
  contrastiveAttested?: boolean;
  fontLicense?: ResolvedRow["fontLicense"];
  evidence: EvidenceModel;
}

export interface SerializedCriteriaResult {
  rows: SerializedRow[];
  counts: CriteriaResult["counts"];
  bandCounts: CriteriaResult["bandCounts"];
  total: number;
  resolvedCount: number;
}

export type JudgeWorkerOutput =
  | { ok: true; result: SerializedCriteriaResult }
  | { ok: false; error: string };

/** The worker's whole job: VFS in, serializable verdicts out. */
export async function runJudgeJob(
  input: JudgeWorkerInput,
): Promise<JudgeWorkerOutput> {
  try {
    const vfs = createVirtualFS(
      input.files.map((f) => ({
        path: f.path,
        content: f.content,
        isBinary: f.isBinary,
      })),
    );
    const result = await judgeForeignKeyboard(
      vfs,
      input.keyboardId,
      input.displayName,
      input.options,
    );
    return {
      ok: true,
      result: {
        rows: result.rows.map((r) => ({
          criterion: r.criterion,
          status: r.status,
          controls: r.controls,
          ...(r.contrastiveAttested !== undefined
            ? { contrastiveAttested: r.contrastiveAttested }
            : {}),
          ...(r.fontLicense !== undefined ? { fontLicense: r.fontLicense } : {}),
          evidence: r.evidence(),
        })),
        counts: result.counts,
        bandCounts: result.bandCounts,
        total: result.total,
        resolvedCount: result.resolvedCount,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Re-wrap a serialized result into the CriteriaResult shape the views take. */
export function rehydrateResult(s: SerializedCriteriaResult): CriteriaResult {
  return {
    rows: s.rows.map(
      (r): ResolvedRow => ({
        criterion: r.criterion,
        status: r.status,
        controls: r.controls,
        ...(r.contrastiveAttested !== undefined
          ? { contrastiveAttested: r.contrastiveAttested }
          : {}),
        ...(r.fontLicense !== undefined ? { fontLicense: r.fontLicense } : {}),
        evidence: () => r.evidence,
      }),
    ),
    counts: s.counts,
    bandCounts: s.bandCounts,
    total: s.total,
    resolvedCount: s.resolvedCount,
  };
}

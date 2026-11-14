// applyPatchToWorkingCopy -- the ONE checked patch sink (089 contract A4) behind
// both the reducer's `applyWorkingCopyPatch` (studioReducerDeps) and the gallery
// host's (galleryHostDeps), so the Open routing cannot diverge between them.
//
// The `ir` channel's containment-checked merge runs FIRST: a containment
// failure throws before any overlay setter runs, so a patch is never partially
// applied. Channels then land as whole-value replaces in the contract's order
// (identity, attribution, helpDocs, historyEntryState, docFixProposals). A null
// working IR skips only the `ir` channel.
//
// Copy: the merged IR goes into the working IR (`setWorkingIR`).
// Open (live files, spec 111 FR-041): the merged IR is written into the files
// now through the apply seam. A precise change is written before this returns,
// so the step that ran it completes with its change in the files. A change that
// needs the author's agreement (or fails) is NOT written here: it is handed to
// `OpenApplyHost` (lib/openApplyNotifier.ts), which shows the consent dialog and
// then writes, or shows the "could not be applied" notice. Meanwhile the step
// still completes and its decision is still recorded (decisions are a record on
// Open), but the files are unchanged until the author agrees; the notice says
// so. With no host mounted the change is reported through `devLog.warn`.

import type { IRPath } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { PatchOrigin, WorkingCopyPatch } from "../survey/types.ts";
import type { OpenChange } from "./openApply/types.ts";
import { scopeToWrites } from "./openApply/scopeToWrites.ts";
import { captureDecisionRollback } from "./decisionJournal.ts";
import { applyMutatePatch } from "../steps/mutateApply.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isLiveOpen } from "./openMode.ts";
import { applyThroughOpenSeam, handOverToOpenApplyHost } from "./openApplyNotifier.ts";

/**
 * The `.kmn` header is not part of the rule splice, so a header write in an
 * `ir` patch changes no file text by itself (the apply reports "unchanged").
 * On Open the display name is an allowed edit (spec 111 Edge Cases) and reaches
 * the files at OUTPUT through the identity overlay (step 3 writes `&NAME`, step
 * 3.6 the descriptor), so a `header.name` write is carried into the identity
 * overlay here; preview and download then read one value. The other header
 * fields (`copyright`, `bcp47`, `keyboardId`) are written only by Phase A
 * identity questions, which are not part of Open (FR-005) and must not edit the
 * keyboard's own notices or id (FR-010); they are reported, never dropped.
 */
function carryHeaderEdits(
  wc: ReturnType<typeof useWorkingCopyStore.getState>,
  nextIr: NonNullable<typeof wc.ir>,
  patch: WorkingCopyPatch,
): void {
  const before = (wc.startIr ?? wc.ir)!.header;
  const after = nextIr.header;
  if (after.name !== before.name && patch.identity === undefined) {
    wc.setIdentity({ ...(wc.identity ?? {}), displayName: after.name });
  }
  for (const field of ["copyright", "bcp47", "keyboardId"] as const) {
    if (JSON.stringify(after[field]) !== JSON.stringify(before[field])) {
      devLog.warn(`[open-apply] header.${field} is not edited on a keyboard opened for update; the write was not applied`);
    }
  }
}

/**
 * Defence in depth: on Open the working IR is the parse of the file. When it
 * differs from the file's parse, some writer edited `wc.ir` without going
 * through this sink (a held deadkey or key-edit overlay write is one: it is
 * reported, never suppressed); say so in development. A change on Open is built
 * from the file's parse, so such a difference never reaches the file.
 */
function reportStrayWorkingIr(wc: ReturnType<typeof useWorkingCopyStore.getState>): void {
  if (wc.ir === null || wc.startIr === null || wc.ir === wc.startIr) return;
  const view = (ir: NonNullable<typeof wc.ir>): string => JSON.stringify([ir.groups, ir.stores, ir.raw]);
  if (view(wc.ir) !== view(wc.startIr)) {
    devLog.error("[open-apply] the working IR and the file's parse disagree before an apply; a writer bypassed the apply seam");
  }
}

/**
 * The IR a step's `apply` is composed against: on Open the file's own parse
 * (`startIr`), so a stray `wc.ir` write can never ride into a change; on Copy
 * the working IR.
 */
export function irForApply(): ReturnType<typeof useWorkingCopyStore.getState>["ir"] {
  const wc = useWorkingCopyStore.getState();
  return isLiveOpen(wc) ? (wc.startIr ?? wc.ir) : wc.ir;
}

export function applyPatchToWorkingCopy(
  patch: WorkingCopyPatch,
  writes: readonly IRPath[],
  origin?: PatchOrigin,
): void {
  const wc = useWorkingCopyStore.getState();
  if (patch.ir !== undefined && wc.ir !== null) {
    if (isLiveOpen(wc) && wc.startIr !== null) {
      // Open: the patch is applied to the FILE's parse, not to `wc.ir`.
      const base = wc.startIr;
      const nextIr = applyMutatePatch(base, patch.ir, writes);
      reportStrayWorkingIr(wc);
      carryHeaderEdits(wc, nextIr, patch);
      const label = "Apply a step's change";
      // The patch replaces whole arrays (groups, stores), so it can only be applied
      // later if what it writes in the file has not changed meanwhile; otherwise it
      // would revert the change made in between, and it is treated as no longer applying.
      const written = (ir: NonNullable<typeof wc.ir>): string => JSON.stringify(scopeToWrites({} as typeof ir, ir, writes));
      const basis = written(base);
      const build = (): OpenChange | null => {
        const now = useWorkingCopyStore.getState();
        if (now.startIr === null || !isLiveOpen(now) || written(now.startIr) !== basis) return null;
        try {
          return { kind: "model", nextIr: applyMutatePatch(now.startIr, patch.ir!, writes), writes, label };
        } catch {
          return null;
        }
      };
      const result = applyThroughOpenSeam({ kind: "model", nextIr, writes, label });
      if (result.status === "needs-consent" || result.status === "failed") {
        // The decision(s) behind this change go back to what they were if it is
        // not applied, so the record matches the files.
        const rollback = captureDecisionRollback(origin?.decisionIds ?? []);
        const onNotApplied = rollback ?? (() => {});
        if (!handOverToOpenApplyHost({ build, onNotApplied })) {
          devLog.warn(
            "[open-apply] a step's change was not written to the files: " +
              (result.status === "failed" ? result.reason : result.files.join(", ") + " needs the author's agreement"),
          );
          onNotApplied();
        }
      }
    } else {
      wc.setWorkingIR(applyMutatePatch(wc.ir, patch.ir, writes));
    }
  }
  if (patch.identity !== undefined) wc.setIdentity(patch.identity);
  if (patch.attribution !== undefined) wc.setAttribution(patch.attribution);
  if (patch.helpDocs !== undefined) wc.setHelpDocs(patch.helpDocs);
  if (patch.historyEntryState !== undefined) wc.setHistoryEntryState(patch.historyEntryState);
  if (patch.docFixProposals !== undefined) wc.setDocFixProposals(patch.docFixProposals);
}

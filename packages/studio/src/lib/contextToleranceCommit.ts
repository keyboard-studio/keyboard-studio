// contextToleranceCommit — committing a context-tolerance decision to the
// working copy (spec 078 FR-005a second half, FR-008). hooks/useContextToleranceApply.ts
// runs it when its inputs change; the headless scripted author (spec 107) calls
// the same functions. The working IR is written through `applyMutatePatch`
// against the manifest-declared CONTEXT_TOLERANCE_WRITES (the seam's
// containment check rejects anything else), and the persisted overlay the VFS
// projection replays into the preview and the download is written beside it.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import {
  applyContextToleranceOverlay,
  applyFacetTransform,
  isNormalizationStepBatch,
  projectKmnText,
  removeContextToleranceOverlay,
  type ContextToleranceOverlay,
} from "@keyboard-studio/engine";

import { useWorkingCopyStore, type ContextToleranceState } from "../stores/workingCopyStore.ts";
import {
  getMarksTreatmentValue,
  recordMarksTreatmentValue,
  type MarksTreatmentValue,
} from "../survey/marks/marksValue.ts";
import { isLiveOpen } from "./openMode.ts";
import { applyMutatePatch } from "../steps/mutateApply.ts";
import { applyPatchToWorkingCopy } from "./applyPatchToWorkingCopy.ts";
import { applyThroughOpenSeam, handOverToOpenApplyHost } from "./openApplyNotifier.ts";
import type { OpenChange } from "./openApply/types.ts";
import { scopeToWrites } from "./openApply/scopeToWrites.ts";
import { readVfsText } from "./vfsText.ts";
import { CONTEXT_TOLERANCE_WRITES } from "../steps/contextToleranceWrites.ts";
import { applyContextToleranceDecision, contextTolerancePatch } from "./contextToleranceApply.ts";
import { loadContextToleranceEngine } from "./contextToleranceEngine.ts";
import type { ContextToleranceApplyNotes } from "../lint/ContextToleranceNotice.tsx";

const OVERLAY_OPS = { applyContextToleranceOverlay, removeContextToleranceOverlay };

/** Why a step's `begin` line could not be repointed (kept for the notice and the log). */
const NO_BEGIN = "the normalization step could not be placed in the file";

/**
 * The text with the Unicode `begin` directive that enters `from` pointed at
 * `to`, or undefined when that cannot be done without guessing: no such
 * directive, or more than one. Only a directive on a line of its own counts
 * (comment lines, `c ...`, are skipped). A `begin ANSI` line is never touched:
 * the step is generated for the Unicode entry group, so an ANSI entry keeps
 * pointing where it did; when two Unicode directives name `from` the fix is
 * refused rather than guessing which one it is for.
 */
export function repointBegin(text: string, from: string, to: string): string | undefined {
  const lines = text.split(/(?<=\n)/);
  const directive = new RegExp(
    `^([ \\t]*begin[ \\t]+Unicode[ \\t]*>[ \\t]*use\\([ \\t]*)${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([ \\t]*\\))`,
    "i",
  );
  const at = lines.flatMap((l, n) => (directive.test(l) ? [n] : []));
  if (at.length !== 1) return undefined;
  lines[at[0]!] = lines[at[0]!]!.replace(directive, (_m, head: string, tail: string) => head + to + tail);
  return lines.join("");
}

/** Plain label of the undo step a context-tolerance fix records on Open. */
export const CONTEXT_TOLERANCE_FIX_LABEL = "Apply a context-tolerance fix";

/**
 * The `files` change that writes a fix with a normalization step, built from the
 * files as they stand now (null when it cannot be placed). The step adds a group
 * AND moves the entry point, and the rule splice does not place a header change:
 * the generated parts are spliced as usual and the `begin` line is then pointed
 * at the step's group in the text. One change, so one undo record.
 */
function buildStepChange(overlay: ContextToleranceOverlay): OpenChange | null {
  const { startVfs, startKeyboard, startIr } = useWorkingCopyStore.getState();
  if (startVfs === null || startKeyboard === null || startIr === null) return null;
  const path = `source/${startKeyboard.id}.kmn`;
  const current = readVfsText(startVfs, path);
  const batch = overlay.batches.find(isNormalizationStepBatch);
  if (current === undefined || batch === undefined || startIr.header.entryPoints?.main !== batch.originalEntry) return null;
  const target = applyContextToleranceOverlay(startIr, overlay).ir;
  const spliced = projectKmnText(current, startIr, scopeToWrites(startIr, target, CONTEXT_TOLERANCE_WRITES));
  if (!spliced.ok) return null;
  const text = repointBegin(spliced.text, batch.originalEntry, batch.groupName);
  if (text === undefined) return null;
  return { kind: "files", files: { [path]: text }, label: CONTEXT_TOLERANCE_FIX_LABEL, labelKey: "context-tolerance" };
}

/**
 * A fix that is not written now goes to the apply host exactly as the patch
 * sink hands one over (consent dialog, or the "could not be applied" notice);
 * the host builds the change again from the files as they stand then. With no
 * host mounted it is reported, never dropped silently.
 */
function handOver(build: () => OpenChange | null, onApplied: (() => void) | undefined): void {
  const handed = handOverToOpenApplyHost({
    build,
    onNotApplied: () => {},
    ...(onApplied !== undefined ? { onApplied } : {}),
  });
  if (!handed) devLog.warn(`[context-tolerance] the fix was not written to the files (${NO_BEGIN} or needs the author's agreement)`);
}

function writeStepOnOpen(overlay: ContextToleranceOverlay, onApplied: (() => void) | undefined): boolean {
  const change = buildStepChange(overlay);
  if (change === null) {
    handOver(() => null, undefined);
    return false;
  }
  const result = applyThroughOpenSeam(change);
  if (result.status === "applied" || result.status === "unchanged") return true;
  handOver(() => buildStepChange(overlay), onApplied);
  return false;
}

/**
 * Open (spec 111 FR-041): write the fix into the files now, through the apply
 * seam, with an undo record. Nothing is held: no overlay is stored, so no later
 * step or output replays it. A fix that needs the author's agreement or fails is
 * handed to the apply host. Taking a fix back (`next` null) leaves the files
 * alone: it is undone with the undo log. True when the fix is in the files;
 * `onApplied` runs if it is written later, after the author agreed.
 */
function commitOverlayOnOpen(
  next: { fingerprint: string; acceptedSiteIds: string[]; overlay: ContextToleranceOverlay } | null,
  onApplied: (() => void) | undefined,
): boolean {
  if (next === null) return true;
  const startIr = useWorkingCopyStore.getState().startIr;
  if (startIr === null) return false;
  if (next.overlay.batches.some(isNormalizationStepBatch)) return writeStepOnOpen(next.overlay, onApplied);
  const result = applyPatchToWorkingCopy(
    { ir: contextTolerancePatch(startIr, null, next.overlay, OVERLAY_OPS) },
    CONTEXT_TOLERANCE_WRITES,
    // No decision ids: the marks decision was recorded earlier and stays recorded
    // whatever happens here; this fix's own outcome is stamped on it
    // (`appliedFingerprint`) only when it is written, so a decline rolls back nothing.
    { decisionIds: [], ...(onApplied !== undefined ? { onApplied } : {}) },
  );
  return result === undefined || result.status === "applied" || result.status === "unchanged";
}

/**
 * Commit `next` (or its removal, with `null`) to the working IR and the overlay
 * slice; on Open, write it into the files instead and hold nothing. Returns
 * whether the fix is in place (false only on Open, when it was not written).
 */
export function commitOverlay(
  next: { fingerprint: string; acceptedSiteIds: string[]; overlay: ContextToleranceOverlay } | null,
  onAppliedLater?: () => void,
): boolean {
  const store = useWorkingCopyStore.getState();
  if (isLiveOpen(store)) return commitOverlayOnOpen(next, onAppliedLater);
  const previous = store.contextToleranceOverlay?.overlay ?? null;
  if (store.ir !== null) {
    const patch = contextTolerancePatch(store.ir, previous, next?.overlay ?? null, OVERLAY_OPS);
    store.setWorkingIR(applyMutatePatch(store.ir, patch, CONTEXT_TOLERANCE_WRITES));
  }
  store.setContextToleranceOverlay(next);
  return true;
}

/**
 * Record `appliedFingerprint` on the decision that carries it (spec 090
 * T023: the marks-treatment decision value — before T023 this mutated the
 * phase result). The re-record goes through the decide core with the
 * marks stub, whose apply is a no-op: stamping the fingerprint must not
 * re-run the mark guards.
 */
function markApplied(fingerprint: string): void {
  const value = getMarksTreatmentValue();
  if (value?.contextTolerance == null) return;
  if (value.contextTolerance.appliedFingerprint === fingerprint) return;
  recordMarksTreatmentValue({
    ...value,
    contextTolerance: { ...value.contextTolerance, appliedFingerprint: fingerprint },
  });
}

/**
 * Apply a recorded accept/partial decision against a ready analysis: verify the
 * fix, commit it to the working IR and the overlay slice, and stamp the
 * decision applied. Resolves the notes the author is shown (null when there is
 * nothing to say). The effect below runs it when its inputs change; the
 * headless scripted author (spec 107) calls it directly. Throws on an engine
 * error.
 */
export async function applyToleranceDecision(
  decision: NonNullable<MarksTreatmentValue["contextTolerance"]>,
  analysis: Extract<ContextToleranceState, { status: "ready" }>,
  isLive: () => boolean = () => true,
): Promise<ContextToleranceApplyNotes | null> {
  const engine = await loadContextToleranceEngine();
  const outcome = await applyContextToleranceDecision(decision, analysis, { engine, applyFacetTransform });
  // The effect that started this was cleaned up while it ran: its inputs moved on.
  if (!isLive()) return null;
  if (outcome.kind === "applied") {
    const inPlace = commitOverlay(
      {
        fingerprint: decision.fingerprint,
        acceptedSiteIds: [...decision.acceptedSiteIds],
        overlay: outcome.overlay,
      },
      // Open: a fix the author is asked about is stamped applied once it is written.
      () => markApplied(decision.fingerprint),
    );
    // Not stamped applied when the files were not written: the hook would not try again.
    if (inPlace) markApplied(decision.fingerprint);
    return outcome.staleSiteIds.length > 0 ? { staleRuleIds: outcome.staleSiteIds } : null;
  }
  if (outcome.kind === "stale") return { staleRuleIds: outcome.staleSiteIds };
  return { staleRuleIds: [], refusal: outcome.reason };
}

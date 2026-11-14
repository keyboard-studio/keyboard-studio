// openApply core -- the projection run, the undo record and the rule
// re-insertion shared by the apply kinds (spec 111 "live files"). Split out of
// `openApply.ts` so the assign kind can live in its own module without a cycle.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  createVirtualFS,
  type KeyboardIR,
  type MechanismAssignment,
  type VirtualFS,
} from "@keyboard-studio/contracts";
import {
  emitRule,
  isKeyboardSource,
  parseKmn,
  spliceKmn,
} from "@keyboard-studio/engine";
import type { KmnEdit } from "@keyboard-studio/engine";

import {
  type OpenRemovalEntry,
  type RemovedRuleRecord,
} from "../../stores/openRemovalStore.ts";
import {
  useOpenUndoStore,
  type OpenUndoLabelKey,
  type OpenUndoRecord,
  type OpenUndoView,
} from "../../stores/openUndoStore.ts";
import type { MarksTreatmentValue } from "../../survey/marks/marksValue.ts";
import { getPatternByIdSync } from "../services.ts";
import {
  openModeProjection,
  projectionInputFromState,
  type ProjectionState,
} from "../projectionInput.ts";
import { projectWorkingCopyVfs } from "../projectWorkingCopyVfs.ts";
import { PROJECTION_STEPS, type ProjectionKind } from "../projectionSteps.ts";
import { findTouchLayoutPath } from "../findTouchLayoutPath.ts";
import { readVfsText } from "../vfsText.ts";
import { resolveCarvedCombos } from "../carvedCombo.ts";
import { deriveRuleAdditions, hasRuleAdditions } from "../../survey/rules/ruleAdditions.ts";

import type { OpenApplyOptions, OpenApplyResult, OpenChange } from "./types.ts";

let removalSeq = 0;
let undoSeq = 0;
/** The next undo-record id (shared by every apply kind). */
export const nextUndoId = (): string => `open-undo-${(undoSeq += 1)}`;

export const textOrNull = (vfs: VirtualFS, path: string): string | null => readVfsText(vfs, path) ?? null;

/** Label of the step that writes overlays held from earlier steps into the file. */
export const EARLIER_CHANGES_LABEL = "Earlier changes written to the file";

/**
 * Build one undo step. `beforeOf` gives a path's text as it was before the
 * step; a path whose text did not change is left out. Call BEFORE the write.
 */
export function recordUndo(
  id: string,
  label: string,
  keyboardId: string,
  beforeOf: (path: string) => string | null,
  changed: Record<string, string | null>,
  view: OpenUndoView,
  labelKey?: OpenUndoLabelKey,
): OpenUndoRecord {
  const files: OpenUndoRecord["files"] = {};
  for (const [path, after] of Object.entries(changed)) {
    const before = beforeOf(path);
    if (before !== after) files[path] = { before, after };
  }
  return { id, keyboardId, label, ...(labelKey !== undefined ? { labelKey } : {}), files, view };
}

/** The text a path had in `vfs`, unless `overrides` (an earlier step's result) says otherwise. */
export const beforeFrom =
  (vfs: VirtualFS, overrides: Record<string, string | null>) =>
  (path: string): string | null =>
    path in overrides ? overrides[path]! : textOrNull(vfs, path);

export const failure = (err: unknown): OpenApplyResult => ({
  status: "failed",
  reason: err instanceof Error ? err.message : String(err),
});

export function sameContent(a: VirtualFS, b: VirtualFS, path: string): boolean {
  const x = a.get(path)?.content;
  const y = b.get(path)?.content;
  if (typeof x === "string" || typeof y === "string") return x === y;
  if (x === undefined || y === undefined) return x === y;
  return x.length === y.length && x.every((byte, i) => byte === y[i]);
}

/** Paths whose content differs between two file sets, `null` for a deleted file. */
export function diffFiles(before: VirtualFS, after: VirtualFS): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const e of after.entries()) {
    if (sameContent(before, after, e.path)) continue;
    // Only text files are projected on Open; a binary change is not expected
    // and is left out rather than written as text.
    if (typeof e.content === "string") out[e.path] = e.content;
  }
  for (const e of before.entries()) {
    if (after.get(e.path) === undefined) out[e.path] = null;
  }
  return out;
}

const ruleTexts = (ir: KeyboardIR, groupIndex: number): string[] | undefined => {
  const g = ir.groups[groupIndex];
  return g === undefined ? undefined : g.rules.map((r) => emitRule(r, g.usingKeys));
};

/** The rules of the starting IR, per group, as the file will hold them. */
export function intendedMatchesText(intended: KeyboardIR, text: string, keyboardId: string): boolean {
  let parsed: KeyboardIR;
  try {
    parsed = parseKmn(text, keyboardId).ir;
  } catch {
    return false;
  }
  if (!isKeyboardSource(parsed)) return false;
  if (parsed.groups.length !== intended.groups.length) return false;
  for (let gi = 0; gi < intended.groups.length; gi++) {
    const want = ruleTexts(intended, gi);
    const got = ruleTexts(parsed, gi);
    if (want === undefined || got === undefined || want.length !== got.length) return false;
    for (let i = 0; i < want.length; i++) if (want[i] !== got[i]) return false;
  }
  return true;
}

/** A rule's own physical lines, verbatim (continuations included), no final EOL. */
function verbatimRuleText(lines: readonly string[], sourceLine: number): string | undefined {
  let i = sourceLine - 1;
  if (lines[i] === undefined) return undefined;
  const out = [lines[i]!];
  while (
    /\\\s*$/.test(lines[i]!) &&
    !/^\s*c(\s|$)/i.test(lines[i]!) &&
    lines[i + 1] !== undefined
  ) {
    i += 1;
    out.push(lines[i]!);
  }
  return out.join("\n");
}

/** What Restore needs to put back the rules `intended` dropped from `startIr`. */
export function recordRemovedRules(
  startIr: KeyboardIR,
  intended: KeyboardIR,
  startKmn: string,
): RemovedRuleRecord[] {
  if (intended.groups.length !== startIr.groups.length) return [];
  const lines = startKmn.split(/\r?\n/);
  const out: RemovedRuleRecord[] = [];
  const recordedLines = new Set<number>();
  startIr.groups.forEach((g, groupIndex) => {
    // Ordinals count over every rule the file will hold, additions included,
    // in file order, so they match how Restore finds the neighbour later.
    const placed = new Map<string, { text: string; ordinal: number }>();
    const seen = new Map<string, number>();
    for (const r of intended.groups[groupIndex]!.rules) {
      const text = emitRule(r, g.usingKeys);
      const ordinal = (seen.get(text) ?? 0) + 1;
      seen.set(text, ordinal);
      placed.set(r.nodeId, { text, ordinal });
    }
    const survivingLines = new Set(
      g.rules.filter((r) => placed.has(r.nodeId)).map((r) => r.sourceLine),
    );
    let prev: { text: string; ordinal: number } | null = null;
    for (const r of g.rules) {
      const here = placed.get(r.nodeId);
      if (here !== undefined) {
        prev = here;
        continue;
      }
      // A line shared with a surviving rule (target-selector expansion) cannot
      // be put back on its own; the whole-file restore still covers it.
      if (r.sourceLine === undefined || survivingLines.has(r.sourceLine)) continue;
      if (recordedLines.has(r.sourceLine)) continue;
      const text = verbatimRuleText(lines, r.sourceLine);
      if (text === undefined) continue;
      recordedLines.add(r.sourceLine);
      out.push({
        groupIndex,
        text,
        prevText: prev?.text ?? null,
        prevOrdinal: prev?.ordinal ?? 0,
      });
    }
  });
  return out;
}

export interface Projection {
  /** Files the projection changed, `null` for a deleted file. */
  changed: Record<string, string | null>;
  carvedKmnIr: Record<string, KeyboardIR>;
  /** The IR each changed `.kmn` was meant to become (the last step that wrote it). */
  intendedKmnIr: Record<string, KeyboardIR>;
  /** The change carried held rules-step additions (touch key identity, until phase 16) with it. */
  carried: boolean;
}

/** What an `assign` or `marks` projection adds to the common run. */
export interface ProjectExtra {
  /** Assignments to project (the only non-empty replay input). */
  assignments?: readonly MechanismAssignment[];
  /** The marks-treatment value: output form for the assignments, guards (step 2.6). */
  marksTreatment?: MarksTreatmentValue;
  /** Files rewritten in the clone before projecting (`null` deletes); the starting text for the run. */
  prepared?: Record<string, string | null>;
  /** The keyboard as `prepared` leaves it (the IR must describe the text the run starts from). */
  startIr?: KeyboardIR;
  /**
   * The apply kind this run is for; picks its row of `PROJECTION_STEPS`.
   * Defaults to the change's own kind (`flush` for a flush).
   */
  runAs?: ProjectionKind;
}

/**
 * Project one change onto a clone of the starting-point files.
 *
 * The one overlay still held on Open and carried INTO the same run, so the
 * re-parse in `replaceStartingPointFiles` does not drop it, is the rules-step
 * additions (derived from `ir` against `startIr`): the touch key-identity commit
 * still writes them through `setWorkingIR` until the touch phase. Carves, the
 * context-tolerance fix and the deadkey ops are written when applied and never
 * held on Open, so there is nothing to carry for them.
 * Overlays the re-parse does NOT clear stay overlays and are left empty here:
 * key-edit ops, disabled families, touch-key deletions, touch keep-inert chars
 * (touch, phase 16). Marks guards are written by their own apply (`marks`) and
 * the output no longer regenerates them; an answered caps decision is the one
 * remaining decision-driven `.kmn` step at output.
 */
export function projectChange(
  change:
    | { kind: "remove"; itemIds: string[]; chars: string[]; disabledRuleIds?: string[] }
    | { kind: "flush" }
    | { kind: "ir"; nextIr: KeyboardIR },
  opts: OpenApplyOptions,
  extra: ProjectExtra = {},
): { ok: true; projection: Projection } | { ok: false; result: OpenApplyResult } {
  const st = useWorkingCopyStore.getState();
  const { startVfs, startKeyboard } = st;
  const startIr = extra.startIr ?? st.startIr;
  if (startVfs === null || startIr === null || startKeyboard === null) {
    return { ok: false, result: { status: "failed", reason: "No keyboard is open." } };
  }
  const keyboardId = startKeyboard.id;
  const consented = opts.consentedReemit === true;
  const runAs: ProjectionKind = extra.runAs ?? change.kind;

  const clone = createVirtualFS(startVfs.entries());
  for (const [path, text] of Object.entries(extra.prepared ?? {})) {
    if (text === null) clone.delete(path);
    else clone.set(path, text, false);
  }
  const touchPath = findTouchLayoutPath(clone);
  const touchJson = touchPath === undefined ? null : (readVfsText(clone, touchPath) ?? null);

  const removing = change.kind === "remove";
  const itemIds = removing ? [...change.itemIds, ...(change.disabledRuleIds ?? [])] : [];
  const workingIr =
    change.kind === "ir" ? change.nextIr : extra.startIr !== undefined ? startIr : (st.ir ?? startIr);
  const carried = hasRuleAdditions(deriveRuleAdditions(workingIr, startIr));
  const state: ProjectionState = {
    ir: workingIr,
    startIr,
    // Nothing carved is held on Open: a removal is written when applied.
    deletedNodeIds: new Set(),
    deletedItemIds: new Set(itemIds),
    carveChars: new Set(removing ? change.chars.map((c) => c.normalize("NFC")) : []),
    deletedTouchKeyIds: new Set(),
    disabledFamilyIds: new Set(),
    // A setting the carve reads (it decides whether a removed key is blocked).
    fallbackPolicy: st.fallbackPolicy,
    carveTouchKeepInert: [],
    deadkeyOverlay: { ops: [] },
    contextToleranceOverlay: null,
    touchLayoutJson: touchJson,
    customCss: null,
    authoredWelcomeHtm: null,
    authoredReadmeHtm: null,
    authoredReadmeMd: null,
    authoredHelpPhp: null,
    instantiationMode: st.instantiationMode,
    startVfs,
    startWelcomeConvention: st.startWelcomeConvention,
  };
  const input = projectionInputFromState(state, {
    vfs: clone,
    keyboardId,
    assignments: extra.assignments ?? [],
    getPattern: extra.assignments !== undefined ? getPatternByIdSync : () => undefined,
    identity: null,
    marksTreatment: extra.marksTreatment,
    capsHandling: undefined,
    openMode: {
      ...openModeProjection({
        kind: runAs,
        identity: null,
        startDisplayName: null,
        ...(consented ? { consentedReemit: true } : {}),
      }),
    },
  });
  const disabled = removing ? (change.disabledRuleIds ?? []) : [];
  const result = projectWorkingCopyVfs(
    disabled.length > 0 ? { ...input, suppressionExemptIds: new Set(disabled) } : input,
  );

  if (result.reformatRequired !== undefined && !consented) {
    return { ok: false, result: { status: "needs-consent", files: result.reformatRequired } };
  }
  const changed = diffFiles(startVfs, clone);

  // The splice must have produced the order the change meant, additions and
  // tolerance rules included. A rule that landed elsewhere changes how the
  // keyboard behaves (rules match first to last), so it counts as "cannot be
  // placed precisely".
  const misplaced: string[] = [];
  for (const [path, intended] of PROJECTION_STEPS[runAs].has("intendedCheck") ? Object.entries(result.intendedKmnIr ?? {}) : []) {
    const text = changed[path];
    if (typeof text === "string" && !intendedMatchesText(intended, text, keyboardId)) {
      misplaced.push(path);
    }
  }
  if (misplaced.length > 0) {
    return {
      ok: false,
      result: consented
        ? { status: "failed", reason: `${misplaced.join(", ")} did not come out as the change intended.` }
        : { status: "needs-consent", files: misplaced },
    };
  }
  return {
    ok: true,
    projection: {
      changed,
      carvedKmnIr: result.carvedKmnIr ?? {},
      intendedKmnIr: result.intendedKmnIr ?? {},
      carried,
    },
  };
}

export function applyRemoveOrIr(
  change: Extract<OpenChange, { kind: "remove" | "ir" }>,
  opts: OpenApplyOptions,
  extra: ProjectExtra = {},
  label = "Apply change",
  view: OpenUndoView = { kind: "files" },
): OpenApplyResult {
  const out = projectChange(change, opts, extra);
  if (!out.ok) return out.result;
  const { changed, carvedKmnIr, carried } = out.projection;
  const changedPaths = Object.keys(changed);
  if (changedPaths.length === 0) return { status: "unchanged" };

  const st = useWorkingCopyStore.getState();
  const startVfs = st.startVfs!;
  const startIr = st.startIr!;
  const keyboardId = st.startKeyboard!.id;
  const kmnPath = `source/${keyboardId}.kmn`;

  // Overlays held from earlier steps are written first as their OWN undo step,
  // so undoing this change returns to the text with them in it (they are the
  // author's earlier work, not part of this change). Both steps land in one
  // store update below. Consent for the held part is asked for by this same
  // call, once: nothing is written until it is given.
  let flushAfter: Record<string, string | null> = {};
  let flushRecord: OpenUndoRecord | undefined;
  if (carried) {
    const flush = projectChange({ kind: "flush" }, opts);
    if (!flush.ok) return flush.result;
    flushAfter = flush.projection.changed;
    if (Object.keys(flushAfter).length > 0) {
      flushRecord = recordUndo(
        nextUndoId(),
        EARLIER_CHANGES_LABEL,
        keyboardId,
        beforeFrom(startVfs, {}),
        flushAfter,
        { kind: "flush" },
        "earlier-changes",
      );
    }
  }
  const baseOf = beforeFrom(startVfs, flushAfter);

  // Record what Restore needs while the old IR and text are still in hand.
  let entry: OpenRemovalEntry | undefined;
  if (change.kind === "remove") {
    const startKmn = readVfsText(startVfs, kmnPath);
    const carvedKmn = carvedKmnIr[kmnPath];
    const files: OpenRemovalEntry["files"] = {};
    // "Before" is the text with the held overlays already written, so
    // restoring it keeps them.
    for (const path of changedPaths) {
      const before = baseOf(path);
      const after = changed[path];
      if (before !== null && typeof after === "string") files[path] = { before, after };
    }
    const itemIds = [...change.itemIds, ...(change.disabledRuleIds ?? [])];
    entry = {
      id: `open-removal-${(removalSeq += 1)}`,
      keyboardId,
      chars: [...new Set(change.chars.map((c) => c.normalize("NFC")))],
      combos: change.family !== undefined ? [] : resolveCarvedCombos(startIr, itemIds),
      ...(change.family !== undefined ? { family: change.family } : {}),
      rules:
        startKmn !== undefined && carvedKmn !== undefined
          ? recordRemovedRules(startIr, carvedKmn, startKmn)
          : [],
      files,
    };
  }

  const undoId = entry?.id ?? nextUndoId();
  const record = recordUndo(
    undoId,
    change.kind === "remove" ? "Remove characters" : label,
    keyboardId,
    baseOf,
    changed,
    entry !== undefined ? { kind: "removal", entry } : view,
  );
  const written = useWorkingCopyStore.getState().replaceStartingPointFiles(changed);
  if (!written.ok) return { status: "failed", reason: written.error };
  if (flushRecord !== undefined) useOpenUndoStore.getState().push(flushRecord);
  // A removal is always logged: the Removed list is derived from the log.
  if (entry !== undefined || Object.keys(record.files).length > 0) useOpenUndoStore.getState().push(record);
  // When the change was entirely what the held overlays carried, the flush step
  // IS the change and holds its undo record.
  const recorded = Object.keys(record.files).length > 0 ? undoId : (flushRecord?.id ?? undoId);
  return { status: "applied", changedPaths, undoId: recorded };
}


export function reinsertRules(
  text: string,
  keyboardId: string,
  rules: readonly RemovedRuleRecord[],
): string | undefined {
  let ir: KeyboardIR;
  try {
    ir = parseKmn(text, keyboardId).ir;
  } catch {
    return undefined;
  }
  const edits: KmnEdit[] = [];
  for (const rec of rules) {
    const group = ir.groups[rec.groupIndex];
    if (group === undefined) return undefined;
    if (rec.prevText === null) {
      edits.push({ kind: "insert", anchor: { after: "group-start", groupNodeId: group.nodeId }, text: rec.text });
      continue;
    }
    const anchor = findAnchor(group, rec);
    if (anchor === undefined) return undefined;
    edits.push({ kind: "insert", anchor: { after: "rule", nodeId: anchor }, text: rec.text });
  }
  try {
    const spliced = spliceKmn(text, ir, edits);
    if (!spliced.ok) return undefined;
    return isKeyboardSource(parseKmn(spliced.text, keyboardId).ir) ? spliced.text : undefined;
  } catch {
    return undefined;
  }
}

export function findAnchor(group: KeyboardIR["groups"][number], rec: RemovedRuleRecord): string | undefined {
  let count = 0;
  for (const r of group.rules) {
    if (emitRule(r, group.usingKeys) === rec.prevText && (count += 1) === rec.prevOrdinal) return r.nodeId;
  }
  return undefined;
}

/**
 * The same, as a full re-emit (the author agreed to a reformat). A rule whose
 * neighbour is gone goes to the start of its group; the author accepted that
 * the placement is approximate.
 */

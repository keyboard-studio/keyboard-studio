// openApply -- writes one change into an opened keyboard's files when the
// author applies it (spec 111, "Amendment 2026-11-13: live files", slice S1).
//
// On Open the files are the truth: an applied change is spliced into the
// source text now, through the same splice the output uses
// (`projectWorkingCopyVfs` -> `writeKmn` -> `projectKmnText`), so the code
// view, the preview and the download read one text. Nothing is kept as an
// overlay to be replayed later. Copy never comes through here.
//
// One synchronous call: it projects the single change onto a clone of the
// starting-point files with every overlay empty, checks the result, and writes
// every changed file in ONE store update (`replaceStartingPointFiles`). A
// change that cannot be placed precisely writes nothing and asks for consent
// (FR-009); the caller asks the author and calls again with it. No timers.

import {
  createVirtualFS,
  type KeyboardIR,
  type VirtualFS,
} from "@keyboard-studio/contracts";
import { emitKmn, emitRule, isKeyboardSource, parseKmn, spliceKmn } from "@keyboard-studio/engine";
import type { KmnEdit } from "@keyboard-studio/engine";
import {
  useWorkingCopyStore,
  type WorkingCopyState,
} from "../stores/workingCopyStore.ts";
import {
  useOpenRemovalStore,
  type OpenRemovalEntry,
  type RemovedRuleRecord,
} from "../stores/openRemovalStore.ts";
import {
  useOpenUndoStore,
  type OpenUndoRecord,
} from "../stores/openUndoStore.ts";
import {
  openModeProjection,
  projectionInputFromState,
  type ProjectionState,
} from "./projectionInput.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { isOpenedWithDescriptor } from "./openMode.ts";
import { findTouchLayoutPath } from "./findTouchLayoutPath.ts";
import { readVfsText } from "./vfsText.ts";
import { resolveCarvedCombos } from "./carvedCombo.ts";
import { deriveRuleAdditions, hasRuleAdditions } from "../survey/rules/ruleAdditions.ts";

/** A change the author applies to the opened keyboard. */
export type OpenChange =
  | {
      kind: "remove";
      /** Rule node ids and store-slot ids (`<storeNodeId>#<index>`) to remove. */
      itemIds: string[];
      /** The characters being carved (the aggregated carve pass reads them). */
      chars: string[];
      /** Rules removed outright because their family is disabled. */
      disabledRuleIds?: string[];
    }
  | {
      /** Put removed applied removals back (newest first). */
      kind: "reinsert";
      entries: OpenRemovalEntry[];
    }
  | {
      /** A whole next IR; its rules-step additions are spliced in. */
      kind: "ir";
      nextIr: KeyboardIR;
    }
  | {
      /**
       * A precomputed multi-file write (`null` deletes a file). It skips the
       * projection; a `.kmn` among the files is re-parsed and must still be a
       * keyboard. Later phases' editors use it.
       */
      kind: "files";
      files: Record<string, string | null>;
      /** Plain label recorded on the undo step. */
      label: string;
    };

export type OpenApplyResult =
  | {
      status: "applied";
      changedPaths: string[];
      undoId?: string;
      /** A restore left these files as they are because they changed since the removal. */
      notRestored?: string[];
    }
  | { status: "needs-consent"; files: string[] }
  | { status: "unchanged" }
  /** The author was asked and said no; nothing was written. (Set by the host.) */
  | { status: "declined" }
  | { status: "failed"; reason: string };

export interface OpenApplyOptions {
  /** The author agreed to a full re-emit of a file that cannot be spliced. */
  consentedReemit?: boolean;
}

let removalSeq = 0;
let undoSeq = 0;

const textOrNull = (vfs: VirtualFS, path: string): string | null => readVfsText(vfs, path) ?? null;

/** Label of the step that writes overlays held from earlier steps into the file. */
const EARLIER_CHANGES_LABEL = "Earlier changes written to the file";

/**
 * Build one undo step. `beforeOf` gives a path's text as it was before the
 * step; a path whose text did not change is left out. Call BEFORE the write.
 */
function recordUndo(
  id: string,
  label: string,
  keyboardId: string,
  beforeOf: (path: string) => string | null,
  changed: Record<string, string | null>,
): OpenUndoRecord {
  const files: OpenUndoRecord["files"] = {};
  for (const [path, after] of Object.entries(changed)) {
    const before = beforeOf(path);
    if (before !== after) files[path] = { before, after };
  }
  return { id, keyboardId, label, files };
}

/** The text a path had in `vfs`, unless `overrides` (an earlier step's result) says otherwise. */
const beforeFrom =
  (vfs: VirtualFS, overrides: Record<string, string | null>) =>
  (path: string): string | null =>
    path in overrides ? overrides[path]! : textOrNull(vfs, path);

const failure = (err: unknown): OpenApplyResult => ({
  status: "failed",
  reason: err instanceof Error ? err.message : String(err),
});

function sameContent(a: VirtualFS, b: VirtualFS, path: string): boolean {
  const x = a.get(path)?.content;
  const y = b.get(path)?.content;
  if (typeof x === "string" || typeof y === "string") return x === y;
  if (x === undefined || y === undefined) return x === y;
  return x.length === y.length && x.every((byte, i) => byte === y[i]);
}

/** Paths whose content differs between two file sets, `null` for a deleted file. */
function diffFiles(before: VirtualFS, after: VirtualFS): Record<string, string | null> {
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
function intendedMatchesText(intended: KeyboardIR, text: string, keyboardId: string): boolean {
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
function recordRemovedRules(
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

interface Projection {
  /** Files the projection changed, `null` for a deleted file. */
  changed: Record<string, string | null>;
  carvedKmnIr: Record<string, KeyboardIR>;
  /** The change carried held overlays (additions, a tolerance fix, earlier carves) with it. */
  carried: boolean;
}

/**
 * Project one change onto a clone of the starting-point files.
 *
 * Held overlays that the re-parse in `replaceStartingPointFiles` clears are
 * carried INTO the same run, so they are spliced into the file together with
 * the change instead of being dropped: rules-step additions (derived from `ir`
 * against `startIr`), the applied context-tolerance fix, and carves held by
 * overlay-writing callers (`deletedNodeIds`, `deletedItemIds`, `carveChars`).
 * Overlays the re-parse does NOT clear stay overlays and are left empty here:
 * deadkey ops, key-edit ops, disabled families, touch-key deletions, touch
 * keep-inert chars, marks guards and caps handling (the projection regenerates
 * them from their own stores on every preview and download).
 */
function projectChange(
  change:
    | { kind: "remove"; itemIds: string[]; chars: string[]; disabledRuleIds?: string[] }
    | { kind: "flush" }
    | { kind: "ir"; nextIr: KeyboardIR },
  opts: OpenApplyOptions,
): { ok: true; projection: Projection } | { ok: false; result: OpenApplyResult } {
  const st = useWorkingCopyStore.getState();
  const { startVfs, startIr, startKeyboard } = st;
  if (startVfs === null || startIr === null || startKeyboard === null) {
    return { ok: false, result: { status: "failed", reason: "No keyboard is open." } };
  }
  const keyboardId = startKeyboard.id;
  const consented = opts.consentedReemit === true;

  const clone = createVirtualFS(startVfs.entries());
  const touchPath = findTouchLayoutPath(clone);
  const touchJson = touchPath === undefined ? null : (readVfsText(clone, touchPath) ?? null);

  const removing = change.kind === "remove";
  const itemIds = removing ? [...change.itemIds, ...(change.disabledRuleIds ?? [])] : [];
  const workingIr = change.kind === "ir" ? change.nextIr : (st.ir ?? startIr);
  const carried =
    hasRuleAdditions(deriveRuleAdditions(workingIr, startIr)) ||
    (st.contextToleranceOverlay?.overlay.batches.length ?? 0) > 0 ||
    st.deletedNodeIds.size > 0 ||
    st.deletedItemIds.size > 0 ||
    st.carveChars.size > 0;
  const state: ProjectionState = {
    ir: workingIr,
    startIr,
    deletedNodeIds: new Set(st.deletedNodeIds),
    deletedItemIds: new Set([...st.deletedItemIds, ...itemIds]),
    carveChars: new Set([
      ...st.carveChars,
      ...(removing ? change.chars.map((c) => c.normalize("NFC")) : []),
    ]),
    deletedTouchKeyIds: new Set(),
    disabledFamilyIds: new Set(),
    // A setting the carve reads (it decides whether a removed key is blocked).
    fallbackPolicy: st.fallbackPolicy,
    carveTouchKeepInert: [],
    deadkeyOverlay: { ops: [] },
    contextToleranceOverlay: st.contextToleranceOverlay,
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
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    marksTreatment: undefined,
    capsHandling: undefined,
    openMode: {
      ...openModeProjection({
        identity: null,
        startDisplayName: null,
        ...(consented ? { consentedReemit: true } : {}),
      }),
      applyOnly: true,
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
  for (const [path, intended] of Object.entries(result.intendedKmnIr ?? {})) {
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
  return { ok: true, projection: { changed, carvedKmnIr: result.carvedKmnIr ?? {}, carried } };
}

function applyRemoveOrIr(
  change: Extract<OpenChange, { kind: "remove" | "ir" }>,
  opts: OpenApplyOptions,
): OpenApplyResult {
  const out = projectChange(change, opts);
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
        `open-undo-${(undoSeq += 1)}`,
        EARLIER_CHANGES_LABEL,
        keyboardId,
        beforeFrom(startVfs, {}),
        flushAfter,
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
      combos: resolveCarvedCombos(startIr, itemIds),
      rules:
        startKmn !== undefined && carvedKmn !== undefined
          ? recordRemovedRules(startIr, carvedKmn, startKmn)
          : [],
      files,
    };
  }

  const undoId = entry?.id ?? `open-undo-${(undoSeq += 1)}`;
  const record = recordUndo(
    undoId,
    change.kind === "remove" ? "Remove characters" : "Apply change",
    keyboardId,
    baseOf,
    changed,
  );
  const written = useWorkingCopyStore.getState().replaceStartingPointFiles(changed);
  if (!written.ok) return { status: "failed", reason: written.error };
  if (entry !== undefined) useOpenRemovalStore.getState().push(entry);
  if (flushRecord !== undefined) useOpenUndoStore.getState().push(flushRecord);
  if (Object.keys(record.files).length > 0) useOpenUndoStore.getState().push(record);
  return { status: "applied", changedPaths, undoId };
}

/** A precomputed multi-file write: no projection; the `.kmn` post-checks when one is included. */
function applyFiles(change: Extract<OpenChange, { kind: "files" }>): OpenApplyResult {
  const { startVfs, startKeyboard } = useWorkingCopyStore.getState();
  if (startVfs === null || startKeyboard === null) {
    return { status: "failed", reason: "No keyboard is open." };
  }
  const keyboardId = startKeyboard.id;
  const changed: Record<string, string | null> = {};
  for (const [path, text] of Object.entries(change.files)) {
    const current = textOrNull(startVfs, path);
    if (text === current) continue;
    changed[path] = text;
  }
  const changedPaths = Object.keys(changed);
  if (changedPaths.length === 0) return { status: "unchanged" };
  for (const path of changedPaths) {
    const text = changed[path];
    if (typeof text !== "string" || !path.endsWith(".kmn")) continue;
    // A `.kmn` that no longer parses as a keyboard is not written.
    const parsed = parseKmn(text, keyboardId).ir;
    if (!isKeyboardSource(parsed)) {
      return { status: "failed", reason: `${path} is not a keyboard source.` };
    }
  }
  const undoId = `open-undo-${(undoSeq += 1)}`;
  const record = recordUndo(undoId, change.label, keyboardId, beforeFrom(startVfs, {}), changed);
  const written = useWorkingCopyStore.getState().replaceStartingPointFiles(changed);
  if (!written.ok) return { status: "failed", reason: written.error };
  useOpenUndoStore.getState().push(record);
  return { status: "applied", changedPaths, undoId };
}

/** Insert `rules` back into `text` at their recorded places; undefined when one cannot be placed. */
function reinsertRules(
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

function findAnchor(group: KeyboardIR["groups"][number], rec: RemovedRuleRecord): string | undefined {
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
function reinsertRulesReformatting(
  text: string,
  keyboardId: string,
  rules: readonly RemovedRuleRecord[],
): string | undefined {
  try {
    const ir = parseKmn(text, keyboardId).ir;
    const groups = ir.groups.map((g) => ({ ...g, rules: [...g.rules] }));
    let n = 0;
    let lastKey = "";
    let lastId = "";
    for (const rec of rules) {
      const group = groups[rec.groupIndex];
      if (group === undefined) return undefined;
      const wrapper = parseKmn(
        `begin Unicode > use(main)\r\ngroup(main) using keys\r\n${rec.text}\r\n`,
        keyboardId,
      ).ir;
      const parsed = wrapper.groups.flatMap((g) => g.rules)[0];
      if (parsed === undefined) return undefined;
      const placed = { ...parsed, nodeId: `reinserted#${(n += 1)}` };
      delete (placed as { sourceLine?: number }).sourceLine;
      const key = `${rec.groupIndex}|${rec.prevText}|${rec.prevOrdinal}`;
      let index = 0;
      if (key === lastKey) {
        index = group.rules.findIndex((r) => r.nodeId === lastId) + 1;
      } else if (rec.prevText !== null) {
        const anchor = findAnchor(group, rec);
        index = anchor === undefined ? 0 : group.rules.findIndex((r) => r.nodeId === anchor) + 1;
      }
      group.rules.splice(index, 0, placed);
      lastKey = key;
      lastId = placed.nodeId;
    }
    const out = emitKmn({ ...ir, groups });
    return isKeyboardSource(parseKmn(out, keyboardId).ir) ? out : undefined;
  } catch {
    return undefined;
  }
}

function applyReinsert(
  change: Extract<OpenChange, { kind: "reinsert" }>,
  opts: OpenApplyOptions,
): OpenApplyResult {
  const consented = opts.consentedReemit === true;
  // Overlays held for the output go into the files first, so the re-parse that
  // follows does not drop them.
  const flush = projectChange({ kind: "flush" }, opts);
  if (!flush.ok) return flush.result;
  const st = useWorkingCopyStore.getState();
  const { startVfs, startKeyboard } = st;
  if (startVfs === null || startKeyboard === null) {
    return { status: "failed", reason: "No keyboard is open." };
  }
  const keyboardId = startKeyboard.id;
  const kmnPath = `source/${keyboardId}.kmn`;
  const work = new Map<string, string>();
  for (const [path, text] of Object.entries(flush.projection.changed)) {
    if (text !== null) work.set(path, text);
  }
  const current = (path: string): string | undefined => work.get(path) ?? readVfsText(startVfs, path);

  const restored = new Set<string>();
  const notRestored = new Set<string>();
  let needsConsent = false;
  // Atomic: if any entry cannot be put back, nothing is written and the
  // result says so; the author is never told "done" for a partial restore.
  // Newest first: each undone removal leaves the files as the one before it
  // left them, so the whole-file path stays exact down the stack.
  for (const entry of [...change.entries].reverse()) {
    const paths = Object.keys(entry.files);
    if (paths.length > 0 && paths.every((p) => current(p) === entry.files[p]!.after)) {
      for (const p of paths) work.set(p, entry.files[p]!.before);
      restored.add(entry.id);
      continue;
    }
    // The files moved on since (a later removal or an edit): put back only
    // the rules this removal deleted, each after the rule that preceded it.
    const text = current(kmnPath);
    if (text === undefined) {
      return { status: "failed", reason: `${kmnPath} is missing; the removed items cannot be put back.` };
    }
    if (entry.rules.length === 0) {
      return { status: "failed", reason: "The removed items cannot be put back precisely." };
    }
    // Other files this removal touched: put each back only while it still holds
    // what the removal wrote; one that changed since is reported, not overwritten.
    for (const p of paths) {
      if (p === kmnPath) continue;
      if (current(p) === entry.files[p]!.after) work.set(p, entry.files[p]!.before);
      else notRestored.add(p);
    }
    let next = reinsertRules(text, keyboardId, entry.rules);
    if (next === undefined) {
      if (!consented) {
        needsConsent = true;
        continue;
      }
      next = reinsertRulesReformatting(text, keyboardId, entry.rules);
    }
    if (next === undefined) {
      return { status: "failed", reason: "The removed items cannot be put back precisely." };
    }
    work.set(kmnPath, next);
    restored.add(entry.id);
  }
  // Nothing is written until the author has agreed to every reformat.
  if (needsConsent) return { status: "needs-consent", files: [kmnPath] };
  if (restored.size === 0) {
    return { status: "failed", reason: "The removed items cannot be put back precisely." };
  }
  const changed: Record<string, string | null> = {};
  for (const [path, text] of work) {
    if (readVfsText(startVfs, path) !== text) changed[path] = text;
  }
  // Held overlays go in as their own step first (see applyRemoveOrIr); the
  // restore is the second step, and undoing it puts the removals back on the list.
  const flushAfter = flush.projection.changed;
  const flushRecord =
    Object.keys(flushAfter).length > 0
      ? recordUndo(
          `open-undo-${(undoSeq += 1)}`,
          EARLIER_CHANGES_LABEL,
          keyboardId,
          beforeFrom(startVfs, {}),
          flushAfter,
        )
      : undefined;
  const record = recordUndo(
    `open-undo-${(undoSeq += 1)}`,
    "Restore removed items",
    keyboardId,
    beforeFrom(startVfs, flushAfter),
    changed,
  );
  record.removals = change.entries.filter((e) => restored.has(e.id));
  const written = useWorkingCopyStore.getState().replaceStartingPointFiles(changed);
  if (!written.ok) return { status: "failed", reason: written.error };
  useOpenRemovalStore.getState().drop(restored);
  if (flushRecord !== undefined) useOpenUndoStore.getState().push(flushRecord);
  if (Object.keys(record.files).length > 0) useOpenUndoStore.getState().push(record);
  return {
    status: "applied",
    changedPaths: Object.keys(changed),
    ...(notRestored.size > 0 ? { notRestored: [...notRestored] } : {}),
  };
}

/**
 * Apply one change to the opened keyboard's files.
 *
 * `applied`: the files are written and `startIr` re-parsed. `needs-consent`:
 * nothing was written; a file cannot be placed precisely and the author must
 * agree to a reformat (call again with `consentedReemit`). `unchanged`: the
 * change altered no file. `failed`: nothing was written.
 */
export function applyOpenChange(change: OpenChange, opts: OpenApplyOptions = {}): OpenApplyResult {
  const st: Pick<WorkingCopyState, "instantiationMode" | "startVfs" | "startKeyboard"> =
    useWorkingCopyStore.getState();
  if (!isOpenedWithDescriptor(st.instantiationMode, st.startVfs, st.startKeyboard?.id ?? "")) {
    return { status: "failed", reason: "The working copy was not opened from an existing keyboard." };
  }
  // Any throw (a parse, a splice, a store write) is a failed apply with the
  // files as they were: the store is only written as the last step, in one update.
  try {
    if (change.kind === "reinsert") return applyReinsert(change, opts);
    if (change.kind === "files") return applyFiles(change);
    return applyRemoveOrIr(change, opts);
  } catch (err) {
    return failure(err);
  }
}

/**
 * Undo the most recent applied change of this session: put each file's
 * `before` text back, but only while every file still holds the `after` the
 * change wrote. Otherwise nothing is written and the reason says why.
 */
export function undoLastOpenApply(): { ok: true; id: string } | { ok: false; reason: string } {
  const st = useWorkingCopyStore.getState();
  if (!isOpenedWithDescriptor(st.instantiationMode, st.startVfs, st.startKeyboard?.id ?? "")) {
    return { ok: false, reason: "The working copy was not opened from an existing keyboard." };
  }
  const keyboardId = st.startKeyboard!.id;
  const records = useOpenUndoStore.getState().records;
  const last = [...records].reverse().find((r) => r.keyboardId === keyboardId);
  if (last === undefined) return { ok: false, reason: "Nothing to undo." };
  const startVfs = st.startVfs!;
  const moved = Object.entries(last.files).filter(
    ([path, f]) => textOrNull(startVfs, path) !== f.after,
  );
  if (moved.length > 0) {
    return { ok: false, reason: `${moved.map(([p]) => p).join(", ")} changed since; it cannot be undone.` };
  }
  const restore: Record<string, string | null> = {};
  for (const [path, f] of Object.entries(last.files)) restore[path] = f.before;
  try {
    const written = st.replaceStartingPointFiles(restore);
    if (!written.ok) return { ok: false, reason: written.error };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  useOpenUndoStore.getState().drop(new Set([last.id]));
  for (const e of last.removals ?? []) useOpenRemovalStore.getState().push(e);
  // An undone removal is back in the files, so it leaves the Removed list.
  useOpenRemovalStore.getState().drop(new Set([last.id]));
  return { ok: true, id: last.id };
}

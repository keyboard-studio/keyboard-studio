// openApply -- writes one change into an opened keyboard's files when the
// author applies it (spec 111, "Amendment 2026-11-13: live files").
//
// On Open the files are the truth: an applied change is spliced into the
// source text now, through the same splice the output uses
// (`projectWorkingCopyVfs` -> `writeKmn` -> `projectKmnText`), so the code
// view, the preview and the download read one text. Nothing is kept as an
// overlay to be replayed later. Copy never comes through here.
//
// One synchronous call: it projects the change onto a clone of the
// starting-point files, checks the result, and writes every changed file in
// ONE store update (`replaceStartingPointFiles`). A change that cannot be
// placed precisely writes nothing and asks for consent (FR-009); the caller
// asks the author and calls again with it. Every applied change is one record
// in the undo log (`stores/openUndoStore`). No timers.
//
// The shared projection run and undo record are in `openApply/core.ts`; the
// assignment and marks kinds are in `openApply/assign.ts`.

import { emitKmn, isKeyboardSource, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore, type WorkingCopyState } from "../stores/workingCopyStore.ts";
import type { RemovedRuleRecord } from "../stores/openRemovalStore.ts";
import { useOpenUndoStore, type OpenUndoView } from "../stores/openUndoStore.ts";
import { isOpenedWithDescriptor } from "./openMode.ts";
import { readVfsText } from "./vfsText.ts";
import {
  beforeFrom,
  EARLIER_CHANGES_LABEL,
  failure,
  findAnchor,
  nextUndoId,
  projectChange,
  recordUndo,
  reinsertRules,
  textOrNull,
  applyRemoveOrIr,
} from "./openApply/core.ts";
import { applyAssign, applyMarks } from "./openApply/assign.ts";

export type {
  OpenApplyOptions,
  OpenApplyResult,
  OpenChange,
  RefusalCode,
} from "./openApply/types.ts";
import type { OpenApplyOptions, OpenApplyResult, OpenChange } from "./openApply/types.ts";

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
  const undoId = nextUndoId();
  const record = recordUndo(undoId, change.label, keyboardId, beforeFrom(startVfs, {}), changed, { kind: "files" });
  const written = useWorkingCopyStore.getState().replaceStartingPointFiles(changed);
  if (!written.ok) return { status: "failed", reason: written.error };
  useOpenUndoStore.getState().push(record);
  return { status: "applied", changedPaths, undoId };
}

/** Insert `rules` back into `text` at their recorded places; undefined when one cannot be placed. */
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
          nextUndoId(),
          EARLIER_CHANGES_LABEL,
          keyboardId,
          beforeFrom(startVfs, {}),
          flushAfter,
          { kind: "flush" },
        )
      : undefined;
  const record = recordUndo(
    nextUndoId(),
    "Restore removed items",
    keyboardId,
    beforeFrom(startVfs, flushAfter),
    changed,
    { kind: "restore", entries: change.entries.filter((e) => restored.has(e.id)) },
  );
  const written = useWorkingCopyStore.getState().replaceStartingPointFiles(changed);
  if (!written.ok) return { status: "failed", reason: written.error };
  if (flushRecord !== undefined) useOpenUndoStore.getState().push(flushRecord);
  // Always logged: the restored removals leave the Removed list because of it.
  useOpenUndoStore.getState().push(record);
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
    if (change.kind === "assign") return applyAssign(change, opts);
    if (change.kind === "marks") return applyMarks(opts);
    return applyRemoveOrIr(change, opts);
  } catch (err) {
    return failure(err);
  }
}

/** The per-kind part of an undo. Every kind's cache is derived from the log, so none has work to do. */
function revertView(view: OpenUndoView): void {
  switch (view.kind) {
    case "removal": // leaves the Removed list with its record
    case "restore": // its entries return to the Removed list with its record
    case "assign": // the session is the previous assign record's `after`
    case "marks":
    case "flush":
    case "files":
      return;
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
  // The Removed list and the assignment session are derived from the log, so
  // taking the record out of it is the whole per-kind revert.
  revertView(last.view);
  useOpenUndoStore.getState().drop(new Set([last.id]));
  return { ok: true, id: last.id };
}

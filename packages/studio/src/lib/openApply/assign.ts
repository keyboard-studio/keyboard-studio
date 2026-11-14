// openApply assign -- Mechanisms assignments and the marks guards, written
// into an opened keyboard's files when the author applies them (spec 111
// "live files", slice S2).
//
// One applied change = one undo record. An assignment run has three stages:
//   prepare : decide the starting text (nothing, or the session's own lines
//             taken back out when an assignment is being taken back or merged);
//   project : one `projectWorkingCopyVfs` run with the assignments as the only
//             non-empty input, so rules, stores and the keycap labels (.kvks,
//             touch) land through the same code as the output; then, when a
//             marks decision is recorded, a second run over that result writes
//             the guards that must see the new rules;
//   verify  : only lines the assignments added appear (a store the keyboard
//             already has is never overwritten), then record and write.
// Held overlays are written into the files first as their own step.

import type { KeyboardIR, MechanismAssignment } from "@keyboard-studio/contracts";
import { deriveFacets, isKeyboardSource, parseKmn, recognizePatterns } from "@keyboard-studio/engine";
import { useWorkingCopyStore, type WorkingCopyState } from "../../stores/workingCopyStore.ts";
import {
  assignmentFingerprint,
  useOpenAssignStore,
  type OpenAssignLine,
  type OpenAssignSession,
} from "../../stores/openAssignStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { getMarksTreatmentValue } from "../../survey/marks/marksValue.ts";
import { deriveRuleAdditions, hasRuleAdditions } from "../../survey/rules/ruleAdditions.ts";
import { marksGuardsFromValue } from "../projectionInput.ts";
import { readVfsText } from "../vfsText.ts";
import {
  applyRemoveOrIr,
  EARLIER_CHANGES_LABEL,
  beforeFrom,
  intendedMatchesText,
  nextUndoId,
  recordRemovedRules,
  recordUndo,
  reinsertRules,
  projectChange,
  textOrNull,
  type Projection,
} from "./core.ts";
import { labelPatchedTouchText } from "./touchLabels.ts";
import type { OpenApplyOptions, OpenApplyResult, OpenChange, RefusalCode } from "./types.ts";

// -- small text helpers -------------------------------------------------------

const splitLines = (text: string): string[] => text.split(/\r?\n/);

/** A line that does something: not blank, not a comment. */
const isFunctionalLine = (line: string): boolean => {
  const t = line.trim();
  return t !== "" && !/^c(\s|$)/i.test(t) && !t.startsWith("//");
};

const storeNameOfLine = (line: string): string | null =>
  /^\s*store\s*\(\s*([^)]+?)\s*\)/i.exec(line)?.[1] ?? null;

/**
 * Keyman compares store names with an ASCII-only fold: kmcmplib's duplicate
 * store check is case-insensitive and exempts system stores (docs/lint.md,
 * "Duplicate store names", CheckForDuplicates.cpp). `store(Tonal)` therefore
 * clashes with `store(tonal)`.
 */
const foldStoreName = (name: string): string => name.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** Lines `next` has that `base` lacks, and lines `base` has that `next` lacks (multiset). */
function diffLines(base: string, next: string): { added: string[]; vanished: string[] } {
  const counts = new Map<string, number>();
  for (const l of splitLines(base)) counts.set(l, (counts.get(l) ?? 0) + 1);
  const added: string[] = [];
  for (const l of splitLines(next)) {
    const c = counts.get(l) ?? 0;
    if (c > 0) counts.set(l, c - 1);
    else added.push(l);
  }
  const vanished: string[] = [];
  for (const [l, c] of counts) for (let i = 0; i < c; i++) vanished.push(l);
  return { added, vanished };
}

/**
 * `text` without the given lines; undefined when one is not there. Where a line
 * occurs more than once, the occurrence nearest to the place it was added goes.
 */
export function removeLines(text: string, lines: readonly OpenAssignLine[]): string | undefined {
  const segs = text.split(/(?<=\n)/);
  const content = segs.map((seg) => seg.replace(/\r?\n$/, ""));
  const taken = new Set<number>();
  for (const line of lines) {
    let best = -1;
    for (let i = 0; i < content.length; i++) {
      if (taken.has(i) || content[i] !== line.text) continue;
      if (best === -1 || Math.abs(i - line.at) < Math.abs(best - line.at)) best = i;
    }
    if (best === -1) return undefined;
    taken.add(best);
  }
  return segs.filter((_, i) => !taken.has(i)).join("");
}

/** The inserted lines come without carriage returns; a CRLF file gets them back. */
function matchEol(original: string, text: string): string {
  const allCrlf = original.includes("\r\n") && !/(^|[^\r])\n/.test(original);
  return allCrlf ? text.replace(/\r?\n/g, "\r\n") : text;
}

const refuse = (code: RefusalCode, reason: string, params: Record<string, string> = {}): OpenApplyResult => ({
  status: "failed",
  reason,
  refused: true,
  code,
  ...(Object.keys(params).length > 0 ? { params } : {}),
});

/** The model for a text, prepared the way instantiation prepares it. */
function irFor(text: string, keyboardId: string, touchLayout: KeyboardIR["touchLayout"]): KeyboardIR | undefined {
  const parsed = parseKmn(text, keyboardId).ir;
  if (!isKeyboardSource(parsed)) return undefined;
  const recognized = recognizePatterns(parsed).ir;
  return deriveFacets(touchLayout !== undefined ? { ...recognized, touchLayout } : recognized);
}

// -- context ------------------------------------------------------------------

/** Overlays the next apply would have to carry into the files first. */
function holdsOverlays(st: WorkingCopyState): boolean {
  const startIr = st.startIr;
  if (startIr === null) return false;
  return (
    hasRuleAdditions(deriveRuleAdditions(st.ir ?? startIr, startIr))
  );
}

interface AssignContext {
  st: WorkingCopyState;
  keyboardId: string;
  kmnPath: string;
  /** The `.kmn` as the file will hold it before this change: the store's text with held overlays written. */
  curKmn: string;
  /** Held overlays written ahead of this change (nothing is in the store yet). */
  flushChanged: Record<string, string | null>;
  sess: OpenAssignSession | null;
  curList: readonly MechanismAssignment[];
  gone: MechanismAssignment[];
  survivors: MechanismAssignment[];
  added: MechanismAssignment[];
  opts: OpenApplyOptions;
}

interface Prepared {
  /** Everything the session added is taken out and the whole new list applied. */
  regen: boolean;
  /** The files were rebuilt from the session's lines, not from the saved texts. */
  slow: boolean;
  prepared: Record<string, string | null>;
  prepText: string;
  prepIr: KeyboardIR | undefined;
  applyList: MechanismAssignment[];
}

// -- stage 1: prepare ---------------------------------------------------------

/** A file's text as this run sees it: the store's, unless the held overlays change it. */
const textOf = (ctx: AssignContext, path: string): string | null =>
  path in ctx.flushChanged ? ctx.flushChanged[path]! : textOrNull(ctx.st.startVfs!, path);

function prepare(ctx: AssignContext, forceRegen: boolean): { ok: true; value: Prepared } | { ok: false; result: OpenApplyResult } {
  const { st, keyboardId, kmnPath, curKmn, sess } = ctx;
  const regen = ctx.gone.length > 0 || forceRegen;
  let prepared: Record<string, string | null> = { ...ctx.flushChanged };
  let slow = false;
  if (regen) {
    if (sess === null) return { ok: false, result: { status: "failed", reason: "There is nothing to take back." } };
    const labelPaths = Object.keys(sess.lastAfter).filter((p) => p !== kmnPath);
    const unchanged = Object.entries(sess.lastAfter).every(([p, t]) => textOf(ctx, p) === t);
    if (sess.fast && unchanged) {
      prepared = { ...ctx.flushChanged, ...sess.base };
    } else {
      slow = true;
      if (
        ctx.gone.length > 0 &&
        (!sess.labelsOk || labelPaths.some((p) => textOf(ctx, p) !== sess.lastAfter[p]))
      ) {
        return {
          ok: false,
          result: refuse("labels-changed", "The key labels were changed since, so they cannot be put back safely."),
        };
      }
      const stripped = removeLines(curKmn, sess.lines);
      if (stripped === undefined) {
        return {
          ok: false,
          result: refuse("rules-edited", "Rules this assignment added were edited in the code."),
        };
      }
      let text = stripped;
      if (sess.claimed.length > 0) {
        const back = reinsertRules(text, keyboardId, sess.claimed);
        if (back === undefined) {
          return {
            ok: false,
            result: refuse("claimed-restore", "The keyboard's own rules this assignment replaced cannot be put back."),
          };
        }
        text = back;
      }
      prepared[kmnPath] = text;
      if (ctx.gone.length > 0) for (const p of labelPaths) prepared[p] = sess.base[p] ?? null;
    }
  }
  const prepText = prepared[kmnPath] ?? curKmn;
  let prepIr: KeyboardIR | undefined;
  if (prepText !== readVfsText(st.startVfs!, kmnPath)) {
    prepIr = irFor(prepText, keyboardId, st.startIr!.touchLayout);
    if (prepIr === undefined) {
      return { ok: false, result: { status: "failed", reason: `${kmnPath} is not a keyboard source.` } };
    }
  }
  const applyList = regen ? [...ctx.survivors, ...ctx.added] : ctx.added;
  return { ok: true, value: { regen, slow, prepared, prepText, prepIr, applyList } };
}

// -- stage 3: verify ----------------------------------------------------------

interface Verified {
  changed: Record<string, string | null>;
  finalKmn: string;
  addedFunctional: OpenAssignLine[];
  claimedRecords: ReturnType<typeof recordRemovedRules>;
}

function verify(
  ctx: AssignContext,
  prep: Prepared,
  projection: Projection,
): { ok: true; value: Verified } | { ok: false; result: OpenApplyResult } | { ok: false; retryRegen: true } {
  const { st, keyboardId, kmnPath, curKmn, sess } = ctx;
  const changed = { ...projection.changed };
  const finalKmn = typeof changed[kmnPath] === "string" ? matchEol(curKmn, changed[kmnPath]!) : curKmn;
  if (finalKmn !== readVfsText(st.startVfs!, kmnPath)) changed[kmnPath] = finalKmn;

  const parsedFinal = parseKmn(finalKmn, keyboardId).ir;
  if (!isKeyboardSource(parsedFinal)) {
    return { ok: false, result: { status: "failed", reason: `${kmnPath} did not come out as a keyboard source.` } };
  }

  const carved = projection.carvedKmnIr[kmnPath];
  const claimedRecords = carved === undefined ? [] : recordRemovedRules(prep.prepIr ?? st.startIr!, carved, prep.prepText);
  const claimedLines = new Set(claimedRecords.flatMap((r) => splitLines(r.text).map((l) => l.trim())));
  const diff = diffLines(prep.prepText, finalKmn);
  const ownTexts = new Set((sess?.lines ?? []).map((l) => l.text));

  // Stores: an assignment must not introduce a system store, and must not
  // overwrite (or duplicate, names fold case) a store the keyboard has.
  const existing = new Map<string, string>();
  for (const l of splitLines(prep.prepText)) {
    const n = storeNameOfLine(l);
    if (n !== null) existing.set(foldStoreName(n), l);
  }
  const addedNames = new Set<string>();
  for (const l of diff.added) {
    const n = storeNameOfLine(l);
    if (n === null) continue;
    // Two stores of one name in the same run clash with each other.
    if (addedNames.has(foldStoreName(n))) {
      return { ok: false, result: refuse("store-collision", "Two methods add a store with the same name.", { store: n }) };
    }
    addedNames.add(foldStoreName(n));
    if (n.startsWith("&")) return { ok: false, result: refuse("system-store", "An assignment may not write a system store.", { store: n }) };
    const clash = existing.get(foldStoreName(n));
    if (clash === undefined) continue;
    if (!prep.regen && ownTexts.has(clash)) return { ok: false, retryRegen: true };
    return { ok: false, result: refuse("store-collision", "A store with that name already exists.", { store: n }) };
  }
  for (const v of diff.vanished) {
    if (v.trim() === "" || claimedLines.has(v.trim())) continue;
    const n = storeNameOfLine(v);
    if (n?.startsWith("&") === true) return { ok: false, result: refuse("system-store", "An assignment may not change a system store.", { store: n }) };
    if (!prep.regen && ownTexts.has(v)) return { ok: false, retryRegen: true };
    if (n !== null) return { ok: false, result: refuse("store-collision", "A store with that name already exists.", { store: n }) };
    return { ok: false, result: refuse("own-rule", "The assignment would change one of the keyboard's own rules.") };
  }

  const intended = projection.intendedKmnIr[kmnPath];
  if (intended !== undefined && typeof projection.changed[kmnPath] === "string") {
    const probe = removeLines(finalKmn, diff.added.filter(isFunctionalLine).map((text) => ({ text, at: 0 }))) ?? finalKmn;
    if (!intendedMatchesText(intended, probe, keyboardId) && !intendedMatchesText(intended, finalKmn, keyboardId)) {
      return { ok: false, result: { status: "failed", reason: `${kmnPath} did not come out as the change intended.` } };
    }
  }

  const finalLines = splitLines(finalKmn);
  const addedFunctional: OpenAssignLine[] = [];
  const pool = new Map<string, number[]>();
  finalLines.forEach((l, i) => pool.set(l, [...(pool.get(l) ?? []), i]));
  for (const text of diff.added.filter(isFunctionalLine)) {
    const idxs = pool.get(text) ?? [];
    addedFunctional.push({ text, at: idxs.shift() ?? 0 });
  }
  return { ok: true, value: { changed, finalKmn, addedFunctional, claimedRecords } };
}

/**
 * Touch labels: patch only the key `text` values in the file's own text, so a
 * touch file that is not in the engine's canonical layout keeps every other
 * byte (FR-010). Falls back to the projection's re-serialised text only when
 * the text patch cannot be located, and then only with the author's consent.
 */
function keepTouchBytes(
  ctx: AssignContext,
  changed: Record<string, string | null>,
): { ok: true } | { ok: false; result: OpenApplyResult } {
  for (const [path, after] of Object.entries(changed)) {
    if (!path.endsWith(".keyman-touch-layout") || typeof after !== "string") continue;
    const before = textOf(ctx, path);
    if (before === null) continue;
    // Put back from the saved text (taking an assignment back): already exact bytes.
    if (ctx.sess?.base[path] === after) continue;
    const patched = labelPatchedTouchText(before, after);
    if (patched !== undefined) changed[path] = patched;
    else if (ctx.opts.consentedReemit !== true) return { ok: false, result: { status: "needs-consent", files: [path] } };
  }
  return { ok: true };
}

// -- the apply ----------------------------------------------------------------

function runAssign(ctx: AssignContext, forceRegen: boolean): OpenApplyResult {
  const { st, keyboardId, kmnPath, opts, sess } = ctx;
  const startVfs = st.startVfs!;
  const prep = prepare(ctx, forceRegen);
  if (!prep.ok) return prep.result;
  const p = prep.value;

  // Stage 2a: the assignments (guards are a second run, below).
  const marksValue = getMarksTreatmentValue();
  const out = projectChange({ kind: "flush" }, opts, {
    assignments: p.applyList,
    ...(marksValue !== undefined ? { marksTreatment: marksValue } : {}),
    runAs: "assign",
    prepared: p.prepared,
    ...(p.prepIr !== undefined ? { startIr: p.prepIr } : {}),
  });
  if (!out.ok) return out.result;
  const ver = verify(ctx, p, out.projection);
  if (!ver.ok) return "retryRegen" in ver ? runAssign(ctx, true) : ver.result;
  let { changed } = ver.value;
  const { finalKmn, addedFunctional, claimedRecords } = ver.value;

  // Stage 2b: the guards must see the new rules, so they are written in the
  // same applied change (one undo step). Consent for them is asked once, for
  // the whole change; declined means nothing is applied.
  if (marksValue !== undefined && marksGuardsFromValue(marksValue) !== null) {
    const guardIr = irFor(finalKmn, keyboardId, st.startIr!.touchLayout);
    if (guardIr === undefined) return { status: "failed", reason: `${kmnPath} is not a keyboard source.` };
    const guards = projectChange({ kind: "flush" }, opts, {
      marksTreatment: marksValue,
      prepared: changed,
      startIr: guardIr,
      runAs: "marks",
    });
    if (!guards.ok) return guards.result;
    changed = { ...guards.projection.changed };
  }

  const touch = keepTouchBytes(ctx, changed);
  if (!touch.ok) return touch.result;

  // Stage 3: the session after this change, then record and write.
  const changedPaths = Object.keys(changed);
  const nextList = p.regen ? p.applyList : [...ctx.curList, ...ctx.added];
  const base: Record<string, string | null> = { ...(sess?.base ?? {}) };
  for (const path of changedPaths) if (!(path in base)) base[path] = textOf(ctx, path);
  const lastAfter: Record<string, string | null> = { ...(sess?.lastAfter ?? {}), ...changed };
  const consistentBefore = sess === null || Object.entries(sess.lastAfter).every(([q, t]) => textOf(ctx, q) === t);
  const labelsConsistent =
    sess === null ||
    Object.keys(lastAfter)
      .filter((q) => q !== kmnPath)
      .every((q) => !(q in sess.lastAfter) || textOf(ctx, q) === sess.lastAfter[q]);
  const after: OpenAssignSession | null =
    nextList.length === 0
      ? null
      : {
          keyboardId,
          assignments: nextList,
          lines: p.regen ? addedFunctional : [...(sess?.lines ?? []), ...addedFunctional],
          base,
          lastAfter,
          fast: (sess?.fast ?? true) && consistentBefore && !p.slow,
          labelsOk: (sess?.labelsOk ?? true) && labelsConsistent,
          claimed: p.regen ? claimedRecords : [...(sess?.claimed ?? []), ...claimedRecords],
        };

  const undoId = nextUndoId();
  const record = recordUndo(
    undoId,
    ctx.gone.length > 0 && ctx.added.length === 0 ? "Take back assignment" : "Assign characters",
    keyboardId,
    beforeFrom(startVfs, ctx.flushChanged),
    changed,
    { kind: "assign", before: sess, after },
    ctx.gone.length > 0 && ctx.added.length === 0 ? "take-back" : undefined,
  );
  // Held overlays go in as their own step (undoing the assignment keeps them);
  // everything is verified by now, so the one store update cannot be followed
  // by a refusal.
  const flushRecord =
    Object.keys(ctx.flushChanged).length > 0
      ? recordUndo(nextUndoId(), EARLIER_CHANGES_LABEL, keyboardId, beforeFrom(startVfs, {}), ctx.flushChanged, { kind: "flush" }, "earlier-changes")
      : undefined;
  if (changedPaths.length > 0) {
    const written = useWorkingCopyStore.getState().replaceStartingPointFiles(changed);
    if (!written.ok) return { status: "failed", reason: written.error };
  }
  if (flushRecord !== undefined && Object.keys(flushRecord.files).length > 0) useOpenUndoStore.getState().push(flushRecord);
  // Always logged: the session list is derived from the log.
  useOpenUndoStore.getState().push(record);
  return { status: "applied", changedPaths, undoId };
}

export function applyAssign(change: Extract<OpenChange, { kind: "assign" }>, opts: OpenApplyOptions): OpenApplyResult {
  const st = useWorkingCopyStore.getState();
  // Held overlays are carried INTO this run (projected, not yet written), so
  // the starting text is the whole truth and nothing is written until the
  // assignment itself has been verified: a refusal or a declined consent
  // leaves the files and the undo log exactly as they were.
  let flushChanged: Record<string, string | null> = {};
  if (holdsOverlays(st)) {
    const flush = projectChange({ kind: "flush" }, opts);
    if (!flush.ok) return flush.result;
    flushChanged = flush.projection.changed;
  }
  if (st.startVfs === null || st.startKeyboard === null || st.startIr === null) {
    return { status: "failed", reason: "No keyboard is open." };
  }
  const keyboardId = st.startKeyboard.id;
  const kmnPath = `source/${keyboardId}.kmn`;
  const curKmn = (flushChanged[kmnPath] as string | undefined) ?? readVfsText(st.startVfs, kmnPath);
  if (curKmn === undefined) return { status: "failed", reason: `${kmnPath} is missing.` };

  const sessionNow = useOpenAssignStore.getState().session;
  const sess = sessionNow !== null && sessionNow.keyboardId === keyboardId ? sessionNow : null;
  const curList = sess?.assignments ?? [];
  const wanted = new Set(change.remove);
  const gone = curList.filter((a) => wanted.has(assignmentFingerprint(a)));
  const survivors = curList.filter((a) => !wanted.has(assignmentFingerprint(a)));
  const survivorKeys = new Set(survivors.map(assignmentFingerprint));
  const added = change.add.filter((a) => a.modality === "physical" && !survivorKeys.has(assignmentFingerprint(a)));
  if (gone.length === 0 && added.length === 0) return { status: "unchanged" };
  return runAssign({ st, keyboardId, kmnPath, curKmn, flushChanged, sess, curList, gone, survivors, added, opts }, false);
}

/** The recorded marks decision's guard rules, written into the file. */
export function applyMarks(opts: OpenApplyOptions): OpenApplyResult {
  const st = useWorkingCopyStore.getState();
  if (st.startIr === null) return { status: "failed", reason: "No keyboard is open." };
  const value = getMarksTreatmentValue();
  if (marksGuardsFromValue(value) === null || value === undefined) return { status: "unchanged" };
  const change = { kind: "ir" as const, nextIr: st.ir ?? st.startIr };
  // Re-applying the same decision must leave the file as it is: the guards
  // strip and rebuild their own artifacts, and the projection puts them back
  // byte-identical, so a result equal to the file is "nothing to write".
  const trial = projectChange(change, opts, { marksTreatment: value, runAs: "marks" });
  if (trial.ok) {
    const paths = Object.keys(trial.projection.changed);
    if (
      paths.length > 0 &&
      paths.every((path) => trial.projection.changed[path] === textOrNull(st.startVfs!, path))
    ) {
      return { status: "unchanged" };
    }
  }
  return applyRemoveOrIr(change, opts, { marksTreatment: value, runAs: "marks" }, "Write mark guards", { kind: "marks" });
}

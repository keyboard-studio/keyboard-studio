// openApply touch -- a touch-layout edit written into the file's own text
// (spec 111 phase 16). The intended layout is computed by the same raw-JSON
// appliers the output uses, then `patchTouchText` puts only the difference into
// the file as it is now. When the text cannot be patched the canonical
// serialisation is written, with the author's consent. An optional `.kmn` half
// (rules, key renames) lands in the same change: one undo record, one write.

import {
  ruleContextElements,
  type KeyboardIR,
} from "@keyboard-studio/contracts";
import {
  applyKeyEditsToRawJson,
  applyTouchAssignmentsToRawJson,
  applyTouchKeycapRemovalsToRawJson,
  isKeyboardSource,
  parseKmn,
  projectKmnText,
  emitKmn,
  emitRule,
  type RenameKeyOp,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useOpenUndoStore, type OpenUndoView } from "../../stores/openUndoStore.ts";
import { findTouchLayoutPath } from "../findTouchLayoutPath.ts";
import { applyKeyRenamesToRuleBindings } from "../projectWorkingCopyVfs.ts";
import { readVfsText } from "../vfsText.ts";
import { beforeFrom, intendedMatchesText, nextUndoId, recordUndo, spliceKmnIntended } from "./core.ts";
import { scopeToWrites } from "./scopeToWrites.ts";
import { patchTouchText } from "./touchText.ts";
import type { OpenApplyOptions, OpenApplyResult, OpenChange } from "./types.ts";

const BOM = "﻿";

/** The canonical text the appliers produce for `edit`, from the file text without its BOM. */
function canonicalAfter(raw: string, change: Extract<OpenChange, { kind: "touch" }>): string {
  const { edit } = change;
  if ("ops" in edit) return applyKeyEditsToRawJson(raw, [...edit.ops].sort((a, b) => a.seq - b.seq)).json;
  if ("assignments" in edit) return applyTouchAssignmentsToRawJson(raw, edit.assignments).json;
  return applyTouchKeycapRemovalsToRawJson(raw, new Set(edit.removeIds)).json;
}

/**
 * Vkey names (upper case) bound by the rules `intended` adds to `startIr`
 * (severance: their rename is not applied). Rules are told apart by their text,
 * per group name, not by node id (ids are positional: an insert shifts them).
 */
function additionBoundIds(startIr: KeyboardIR, intended: KeyboardIR): Set<string> {
  const have = new Map<string, number>();
  for (const g of startIr.groups) {
    for (const r of g.rules) {
      const key = `${g.name}|${emitRule(r, g.usingKeys)}`;
      have.set(key, (have.get(key) ?? 0) + 1);
    }
  }
  const out = new Set<string>();
  for (const g of intended.groups) {
    for (const r of g.rules) {
      const key = `${g.name}|${emitRule(r, g.usingKeys)}`;
      const n = have.get(key) ?? 0;
      if (n > 0) {
        have.set(key, n - 1);
        continue;
      }
      for (const el of ruleContextElements(r)) if (el.kind === "vkey") out.add(el.name.toUpperCase());
    }
  }
  return out;
}

export function applyTouch(change: Extract<OpenChange, { kind: "touch" }>, opts: OpenApplyOptions): OpenApplyResult {
  const { startVfs, startKeyboard, startIr } = useWorkingCopyStore.getState();
  if (startVfs === null || startKeyboard === null || startIr === null) {
    return { status: "failed", reason: "No keyboard is open." };
  }
  const keyboardId = startKeyboard.id;
  const consented = opts.consentedReemit === true;
  const touchPath = findTouchLayoutPath(startVfs);
  if (touchPath === undefined) return { status: "failed", reason: "The keyboard has no touch layout." };
  const before = readVfsText(startVfs, touchPath);
  if (before === undefined) return { status: "failed", reason: `${touchPath} is not text.` };

  const changed: Record<string, string | null> = {};
  const needConsent: string[] = [];

  // The touch file.
  const bom = before.startsWith(BOM) ? BOM : "";
  // An unreadable touch file is a failed apply, never a request for consent
  // to write a canonicalisation that could not be computed.
  let canonical: string;
  let intendedLayout: unknown;
  try {
    canonical = canonicalAfter(before.slice(bom.length), change);
    intendedLayout = JSON.parse(canonical);
  } catch (err) {
    return { status: "failed", reason: `${touchPath} cannot be read as a touch layout: ${err instanceof Error ? err.message : String(err)}` };
  }
  const patched = patchTouchText(before, intendedLayout);
  if (patched !== undefined) {
    if (patched !== before) changed[touchPath] = patched;
  } else if (consented) {
    changed[touchPath] = bom + canonical;
  } else {
    needConsent.push(touchPath);
  }

  // The `.kmn` half, spliced into the file's own text.
  const kmnPath = `source/${keyboardId}.kmn`;
  let kmnText = readVfsText(startVfs, kmnPath);
  if (change.rules !== undefined || (change.renames?.length ?? 0) > 0) {
    if (kmnText === undefined) return { status: "failed", reason: `${kmnPath} is missing.` };
    let current = kmnText;
    let ir = startIr;
    let scoped: KeyboardIR | undefined;
    if (change.rules !== undefined) {
      const intended = scopeToWrites(startIr, change.rules.nextIr, change.rules.writes);
      scoped = intended;
      const out = spliceKmnIntended(current, startIr, intended, keyboardId, consented);
      if (!out.ok) needConsent.push(kmnPath);
      else {
        current = out.text;
        ir = parseKmn(current, keyboardId).ir;
      }
    }
    const bound = scoped !== undefined ? additionBoundIds(startIr, scoped) : new Set<string>();
    const renames = (change.renames ?? []).filter((op: RenameKeyOp) => !bound.has(op.toId.toUpperCase()));
    if (renames.length > 0 && !needConsent.includes(kmnPath)) {
      const parsed = current === kmnText ? ir : parseKmn(current, keyboardId).ir;
      const result = applyKeyRenamesToRuleBindings(parsed, renames);
      if (result.changed) {
        const projected = projectKmnText(current, parsed, result.ir);
        if (projected.ok && intendedMatchesText(result.ir, projected.text, keyboardId)) current = projected.text;
        else if (consented) current = emitKmn(result.ir);
        else needConsent.push(kmnPath);
      }
    }
    if (!needConsent.includes(kmnPath) && current !== kmnText) {
      if (!isKeyboardSource(parseKmn(current, keyboardId).ir)) {
        return { status: "failed", reason: `${kmnPath} is not a keyboard source.` };
      }
      changed[kmnPath] = current;
    }
    kmnText = current;
  }

  // Nothing is written until the author has agreed to every reformat.
  if (needConsent.length > 0) return { status: "needs-consent", files: needConsent };
  const changedPaths = Object.keys(changed);
  if (changedPaths.length === 0) return { status: "unchanged" };

  const undoId = nextUndoId();
  const edit: Extract<OpenUndoView, { kind: "touch" }>["edit"] =
    "ops" in change.edit
      ? { type: "ops", ops: change.edit.ops }
      : "assignments" in change.edit
        ? { type: "assignments" }
        : { type: "removals" };
  const record = recordUndo(undoId, change.label, keyboardId, beforeFrom(startVfs, {}), changed, { kind: "touch", edit });
  const written = useWorkingCopyStore.getState().replaceStartingPointFiles(changed);
  if (!written.ok) return { status: "failed", reason: written.error };
  useOpenUndoStore.getState().push(record);
  return { status: "applied", changedPaths, undoId };
}

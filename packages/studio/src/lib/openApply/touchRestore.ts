// touchRestore -- take a touch-method deletion back on Open (spec 111 phase 16, S3).
//
// A deletion (`{removeIds}`) never removes a key object: it drops a sub-entry
// (long-press, multitap, flick) or blanks a main key, so every key it touches
// keeps its place in its row. The deletion's undo record therefore carries, per
// key it changed, the place (platform, layer, row, index) with the key as it was
// and as it was left. A restore writes the saved key back at that place, and only
// when the key there is still exactly as the deletion left it: a key that has
// changed since is never overwritten.
//
// The restore list is derived from the session undo log (`pendingTouchDeletions`),
// as the Removed list is for the desktop remove tool: an undone deletion is not on
// it (its record is gone), a restored one is not on it, and nothing else holds it.

import type { OpenUndoRecord, TouchKeyRestoreEntry } from "../../stores/openUndoStore.ts";

export type { TouchKeyRestoreEntry };

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Structural JSON equality; object key order is not meaningful. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    return ak.length === bk.length && ak.every((k) => k in b && sameJson(a[k], b[k]));
  }
  return false;
}

/** Every key of a raw touch layout, with its place. */
function forEachKey(
  layout: unknown,
  visit: (platform: string, layerId: string, row: number, index: number, key: unknown, rowKeys: unknown[]) => void,
): void {
  if (!isObject(layout)) return;
  for (const [platform, p] of Object.entries(layout)) {
    if (!isObject(p) || !Array.isArray(p["layer"])) continue;
    for (const layer of p["layer"] as unknown[]) {
      if (!isObject(layer) || !Array.isArray(layer["row"])) continue;
      const layerId = String(layer["id"] ?? "");
      (layer["row"] as unknown[]).forEach((row, r) => {
        if (!isObject(row) || !Array.isArray(row["key"])) return;
        (row["key"] as unknown[]).forEach((key, i) => visit(platform, layerId, r, i, key, row["key"] as unknown[]));
      });
    }
  }
}

/** The keys that differ between a layout and the same layout after a deletion (same shape). */
export function diffTouchKeys(beforeLayout: unknown, afterLayout: unknown): TouchKeyRestoreEntry[] {
  const afterKeys = new Map<string, unknown>();
  forEachKey(afterLayout, (platform, layerId, row, index, key) => {
    afterKeys.set(`${platform}\0${layerId}\0${row}\0${index}`, key);
  });
  const out: TouchKeyRestoreEntry[] = [];
  forEachKey(beforeLayout, (platform, layerId, row, index, key) => {
    const after = afterKeys.get(`${platform}\0${layerId}\0${row}\0${index}`);
    if (after !== undefined && !sameJson(key, after)) out.push({ platform, layerId, row, index, before: key, after });
  });
  return out;
}

/**
 * The key a saved entry refers to: found by its `id` (as the deletion left it) within
 * its platform and layer, so an insertion or removal earlier in the row does not
 * lose it. When several keys in the layer carry that id, only the one still at the
 * saved place (row, index) counts; with none there, the entry is not located.
 */
function locate(layout: unknown, e: TouchKeyRestoreEntry): { keys: unknown[]; index: number } | undefined {
  const id = isObject(e.after) ? e.after["id"] : undefined;
  const byId: { keys: unknown[]; index: number; row: number }[] = [];
  forEachKey(layout, (platform, layerId, row, index, key, rowKeys) => {
    if (platform !== e.platform || layerId !== e.layerId) return;
    if (isObject(key) && key["id"] === id) byId.push({ keys: rowKeys, index, row });
  });
  if (byId.length === 1) return byId[0];
  return byId.find((c) => c.row === e.row && c.index === e.index);
}

/** True when every entry's place still holds exactly the key the deletion left. */
export function restoreMatches(layout: unknown, entries: readonly TouchKeyRestoreEntry[]): boolean {
  return entries.every((e) => {
    const at = locate(layout, e);
    return at !== undefined && sameJson(at.keys[at.index], e.after);
  });
}

/**
 * The layout with the saved keys put back (mutates `layout`, a parsed copy). With
 * `force` a key is put back wherever its place exists, even if it has changed:
 * only for showing what a restore would bring back, never for writing.
 */
export function putKeysBack(layout: unknown, entries: readonly TouchKeyRestoreEntry[], force = false): void {
  for (const e of entries) {
    const at = locate(layout, e);
    if (at === undefined) continue;
    if (force || sameJson(at.keys[at.index], e.after)) at.keys[at.index] = structuredClone(e.before);
  }
}

/** Deleted methods the session log still holds: method id -> the keys a restore puts back. */
export function pendingTouchDeletions(records: readonly OpenUndoRecord[]): Map<string, TouchKeyRestoreEntry[]> {
  const pending = new Map<string, TouchKeyRestoreEntry[]>();
  for (const r of records) {
    if (r.view.kind !== "touch") continue;
    const edit = r.view.edit;
    if (edit.type === "removals") {
      for (const id of edit.ids) pending.set(id, edit.keys);
    } else if (edit.type === "restores") {
      // One deletion's ids share its saved keys, and a restore puts those keys back:
      // its sibling ids are no longer deleted either.
      for (const id of edit.ids) {
        const keys = pending.get(id);
        pending.delete(id);
        if (keys === undefined) continue;
        for (const [other, k] of pending) if (k === keys) pending.delete(other);
      }
    }
  }
  return pending;
}

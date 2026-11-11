/**
 * diffIR -- the structural difference between two IRs as content-anchored changes
 * (spec 117 US8, contracts/code-edits.md; research R13).
 *
 * The diff sees only what the emitter writes, so it is empty when two IRs emit
 * the same text (FR-066: a formatting-only edit records nothing). Groups and
 * stores align by name; rules, comments, and opaque fragments within a container
 * by a longest common subsequence over canonical emitted text, so an insert early
 * in a group is one insert, not a cascade of replaces.
 *
 * Changes are generated against a simulated copy of the container, so each
 * anchor names the neighbours the item has at the moment `applyIRChanges`
 * reaches that change.
 */

import type {
  IRBegin,
  IRChange,
  IRHeaderPatch,
  IRStore,
  KeyboardIR,
  StoreValue,
} from "@keyboard-studio/contracts";
import { emitStore } from "../codec/emit.js";
import {
  anchorFor,
  insertAnchorAt,
  sequenceOf,
  type Container,
  type SeqItem,
} from "./sequence.js";

function effectiveBegin(ir: KeyboardIR): IRBegin {
  return {
    encoding: ir.header.encoding ?? "Unicode",
    main: ir.header.entryPoints?.main ?? ir.groups.find((g) => !g.readonly)?.name ?? "main",
  };
}

function storeKey(s: IRStore): string {
  return `${s.isSystem ? "&" : ""}${s.name}`.toLowerCase();
}

function storeValue(s: IRStore): StoreValue {
  const { nodeId: _nodeId, sourceLine: _sourceLine, ...value } = s;
  return value;
}

function storeText(s: IRStore): string {
  return `${s.isSystem ? "S" : "U"}|${emitStore(s)}`;
}

/** Longest common subsequence over item texts; returns matched index pairs in order. */
function lcsPairs(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let ea = a.length;
  let eb = b.length;
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < lo; i++) pairs.push([i, i]);
  const n = ea - lo;
  const m = eb - lo;
  if (n > 0 && m > 0) {
    const width = m + 1;
    const dp = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * width + j] =
          a[lo + i] === b[lo + j]
            ? dp[(i + 1) * width + j + 1]! + 1
            : Math.max(dp[(i + 1) * width + j]!, dp[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[lo + i] === b[lo + j]) {
        pairs.push([lo + i, lo + j]);
        i++;
        j++;
      } else if (dp[(i + 1) * width + j]! >= dp[i * width + j + 1]!) i++;
      else j++;
    }
  }
  for (let k = 0; k < a.length - ea; k++) pairs.push([ea + k, eb + k]);
  return pairs;
}

/** Changes that turn container items `before` into `after`, anchored against a running copy. */
function diffContainer(container: Container, before: readonly SeqItem[], after: readonly SeqItem[]): IRChange[] {
  const out: IRChange[] = [];
  const cur: SeqItem[] = [...before];
  const pairs = lcsPairs(
    before.map((i) => i.text),
    after.map((i) => i.text),
  );
  pairs.push([before.length, after.length]);
  let p = 0; // position in `cur`
  let i = 0; // next unmatched index in `before`
  let j = 0; // next unmatched index in `after`
  for (const [mi, mj] of pairs) {
    const removed = before.slice(i, mi);
    const inserted = after.slice(j, mj);
    const paired = Math.min(removed.length, inserted.length);
    for (let t = 0; t < paired; t++) {
      const old = cur[p]!;
      const next = inserted[t]!;
      if (old.kind === next.kind) {
        out.push({ change: "replace", at: anchorFor(container, cur, p), old: old.node, node: next.node });
        cur[p] = next;
        p++;
      } else {
        out.push({ change: "remove", at: anchorFor(container, cur, p), old: old.node });
        cur.splice(p, 1);
        out.push({ change: "insert", at: insertAnchorAt(container, cur, p), node: next.node });
        cur.splice(p, 0, next);
        p++;
      }
    }
    for (let t = paired; t < removed.length; t++) {
      out.push({ change: "remove", at: anchorFor(container, cur, p), old: cur[p]!.node });
      cur.splice(p, 1);
    }
    for (let t = paired; t < inserted.length; t++) {
      out.push({ change: "insert", at: insertAnchorAt(container, cur, p), node: inserted[t]!.node });
      cur.splice(p, 0, inserted[t]!);
      p++;
    }
    i = mi + 1;
    j = mj + 1;
    p++; // the matched item
  }
  return out;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffIR(before: KeyboardIR, after: KeyboardIR): IRChange[] {
  const out: IRChange[] = [];

  // Groups: removed first (items before the group, so it is empty when it goes), then added / changed.
  const afterGroups = new Map(after.groups.map((g) => [g.name, g]));
  const beforeGroups = new Map(before.groups.map((g) => [g.name, g]));
  const groupOrder = before.groups.map((g) => g.name);
  const removeGroup = (name: string): void => {
    const group = beforeGroups.get(name)!;
    const container: Container = { kind: "group", name, usingKeys: group.usingKeys };
    out.push(...diffContainer(container, sequenceOf(before, container), []));
    const idx = groupOrder.indexOf(name);
    const prev = idx > 0 ? groupOrder[idx - 1] : undefined;
    out.push({
      change: "remove-group",
      previous: { ...group, rules: [] },
      ...(prev === undefined ? {} : { after: prev }),
    });
    groupOrder.splice(idx, 1);
  };
  for (const g of before.groups) {
    const next = afterGroups.get(g.name);
    if (next === undefined || next.usingKeys !== g.usingKeys) removeGroup(g.name);
  }
  after.groups.forEach((g, idx) => {
    const old = beforeGroups.get(g.name);
    const container: Container = { kind: "group", name: g.name, usingKeys: g.usingKeys };
    if (old !== undefined && old.usingKeys === g.usingKeys) {
      out.push(...diffContainer(container, sequenceOf(before, container), sequenceOf(after, container)));
      return;
    }
    const prev = idx > 0 ? after.groups[idx - 1]!.name : undefined;
    out.push({
      change: "add-group",
      group: { ...g, rules: [] },
      ...(prev === undefined ? {} : { after: prev }),
    });
    out.push(...diffContainer(container, [], sequenceOf(after, container)));
  });

  // Global fragments and freestanding comments.
  const raw: Container = { kind: "raw" };
  out.push(...diffContainer(raw, sequenceOf(before, raw), sequenceOf(after, raw)));

  // Stores by name.
  const beforeStores = new Map(before.stores.map((s) => [storeKey(s), s]));
  const afterStores = new Map(after.stores.map((s) => [storeKey(s), s]));
  const storeOrder = before.stores.map((s) => s.name);
  let systemChanged = false;
  for (const s of before.stores) {
    if (afterStores.has(storeKey(s))) continue;
    const idx = storeOrder.indexOf(s.name);
    const prev = idx > 0 ? storeOrder[idx - 1] : undefined;
    out.push({
      change: "remove-store",
      name: s.name,
      previous: storeValue(s),
      ...(prev === undefined ? {} : { after: prev }),
    });
    storeOrder.splice(idx, 1);
    if (s.isSystem) systemChanged = true;
  }
  after.stores.forEach((s, idx) => {
    const old = beforeStores.get(storeKey(s));
    if (old !== undefined) {
      if (storeText(old) === storeText(s)) return;
      out.push({ change: "set-store", name: s.name, value: storeValue(s), previous: storeValue(old) });
    } else {
      const prev = idx > 0 ? after.stores[idx - 1]!.name : undefined;
      out.push({
        change: "set-store",
        name: s.name,
        value: storeValue(s),
        ...(prev === undefined ? {} : { after: prev }),
      });
    }
    if (s.isSystem) systemChanged = true;
  });

  // The begin statement.
  const b0 = effectiveBegin(before);
  const b1 = effectiveBegin(after);
  if (!sameJson(b0, b1)) out.push({ change: "set-begin", begin: b1, previous: b0 });

  // Header fields: only alongside a system-store change (the header is derived from those stores,
  // and a header that merely lags its stores must not read as an edit).
  if (systemChanged) {
    const fields = ["name", "bcp47", "copyright", "version", "targets", "storeDirectives"] as const;
    const header: Record<string, unknown> = {};
    const previous: Record<string, unknown> = {};
    for (const f of fields) {
      if (!sameJson(before.header[f], after.header[f])) {
        header[f] = after.header[f];
        previous[f] = before.header[f];
      }
    }
    if (Object.keys(header).length > 0) {
      out.push({ change: "set-header", header: header as IRHeaderPatch, previous: previous as IRHeaderPatch });
    }
  }
  return out;
}

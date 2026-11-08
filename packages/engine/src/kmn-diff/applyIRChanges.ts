/**
 * applyIRChanges -- apply content-anchored changes to an IR (spec 113 US8,
 * contracts/code-edits.md). Pure: the input is never mutated.
 *
 * Untouched nodes keep their ids. Inserted and replaced nodes get fresh ids above
 * the IR's highest (per kind) and rules are stamped `authorEdit: "code-tab"`. A
 * change whose anchor is not found is skipped and its index listed in `misses`
 * (FR-063 b): never thrown, never dropped silently.
 */

import type {
  ContentAnchor,
  IRChange,
  IRComment,
  IRGroup,
  IRNode,
  IRRule,
  IRStore,
  KeyboardIR,
  RawKmnFragment,
} from "@keyboard-studio/contracts";
import type { KmnEditEffect } from "../layout-ops/types.js";
import {
  isFrag,
  isRule,
  locate,
  sequenceOf,
  type Container,
  type SeqItem,
} from "./sequence.js";

export interface ApplyIRChangesResult {
  ir: KeyboardIR;
  effect: KmnEditEffect;
  /** Indexes of the changes that could not be applied. */
  misses: number[];
}

function makeMinter(ir: KeyboardIR): (kind: "rule" | "store" | "group" | "comment" | "raw") => string {
  const used = new Set<string>();
  const max = new Map<string, number>();
  const note = (id: string): void => {
    used.add(id);
    const m = /^([A-Za-z]+)#(\d+)$/.exec(id);
    if (m !== null) max.set(m[1]!, Math.max(max.get(m[1]!) ?? -1, Number(m[2])));
  };
  for (const s of ir.stores) note(s.nodeId);
  for (const c of ir.comments) note(c.nodeId);
  for (const f of ir.raw) note(f.nodeId);
  for (const g of ir.groups) {
    note(g.nodeId);
    for (const r of g.rules) note(r.nodeId);
  }
  return (kind) => {
    let n = (max.get(kind) ?? -1) + 1;
    let id = `${kind}#${n}`;
    while (used.has(id)) id = `${kind}#${++n}`;
    max.set(kind, n);
    used.add(id);
    return id;
  };
}

/** A source line between the neighbours of insert position `idx + 1`, or undefined. */
function lineBetween(seq: readonly SeqItem[], idx: number): number | undefined {
  let prev: number | undefined;
  for (let i = Math.min(idx, seq.length - 1); i >= 0; i--) {
    if (seq[i]!.own !== undefined) {
      prev = seq[i]!.own;
      break;
    }
  }
  let next: number | undefined;
  for (let i = idx + 1; i < seq.length; i++) {
    if (seq[i]!.own !== undefined) {
      next = seq[i]!.own;
      break;
    }
  }
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 0.5;
  if (next !== undefined) return next - 0.5;
  return undefined;
}

export function applyIRChanges(ir: KeyboardIR, changes: readonly IRChange[]): ApplyIRChangesResult {
  const mint = makeMinter(ir);
  const work: KeyboardIR = {
    ...ir,
    header: { ...ir.header },
    stores: [...ir.stores],
    groups: [...ir.groups],
    comments: [...ir.comments],
    raw: [...ir.raw],
  };
  const clonedGroups = new Set<string>();
  const inserted: string[] = [];
  const misses: number[] = [];

  /** The working copy of a group: cloned once, so the caller's IR is never mutated. */
  const groupIndex = (name: string): number => work.groups.findIndex((g) => g.name === name);
  const ownGroup = (idx: number): IRGroup => {
    const g = work.groups[idx]!;
    if (!clonedGroups.has(g.nodeId)) {
      const copy: IRGroup = { ...g, rules: [...g.rules] };
      work.groups[idx] = copy;
      clonedGroups.add(copy.nodeId);
      return copy;
    }
    return g;
  };

  const setAnchor = (c: IRComment, rule: IRRule | undefined): IRComment => {
    const copy: IRComment = { ...c };
    if (rule === undefined) delete copy.anchorRef;
    else copy.anchorRef = { kind: "rule", nodeId: rule.nodeId };
    return copy;
  };

  /** Re-point comments of `fromId` (all, or just `only`) at `rule`. */
  const reanchor = (fromId: string, rule: IRRule, only?: ReadonlySet<string>): void => {
    work.comments = work.comments.map((c) =>
      c.anchor === "leading" &&
      c.anchorRef?.nodeId === fromId &&
      (only === undefined || only.has(c.nodeId))
        ? setAnchor(c, rule)
        : c,
    );
  };

  const insertNode = (container: Container, at: ContentAnchor, node: IRNode): boolean => {
    const seq = sequenceOf(work, container);
    const idx = locate(seq, at);
    if (idx === undefined) return false;
    const useLine = work.raw.length > 0 || isFrag(node);
    const line = useLine ? lineBetween(seq, idx) : undefined;

    if (isRule(node)) {
      if (container.kind !== "group") return false;
      const gi = groupIndex(container.name);
      if (gi < 0) return false;
      const group = ownGroup(gi);
      const rule: IRRule = { ...node, nodeId: mint("rule"), authorEdit: "code-tab" };
      delete rule.sourceLine;
      if (line !== undefined) rule.sourceLine = line;
      const before = seq.slice(0, idx + 1).filter((s) => s.kind === "rule").length;
      const nextRule = seq.slice(idx + 1).find((s) => s.kind === "rule")?.node as IRRule | undefined;
      group.rules.splice(before, 0, rule);
      if (nextRule !== undefined) {
        // Leading comments directly before the insertion point now lead the new rule.
        const lead = new Set<string>();
        for (let i = idx; i >= 0 && seq[i]!.kind === "comment"; i--) {
          const c = seq[i]!.node as IRComment;
          if (c.anchorRef?.nodeId === nextRule.nodeId) lead.add(c.nodeId);
        }
        if (lead.size > 0) reanchor(nextRule.nodeId, rule, lead);
      }
      inserted.push(rule.nodeId);
      return true;
    }

    if (isFrag(node)) {
      const frag: RawKmnFragment = { ...node, nodeId: mint("raw") };
      delete frag.sourceLine;
      if (line !== undefined) frag.sourceLine = line;
      if (container.kind === "group") {
        const gi = groupIndex(container.name);
        if (gi < 0) return false;
        frag.groupNodeId = work.groups[gi]!.nodeId;
      } else {
        delete frag.groupNodeId;
      }
      work.raw.push(frag);
      inserted.push(frag.nodeId);
      return true;
    }

    // A comment.
    const base: IRComment = { ...node, nodeId: mint("comment") };
    delete base.sourceLine;
    if (container.kind === "raw") {
      const fresh: IRComment = { ...base, anchor: "freestanding" };
      delete fresh.anchorRef;
      const prev = seq[idx];
      const at2 = prev === undefined || prev.kind !== "comment" ? -1 : work.comments.indexOf(prev.node as IRComment);
      if (at2 >= 0) work.comments.splice(at2 + 1, 0, fresh);
      else {
        const first = work.comments.findIndex((c) => c.anchor === "freestanding" && c.anchorRef === undefined);
        if (first >= 0) work.comments.splice(first, 0, fresh);
        else work.comments.push(fresh);
      }
      inserted.push(fresh.nodeId);
      return true;
    }
    const nextRule = seq.slice(idx + 1).find((s) => s.kind === "rule")?.node as IRRule | undefined;
    if (nextRule === undefined) return false;
    const fresh = setAnchor({ ...base, anchor: "leading" }, nextRule);
    const prev = seq[idx];
    const mates = work.comments.filter((c) => c.anchor === "leading" && c.anchorRef?.nodeId === nextRule.nodeId);
    if (prev !== undefined && prev.kind === "comment" && mates.includes(prev.node as IRComment)) {
      work.comments.splice(work.comments.indexOf(prev.node as IRComment) + 1, 0, fresh);
    } else if (mates.length > 0) {
      work.comments.splice(work.comments.indexOf(mates[0]!), 0, fresh);
    } else work.comments.push(fresh);
    inserted.push(fresh.nodeId);
    return true;
  };

  const removeItem = (container: Container, item: SeqItem): void => {
    const id = item.node.nodeId;
    if (item.kind === "rule") {
      const gi = container.kind === "group" ? groupIndex(container.name) : -1;
      if (gi >= 0) {
        const group = ownGroup(gi);
        group.rules = group.rules.filter((r) => r.nodeId !== id);
      }
    } else if (item.kind === "frag") work.raw = work.raw.filter((f) => f.nodeId !== id);
    else work.comments = work.comments.filter((c) => c.nodeId !== id);
  };

  const apply = (c: IRChange): boolean => {
    switch (c.change) {
      case "insert":
        return insertNode(c.at.container, c.at, c.node);
      case "remove": {
        const seq = sequenceOf(work, c.at.container);
        const idx = locate(seq, c.at);
        if (idx === undefined || idx < 0) return false;
        removeItem(c.at.container, seq[idx]!);
        return true;
      }
      case "replace": {
        const container = c.at.container;
        const seq = sequenceOf(work, container);
        const idx = locate(seq, c.at);
        if (idx === undefined || idx < 0) return false;
        const old = seq[idx]!;
        if (old.kind === "rule" && isRule(c.node) && container.kind === "group") {
          const gi = groupIndex(container.name);
          if (gi < 0) return false;
          const group = ownGroup(gi);
          const at = group.rules.findIndex((r) => r.nodeId === old.node.nodeId);
          const rule: IRRule = { ...c.node, nodeId: mint("rule"), authorEdit: "code-tab" };
          delete rule.sourceLine;
          const oldLine = (old.node as IRRule).sourceLine;
          if (oldLine !== undefined) rule.sourceLine = oldLine;
          group.rules[at] = rule;
          reanchor(old.node.nodeId, rule);
          inserted.push(rule.nodeId);
          return true;
        }
        if (old.kind === "frag" && isFrag(c.node)) {
          const frag: RawKmnFragment = { ...c.node, nodeId: mint("raw") };
          const o = old.node as RawKmnFragment;
          delete frag.sourceLine;
          delete frag.groupNodeId;
          if (o.sourceLine !== undefined) frag.sourceLine = o.sourceLine;
          if (o.groupNodeId !== undefined) frag.groupNodeId = o.groupNodeId;
          work.raw = work.raw.map((f) => (f.nodeId === o.nodeId ? frag : f));
          inserted.push(frag.nodeId);
          return true;
        }
        if (old.kind === "comment" && !isRule(c.node) && !isFrag(c.node)) {
          const o = old.node as IRComment;
          const fresh: IRComment = { ...c.node, nodeId: mint("comment"), anchor: o.anchor };
          delete fresh.sourceLine;
          if (o.anchorRef !== undefined) fresh.anchorRef = o.anchorRef;
          else delete fresh.anchorRef;
          work.comments = work.comments.map((x) => (x.nodeId === o.nodeId ? fresh : x));
          inserted.push(fresh.nodeId);
          return true;
        }
        // The kind changed: insert the new node after the old one, then drop the old.
        if (!insertNode(container, { ...c.at, text: old.text }, c.node)) return false;
        removeItem(container, old);
        return true;
      }
      case "set-store": {
        const key = (s: { name: string; isSystem: boolean }): string => `${s.isSystem ? "&" : ""}${s.name}`.toLowerCase();
        const idx = work.stores.findIndex((s) => key(s) === key(c.value));
        if (c.previous !== undefined && idx < 0) return false;
        if (idx >= 0) {
          const old = work.stores[idx]!;
          const next: IRStore = { ...c.value, nodeId: old.nodeId };
          if (old.sourceLine !== undefined) next.sourceLine = old.sourceLine;
          work.stores[idx] = next;
          return true;
        }
        const store: IRStore = { ...c.value, nodeId: mint("store") };
        const afterIdx =
          c.after === undefined ? -1 : work.stores.findIndex((s) => s.name.toLowerCase() === c.after!.toLowerCase());
        if (afterIdx < 0 && c.after !== undefined) {
          work.stores.push(store);
        } else {
          if (work.raw.length > 0) {
            const seq: SeqItem[] = work.stores.map((s) => ({
              kind: "rule" as const,
              text: "",
              node: s as unknown as IRNode,
              own: s.sourceLine,
            }));
            const line = lineBetween(seq, afterIdx);
            if (line !== undefined) store.sourceLine = line;
          }
          work.stores.splice(afterIdx + 1, 0, store);
        }
        inserted.push(store.nodeId);
        return true;
      }
      case "remove-store": {
        const idx = work.stores.findIndex((s) => s.name.toLowerCase() === c.name.toLowerCase() && s.isSystem === c.previous.isSystem);
        if (idx < 0) return false;
        work.stores.splice(idx, 1);
        return true;
      }
      case "add-group": {
        if (groupIndex(c.group.name) >= 0) return false;
        const group: IRGroup = { ...c.group, nodeId: mint("group"), rules: [] };
        delete group.sourceLine;
        const afterIdx = c.after === undefined ? -1 : groupIndex(c.after);
        work.groups.splice(afterIdx + 1, 0, group);
        clonedGroups.add(group.nodeId);
        inserted.push(group.nodeId);
        return true;
      }
      case "remove-group": {
        const gi = groupIndex(c.previous.name);
        if (gi < 0) return false;
        work.groups.splice(gi, 1);
        return true;
      }
      case "set-begin":
        work.header.encoding = c.begin.encoding;
        work.header.entryPoints = { ...work.header.entryPoints, main: c.begin.main };
        return true;
      case "set-header":
        work.header = { ...work.header, ...c.header };
        return true;
    }
  };

  changes.forEach((c, i) => {
    if (!apply(c)) misses.push(i);
  });

  return { ir: work, effect: { groupNodeId: "", inserted, removed: [] }, misses };
}

/**
 * The emitted item sequence of a container (spec 113 US8, contracts/code-edits.md).
 *
 * Diff, apply, and owner lookup all work on the same view: the ordered list of
 * items a group (or the global fragment list) emits, each with its canonical
 * text. Canonical text ignores node ids, source lines, and the `authorEdit` /
 * `rulesStepAdded` markers (the emitter does), so two IRs that emit the same
 * text compare equal.
 */

import type {
  ContentAnchor,
  IRComment,
  IRGroup,
  IRNode,
  IRRule,
  KeyboardIR,
  RawKmnFragment,
} from "@keyboard-studio/contracts";
import { emitRule } from "../codec/emit.js";

export type Container = ContentAnchor["container"];

export interface SeqItem {
  kind: "rule" | "frag" | "comment";
  /** Canonical emitted text. */
  text: string;
  node: IRNode;
  /** The node's own source line, when it has one (rules and comments use their rule's). */
  own: number | undefined;
}

export function isRule(node: IRNode): node is IRRule {
  return "context" in node;
}
export function isFrag(node: IRNode): node is RawKmnFragment {
  return "sourceText" in node;
}

export function commentText(c: IRComment): string {
  return c.text ? `c ${c.text}` : "c";
}

/** Canonical text of one node inside a container. */
export function canonicalNodeText(node: IRNode, usingKeys: boolean): string {
  if (isRule(node)) return emitRule(node, usingKeys);
  if (isFrag(node)) return node.sourceText;
  return commentText(node);
}

export function kindOf(node: IRNode): SeqItem["kind"] {
  return isRule(node) ? "rule" : isFrag(node) ? "frag" : "comment";
}

export function findGroup(ir: KeyboardIR, name: string): IRGroup | undefined {
  return ir.groups.find((g) => g.name === name);
}

/** The items a container emits, in emitted order. A container that does not exist is empty. */
export function sequenceOf(ir: KeyboardIR, container: Container): SeqItem[] {
  if (container.kind === "raw") {
    const items: SeqItem[] = [];
    for (const c of ir.comments) {
      if (c.anchor === "freestanding" && c.anchorRef === undefined) {
        items.push({ kind: "comment", text: commentText(c), node: c, own: c.sourceLine });
      }
    }
    const globals = ir.raw
      .filter((f) => f.groupNodeId === undefined)
      .sort((a, b) => (a.sourceLine ?? 0) - (b.sourceLine ?? 0));
    for (const f of globals) items.push({ kind: "frag", text: f.sourceText, node: f, own: f.sourceLine });
    return items;
  }
  const group = findGroup(ir, container.name);
  if (group === undefined) return [];
  const leading = new Map<string, IRComment[]>();
  for (const c of ir.comments) {
    if (c.anchor === "leading" && c.anchorRef !== undefined) {
      const list = leading.get(c.anchorRef.nodeId) ?? [];
      list.push(c);
      leading.set(c.anchorRef.nodeId, list);
    }
  }
  // Mirror the emitter's ordering: an unsourced rule takes the line of the next sourced rule.
  const ruleLines: number[] = new Array<number>(group.rules.length);
  let nextLine = Number.MAX_SAFE_INTEGER;
  for (let i = group.rules.length - 1; i >= 0; i--) {
    const own = group.rules[i]!.sourceLine;
    if (own !== undefined) nextLine = own;
    ruleLines[i] = nextLine;
  }
  const keyed: Array<{ line: number; item: SeqItem }> = [];
  group.rules.forEach((rule, i) => {
    for (const c of leading.get(rule.nodeId) ?? []) {
      keyed.push({ line: ruleLines[i]!, item: { kind: "comment", text: commentText(c), node: c, own: rule.sourceLine } });
    }
    keyed.push({
      line: ruleLines[i]!,
      item: { kind: "rule", text: emitRule(rule, group.usingKeys), node: rule, own: rule.sourceLine },
    });
  });
  for (const f of ir.raw) {
    if (f.groupNodeId !== group.nodeId) continue;
    keyed.push({ line: f.sourceLine ?? Number.MAX_SAFE_INTEGER, item: { kind: "frag", text: f.sourceText, node: f, own: f.sourceLine } });
  }
  keyed.sort((a, b) => a.line - b.line);
  return keyed.map((k) => k.item);
}

/** Index of the item `at` names: -1 for the start, undefined when it is not found (or ambiguous). */
export function locate(seq: readonly SeqItem[], at: ContentAnchor): number | undefined {
  if (at.text === "") return -1;
  const candidates: number[] = [];
  seq.forEach((item, i) => {
    if (item.text === at.text) candidates.push(i);
  });
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  const score = (i: number): number => {
    const prev = seq[i - 1]?.text;
    const next = seq[i + 1]?.text;
    return (prev === at.prev ? 1 : 0) + (next === at.next ? 1 : 0);
  };
  const scored = candidates.map((i) => ({ i, s: score(i) }));
  const best = Math.max(...scored.map((c) => c.s));
  const top = scored.filter((c) => c.s === best);
  return top.length === 1 ? top[0]!.i : undefined;
}

/** The anchor naming item `i` of `seq` (the item itself, with its neighbours). */
export function anchorFor(container: Container, seq: readonly SeqItem[], i: number): ContentAnchor {
  const out: ContentAnchor = { container, text: seq[i]!.text };
  const prev = seq[i - 1]?.text;
  const next = seq[i + 1]?.text;
  if (prev !== undefined) out.prev = prev;
  if (next !== undefined) out.next = next;
  return out;
}

/** The anchor for inserting at position `p` (after item p-1; the start when p is 0). */
export function insertAnchorAt(container: Container, seq: readonly SeqItem[], p: number): ContentAnchor {
  if (p <= 0) {
    const out: ContentAnchor = { container, text: "" };
    const next = seq[0]?.text;
    if (next !== undefined) out.next = next;
    return out;
  }
  return anchorFor(container, seq, p - 1);
}

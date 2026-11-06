// carveViaSplice — text-splice carve projection (refs #391).
//
// Given the ORIGINAL .kmn source text (the pristine text a keyboard was
// parsed from), deletes only the exact physical-line spans of the nodes named
// in `deletedNodeIds`, leaving every surviving byte of the source untouched —
// comments, whitespace, store ordering, everything the IR->emit() round-trip
// is lossy on (see applyCarveToVfs.ts's header for the corpus-divergence
// background). "Surviving" is decided by resolveCarveCascade: a comment
// anchored to a deleted node is deleted WITH it (it would otherwise read as
// documentation of whatever line physically follows), while freestanding
// comments always survive.
//
// One caveat to "untouched": line terminators are normalized to LF for the
// whole file (split(/\r?\n/) + join("\n")) — the projection pipeline's
// existing LF-only invariant (see projectWorkingCopyVfs.flagParity.test.ts),
// not something this path preserves per-line.
//
// Precondition (enforced by the caller, applyCarveToVfs.ts, not here): the
// passed `startIr`'s node source positions must correspond exactly to
// `originalKmnText` — i.e. no other edit (store-slot content rewrite, a
// pre-filtered mutate-seam IR) has happened between parsing this text and
// calling this function. applyCarveToVfs.ts gates on `!opts.irRewritten` to
// guarantee this.
//
// Deletion granularity is LEAF-level, not a blanket range between two nodes:
// KMN syntax lets a `store(...)` declaration sit physically between two rules
// of the same group (the parser walks the file in one sequential pass
// tracking "current group" — store/group/rule lines can interleave). So
// deleting a whole group must remove ONLY its own header line plus each of
// its rules' own individual spans — never "everything from the header to the
// last rule" as one range, or a surviving store that happens to sit inside
// that range would be deleted along with it. resolveCarveCascade (shared with
// carveFilterIr) resolves the group->rules cascade into leaf rule ids so this
// function never has to reason about ranges spanning more than one node.
//
// Implementation: delete-only edits over spliceKmn (spec 111), after LF
// normalisation so Copy keeps its LF-only output. Open mode calls spliceKmn
// directly and keeps the original line endings.
//
// No cosmetic cleanup: a deleted node's lines are removed and nothing else —
// a stray blank line where a rule used to be is expected, not a defect.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { resolveCarveCascade } from "./carveCascade.js";
import { spliceKmn, type KmnEdit } from "./spliceKmn.js";

export type CarveViaSpliceResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * Splice `deletedNodeIds` out of `originalKmnText`, using `startIr`'s node
 * positions. See file header for the full contract.
 *
 * @param originalKmnText The exact text `startIr` was parsed from.
 * @param startIr          Source-of-truth IR (never mutated, read-only here).
 * @param deletedNodeIds  Set of whole-node nodeIds the author marked for deletion.
 */
export function carveViaSplice(
  originalKmnText: string,
  startIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
): CarveViaSpliceResult {
  const cascade = resolveCarveCascade(startIr, deletedNodeIds);

  const ids = [
    ...cascade.deletedGroupIds,
    ...cascade.deletedRuleIds,
    ...cascade.deletedStoreIds,
    ...cascade.deletedRawIds,
  ];
  const edits: KmnEdit[] = ids.map((nodeId) => ({ kind: "delete", nodeId }));

  // An inline comment shares its anchor rule's physical line, which that
  // rule's own delete already removes; a second edit on it would read as an
  // overlap, so only comments on lines no other deleted node covers are added.
  const coveredLines = new Set<number>();
  for (const g of startIr.groups) {
    if (cascade.deletedGroupIds.has(g.nodeId) && g.sourceLine !== undefined) coveredLines.add(g.sourceLine);
    for (const r of g.rules) {
      if (cascade.deletedRuleIds.has(r.nodeId) && r.sourceLine !== undefined) coveredLines.add(r.sourceLine);
    }
  }
  for (const s of startIr.stores) {
    if (cascade.deletedStoreIds.has(s.nodeId) && s.sourceLine !== undefined) coveredLines.add(s.sourceLine);
  }
  for (const f of startIr.raw) {
    if (cascade.deletedRawIds.has(f.nodeId) && f.sourceLine !== undefined) coveredLines.add(f.sourceLine);
  }
  for (const c of startIr.comments) {
    if (!cascade.deletedCommentIds.has(c.nodeId)) continue;
    if (c.sourceLine !== undefined && coveredLines.has(c.sourceLine)) continue;
    edits.push({ kind: "delete", nodeId: c.nodeId });
  }

  // spliceKmn indexes groups, rules, stores and raw fragments; present the
  // comments to it as span-only raw entries so their deletion resolves the
  // same way. Only the nodeId and sourceLine are read for a delete edit.
  const spliceIr = {
    ...startIr,
    raw: [
      ...startIr.raw,
      ...startIr.comments.map((c) => ({ nodeId: c.nodeId, sourceLine: c.sourceLine })),
    ],
  } as unknown as KeyboardIR;

  const lf = originalKmnText.replace(/\r\n/g, "\n");
  const result = spliceKmn(lf, spliceIr, edits);
  return result.ok ? { ok: true, text: result.text } : { ok: false, reason: result.reason };
}

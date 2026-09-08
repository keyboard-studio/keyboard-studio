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
// passed `baseIr`'s node source positions must correspond exactly to
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
// No cosmetic cleanup: a deleted node's lines are removed and nothing else —
// a stray blank line where a rule used to be is expected, not a defect.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { joinContinuations, type LogicalLine } from "../codec/continuation.js";
import { resolveCarveCascade } from "./carveCascade.js";

export type CarveViaSpliceResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/** Inclusive 1-based physical-line range, e.g. { start: 4, end: 4 } for a single-line node. */
interface LineSpan {
  start: number;
  end: number;
}

/**
 * Resolve a node's physical line span from its (possibly absent) `sourceLine`
 * against the source's logical-line map. `undefined` when the node has no
 * `sourceLine` (scaffolded/synthesized) or the line doesn't match any logical
 * line the current text actually has (should not happen for a text/IR pair
 * that truly correspond, but never assumed).
 */
function resolveSpan(
  logicalLinesByStart: ReadonlyMap<number, LogicalLine>,
  sourceLine: number | undefined,
): LineSpan | undefined {
  if (sourceLine === undefined) return undefined;
  const logicalLine = logicalLinesByStart.get(sourceLine);
  if (logicalLine === undefined) return undefined;
  return { start: logicalLine.line, end: logicalLine.line + logicalLine.segments.length - 1 };
}

/** The shape every spliceable IR node shares (group, rule, store, raw fragment, comment). */
interface SpanSource {
  readonly nodeId: string;
  readonly sourceLine?: number;
}

/**
 * Push the span of every `items` entry whose nodeId is in `deletedIds` onto
 * `spans`. Returns the failure reason for the first node whose span cannot be
 * resolved (the caller bails to the filter+emit fallback), or `undefined`
 * when every deleted node of this kind resolved.
 */
function collectSpans(
  kind: string,
  items: readonly SpanSource[],
  deletedIds: ReadonlySet<string>,
  logicalLinesByStart: ReadonlyMap<number, LogicalLine>,
  spans: LineSpan[],
): string | undefined {
  for (const item of items) {
    if (!deletedIds.has(item.nodeId)) continue;
    const span = resolveSpan(logicalLinesByStart, item.sourceLine);
    if (span === undefined) return `${kind} "${item.nodeId}" has no resolvable source span`;
    spans.push(span);
  }
  return undefined;
}

/**
 * Merge a list of (possibly overlapping/adjacent) line spans into disjoint,
 * sorted ranges. Distinct nodeIds should never legitimately overlap, but a
 * defensive merge keeps the deletion correct even if two spans happen to
 * touch.
 */
function mergeSpans(spans: LineSpan[]): LineSpan[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: LineSpan[] = [{ ...sorted[0]! }];
  for (const span of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (span.start <= last.end + 1) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * Splice `deletedNodeIds` out of `originalKmnText`, using `baseIr`'s node
 * positions. See file header for the full contract.
 *
 * @param originalKmnText The exact text `baseIr` was parsed from.
 * @param baseIr          Source-of-truth IR (never mutated, read-only here).
 * @param deletedNodeIds  Set of whole-node nodeIds the author marked for deletion.
 */
export function carveViaSplice(
  originalKmnText: string,
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
): CarveViaSpliceResult {
  const cascade = resolveCarveCascade(baseIr, deletedNodeIds);
  const logicalLines = joinContinuations(originalKmnText);
  const logicalLinesByStart = new Map<number, LogicalLine>(logicalLines.map((l) => [l.line, l]));

  const spans: LineSpan[] = [];

  // One pass per node kind. Deleting a group contributes only the group's OWN
  // header span here — its rules (and owned fragments) arrive through their
  // own cascaded id sets below, never as a header-to-last-rule range. A
  // deleted comment's span may coincide with its anchor rule's line, already
  // collected; the defensive mergeSpans below absorbs the overlap.
  const passes: ReadonlyArray<readonly [kind: string, items: readonly SpanSource[], deletedIds: ReadonlySet<string>]> = [
    ["group", baseIr.groups, cascade.deletedGroupIds],
    ["rule", baseIr.groups.flatMap((g) => g.rules), cascade.deletedRuleIds],
    ["store", baseIr.stores, cascade.deletedStoreIds],
    ["raw fragment", baseIr.raw, cascade.deletedRawIds],
    ["comment", baseIr.comments, cascade.deletedCommentIds],
  ];
  for (const [kind, items, deletedIds] of passes) {
    const failure = collectSpans(kind, items, deletedIds, logicalLinesByStart, spans);
    if (failure !== undefined) return { ok: false, reason: failure };
  }

  const merged = mergeSpans(spans);
  const physicalLines = originalKmnText.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < physicalLines.length; i++) {
    const physicalLineNumber = i + 1; // 1-based, matches LogicalLine.line
    const isDeleted = merged.some((s) => physicalLineNumber >= s.start && physicalLineNumber <= s.end);
    if (!isDeleted) kept.push(physicalLines[i]!);
  }

  return { ok: true, text: kept.join("\n") };
}

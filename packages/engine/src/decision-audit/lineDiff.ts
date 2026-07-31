// lineDiff — LCS line diff over `.kmn` text, emitting unified hunks.
//
// Engine-local on purpose (specs/053-decision-audit research D-06). No package
// in this repo depends on a diff library, and the persisted decision record's
// shape would otherwise be tied to a third-party formatter's patch text. The
// input is line-structured `.kmn`; the output need is a compact, reviewable hunk
// list for the trail and the packaged sidecar.
//
// DETERMINISM IS A CONTRACT, not a nicety: the record is compared across builds
// and re-applied in the SC-005 agreement test, so the same pair of texts must
// always produce byte-identical hunks. Two things secure that — the backtrack
// tie-break below is fixed (deletions before insertions), and the oversized-input
// fallback is a single whole-file replace rather than anything input-dependent.
//
// @see specs/053-decision-audit/contracts/decision-record.contract.md §2, §6

import { DECISION_DIFF_CONTEXT_LINES, type DiffHunk } from "@keyboard-studio/contracts";

/**
 * Ceiling on the LCS table, in cells.
 *
 * A step-boundary diff is normally a handful of changed lines inside an
 * otherwise-identical file, and the prefix/suffix trim below reduces it to
 * exactly that — so this only bites on a genuinely wholesale rewrite (a Track-2
 * re-instantiation, say). Rather than allocate a table proportional to two whole
 * keyboards, such a pair degrades to one replace-everything hunk, which is the
 * honest summary of "this bears no line-level relation to what came before".
 *
 * 4M cells is ~16 MB as a Uint32Array — the largest allocation worth making on
 * a UI thread for an audit read.
 */
const MAX_LCS_CELLS = 4_000_000;

/** One step of the edit script, with the line indices it occupies on each side. */
interface EditOp {
  kind: "equal" | "delete" | "insert";
  text: string;
}

/**
 * Split into lines for diffing.
 *
 * `\r\n` and `\n` both terminate a line and the `\r` is dropped, so a keyboard
 * whose `.kmn` uses CRLF does not diff as "every line changed" against one that
 * does not. That normalisation is diff-local: the emitted `.kmn` itself is
 * untouched, and the hunk text is what the author sees, not what ships.
 */
function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * Build the edit script for `a` → `b` by classic LCS with a fixed tie-break.
 *
 * Callers pass already-trimmed cores; the common prefix/suffix are re-attached
 * as `equal` ops by {@link diffLines}.
 */
function editScript(a: readonly string[], b: readonly string[]): EditOp[] {
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return b.map((text) => ({ kind: "insert" as const, text }));
  if (m === 0) return a.map((text) => ({ kind: "delete" as const, text }));

  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) {
    // Oversized: one wholesale replacement. Deletions first, matching the
    // tie-break the LCS path uses, so the two code paths agree on ordering.
    return [
      ...a.map((text) => ({ kind: "delete" as const, text })),
      ...b.map((text) => ({ kind: "insert" as const, text })),
    ];
  }

  // dp[i][j] = LCS length of a[i..] and b[j..], flattened row-major over (m + 1).
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + (j + 1)]! + 1
          : Math.max(dp[(i + 1) * width + j]!, dp[i * width + (j + 1)]!);
    }
  }

  const ops: EditOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "equal", text: a[i]! });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j]! >= dp[i * width + (j + 1)]!) {
      // Fixed tie-break: on an equal-length choice, delete before inserting.
      // Arbitrary but STABLE, which is the property the record depends on.
      ops.push({ kind: "delete", text: a[i]! });
      i++;
    } else {
      ops.push({ kind: "insert", text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ kind: "delete", text: a[i++]! });
  while (j < m) ops.push({ kind: "insert", text: b[j++]! });
  return ops;
}

/**
 * Unified line diff over two `.kmn` texts.
 *
 * Returns an empty array for identical input — "no hunks" is how a decision that
 * changed nothing is represented, and the caller turns that into
 * `DecisionImpact { state: "none" }` rather than an empty `"captured"`.
 *
 * @param before       text at the previous step boundary
 * @param after        text at this step boundary
 * @param contextLines unchanged lines kept either side of each change
 */
export function diffLines(
  before: string,
  after: string,
  contextLines: number = DECISION_DIFF_CONTEXT_LINES,
): readonly DiffHunk[] {
  if (before === after) return [];

  const a = splitLines(before);
  const b = splitLines(after);

  // Trim the common prefix/suffix before running LCS. For a step-boundary diff
  // this is the whole optimisation: it turns "two 2000-line files" into "the
  // dozen lines that actually differ", which is both fast and the reason
  // MAX_LCS_CELLS almost never bites.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const core = editScript(a.slice(prefix, a.length - suffix), b.slice(prefix, b.length - suffix));

  const ops: EditOp[] = [
    ...a.slice(0, prefix).map((text) => ({ kind: "equal" as const, text })),
    ...core,
    ...a.slice(a.length - suffix).map((text) => ({ kind: "equal" as const, text })),
  ];

  return groupIntoHunks(ops, Math.max(0, contextLines));
}

/**
 * Turn a flat edit script into unified hunks with `contextLines` of context,
 * coalescing changes whose context windows touch.
 */
function groupIntoHunks(ops: readonly EditOp[], contextLines: number): readonly DiffHunk[] {
  // Running 0-based line index on each side, per op position. Needed both to
  // number the hunks and to apply the `oldLines === 0` unified-diff convention.
  const oldBefore: number[] = [];
  const newBefore: number[] = [];
  let oldCount = 0;
  let newCount = 0;
  for (const op of ops) {
    oldBefore.push(oldCount);
    newBefore.push(newCount);
    if (op.kind !== "insert") oldCount++;
    if (op.kind !== "delete") newCount++;
  }

  const changedAt: number[] = [];
  ops.forEach((op, idx) => {
    if (op.kind !== "equal") changedAt.push(idx);
  });
  if (changedAt.length === 0) return [];

  // Context windows, merged when they touch or abut. Abutting windows are merged
  // (`<= end + 1`) so two changes a context-width apart read as one hunk rather
  // than two that share their context lines.
  const ranges: Array<{ start: number; end: number }> = [];
  for (const idx of changedAt) {
    const start = Math.max(0, idx - contextLines);
    const end = Math.min(ops.length - 1, idx + contextLines);
    const last = ranges[ranges.length - 1];
    if (last !== undefined && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ start, end });
    }
  }

  return ranges.map(({ start, end }) => {
    const slice = ops.slice(start, end + 1);
    let oldLines = 0;
    let newLines = 0;
    const lines: string[] = [];
    for (const op of slice) {
      if (op.kind !== "insert") oldLines++;
      if (op.kind !== "delete") newLines++;
      lines.push((op.kind === "equal" ? " " : op.kind === "delete" ? "-" : "+") + op.text);
    }
    const oldSkipped = oldBefore[start]!;
    const newSkipped = newBefore[start]!;
    return {
      // Unified-diff convention: 1-based start, except that a side contributing
      // no lines reports the line it follows (which is `oldSkipped` itself).
      oldStart: oldLines > 0 ? oldSkipped + 1 : oldSkipped,
      oldLines,
      newStart: newLines > 0 ? newSkipped + 1 : newSkipped,
      newLines,
      lines,
    };
  });
}

/** Added/removed line counts across a hunk list — the `magnitude` of an impact. */
export function diffMagnitude(hunks: readonly DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) added++;
      else if (line.startsWith("-")) removed++;
    }
  }
  return { added, removed };
}

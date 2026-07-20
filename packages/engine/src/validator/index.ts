import type { LintFinding } from "@keyboard-studio/contracts";
import {
  joinContinuations,
  type ContinuationSegment,
} from "../codec/continuation.js";
import { checkIdentifiers } from "./checks/identifiers.js";
import { checkDuplicateGroups } from "./checks/duplicateGroups.js";
import { checkDuplicateStores } from "./checks/duplicateStores.js";
import { checkDeprecatedStores } from "./checks/deprecatedStores.js";
import { checkCodepointFormat } from "./checks/codepointFormat.js";
import { checkDeadkeyResolution } from "./checks/deadkeyResolution.js";
import { checkIfStoreResolution } from "./checks/ifStoreResolution.js";
import { checkContextOrdering } from "./checks/contextOrdering.js";
import { checkIndexBounds } from "./checks/indexBounds.js";

// Group taxonomy authority (mirrors the §10 group definitions in types.ts).
// `lexical`   = stateless token-level checks: #1-#4 + #7 (codepoint format).
// `reference` = symbol-table integrity (TS half): #5/#6/#8/#9.
// oracle.ts consumes these two helpers so the group->check mapping lives in
// exactly one place and runAllChecks never drifts from the oracle's grouping.

/**
 * Every TS-portable check scans its input line by line and never joins
 * `\`-terminated continuation lines (the shared join lives in
 * ../codec/continuation.ts, kmcmplib does honor it). Left unjoined, a rule
 * split across a continuation is mis-analyzed: contextOrdering can miss the
 * `+`/`>` separators entirely, and other checks misattribute or drop
 * findings. Rather than teach every check file about continuations, we join
 * once here and remap each finding's logical (line, column) back to the
 * physical position the user actually sees — the checks themselves run
 * unchanged against the joined source.
 */
function runJoined(
  source: string,
  checks: ReadonlyArray<(source: string) => LintFinding[]>,
): LintFinding[] {
  const logicalLines = joinContinuations(source);
  const joinedSource = logicalLines.map((l) => l.text).join("\n");
  const lineSegments = logicalLines.map((l) => l.segments);

  const findings = checks.flatMap((check) => check(joinedSource));
  return remapFindings(findings, lineSegments);
}

/**
 * Translate each finding's logical (line, column) — as reported against the
 * continuation-joined source — back to the physical (line, column) in the
 * original source.
 *
 * For a finding at logical line `L` (1-based) and column `C` (1-based, may
 * be absent), find the segment of logical line `L` whose `logicalStart` is
 * the last one at-or-before offset `C - 1`; that segment identifies which
 * physical line the finding actually came from:
 *   physicalLine   = segment.physicalLine + 1
 *   physicalColumn = (C - 1 - segment.logicalStart) + segment.leadingTrim + 1
 * A finding with no column maps to offset 0 (the start of the logical line),
 * i.e. the first segment.
 */
function remapFindings(
  findings: LintFinding[],
  lineSegments: ReadonlyArray<ReadonlyArray<ContinuationSegment>>,
): LintFinding[] {
  return findings.map((finding) => {
    const loc = finding.location;
    if (loc === undefined) return finding;

    const segments = lineSegments[loc.line - 1];
    if (segments === undefined || segments.length === 0) return finding;

    // Defensive fallback: every current TS-portable check always sets
    // `location.column` (see the individual check files under ./checks/),
    // so this branch is not reachable through any real finding today. It is
    // kept because `location.column` is optional on the shared LintFinding
    // contract (@keyboard-studio/contracts) — a column-less finding maps to
    // offset 0 (the start of the logical line), i.e. the first segment.
    const offset = loc.column !== undefined ? loc.column - 1 : 0;
    let segment = segments[0]!;
    for (const seg of segments) {
      if (seg.logicalStart <= offset) segment = seg;
      else break;
    }

    // Single-segment logical lines (the overwhelming common case — no
    // continuation involved) always resolve to the same physical line/column,
    // so this is a no-op remap for un-continued source.
    //
    // `endLine`/`endColumn` (SourceLocation, @keyboard-studio/contracts) are
    // passed through via `...loc` UNremapped. No current check emits a
    // range (they all emit a single line/column point — see ./checks/), so
    // there is nothing to remap yet. If a range-emitting check is ever
    // added, `endLine`/`endColumn` MUST be remapped the same way as
    // `line`/`column` above (a segment lookup keyed on the end offset,
    // which may land in a different segment than the start offset for a
    // range spanning a continuation join) — don't ship a range-emitting
    // check without updating this function.
    return {
      ...finding,
      location: {
        ...loc,
        line: segment.physicalLine + 1,
        ...(loc.column !== undefined
          ? { column: offset - segment.logicalStart + segment.leadingTrim + 1 }
          : {}),
      },
    };
  });
}

// Callers are responsible for setting location.file on each returned finding;
// individual checks always emit file: "" because they operate on raw source strings.
export function runLexicalChecks(source: string): LintFinding[] {
  return runJoined(source, [
    checkIdentifiers,
    checkDuplicateGroups,
    checkDuplicateStores,
    checkDeprecatedStores,
    checkCodepointFormat,
  ]);
}

export function runReferenceChecks(source: string): LintFinding[] {
  return runJoined(source, [
    checkDeadkeyResolution,
    checkIfStoreResolution,
    checkContextOrdering,
    checkIndexBounds,
  ]);
}

export function runAllChecks(source: string): LintFinding[] {
  return [...runLexicalChecks(source), ...runReferenceChecks(source)];
}

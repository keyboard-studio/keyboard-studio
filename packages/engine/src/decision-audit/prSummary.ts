// prSummary — the bounded markdown decision block for the pull-request body
// (specs/053-decision-audit FR-018, FR-022).
//
// Mirrors buildImportAttributionBlock in ../output/import-attribution.ts: a pure
// function returning markdown, English and unlocalized. That is deliberate and
// is the established precedent for engine-built PR blocks — the audience is a
// reviewer reading a pull request on github.com, not the author in their own
// locale. The author-facing rendering of the same record is composed in the
// studio from message catalogues (FR-016); this is the other half of that split,
// not a duplicate of it.
//
// Two editorial choices are load-bearing for SC-004 ("a reviewer with no access
// to the studio can identify which decisions produced a given characteristic"):
//
//   1. Every row pairs a decision with its CONSEQUENCE. A list of decisions with
//      no effects column would be a transcript, not evidence, and a reviewer
//      could not work backwards from a characteristic of the keyboard.
//
//   2. Superseded decisions are summarised as a count, not listed. A decision
//      that was later revised did not produce anything in the keyboard being
//      reviewed, so listing it competes for the entry budget with decisions that
//      did. The complete history stays in the packaged record, and the block
//      says so rather than letting the omission be silent.
//
// @see specs/053-decision-audit/contracts/decision-record.contract.md §2, §6

import type {
  DecisionEntry,
  DecisionImpact,
  DecisionRecord,
  EditorActionSummary,
  EditorActionType,
} from "@keyboard-studio/contracts";
import { DECISION_RECORD_VFS_PATH } from "./sidecar.js";

/** Contract §6: the description stays readable, so the block is bounded. */
export const PR_SUMMARY_MAX_ENTRIES = 25 as const;

export interface DecisionSummaryOptions {
  /** Rows to render before pointing at the packaged record. Default 25. */
  maxEntries?: number;
}

// ---------------------------------------------------------------------------
// Cell formatting
// ---------------------------------------------------------------------------

/**
 * Make a value safe to put in a markdown table cell.
 *
 * A recorded answer is author-supplied text and can contain a `|`, which would
 * silently split the row into extra columns, or a newline, which would end the
 * row entirely. Escaping here rather than at each call site means a new column
 * cannot reintroduce the hole.
 */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatValue(value: string | readonly string[] | boolean): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value === "" ? "(blank)" : value;
  return value.length === 0 ? "(none)" : value.join(" ");
}

const EDITOR_LABEL: Record<EditorActionType, string> = {
  gallery_edit: "Edited the character gallery",
  mechanism_edit: "Assigned key mechanisms",
  touch_edit: "Edited the touch layout",
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * One count's clause, or `undefined` when it contributes nothing to the
 * sentence.
 *
 * `count === undefined` (not measured) and `count === 0` (measured, unchanged)
 * both produce no clause here, but for different reasons — neither is coerced
 * into the other. `undefined > 0` would be `false` in JS and silently treat
 * "not measured" the same as "measured zero", which is exactly the
 * lumping-together FR-005a forbids, so both are checked explicitly instead of
 * relying on the numeric comparison alone.
 */
function formatCount(count: number | undefined, one: string, many: string): string | undefined {
  if (count === undefined) return undefined;
  if (count === 0) return undefined;
  return plural(count, one, many);
}

/**
 * Describe an editor step by its non-zero, measured counts.
 *
 * Counts only — a step that removed three hundred keys says so in one clause
 * rather than listing them (contract §6). Zero-valued categories are dropped so
 * a gallery edit does not report "0 touch keys affected" as though touch had
 * been considered and left alone. An unmeasured category is dropped the same
 * way (never reported as a number), so "no net change" also covers "nothing
 * measured" rather than misstating either as the other.
 */
function formatEditorSummary(summary: EditorActionSummary): string {
  const parts = [
    formatCount(summary.keysRemoved, "key removed", "keys removed"),
    formatCount(summary.keysAdded, "key added", "keys added"),
    formatCount(summary.mechanismsAssigned, "mechanism assigned", "mechanisms assigned"),
    formatCount(summary.touchKeysAffected, "touch key affected", "touch keys affected"),
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? "no net change" : parts.join(", ");
}

/** The decision itself, as one English clause. */
function formatDecision(entry: DecisionEntry): string {
  const { payload, provenance } = entry;

  if (payload.kind === "editor-action") {
    return `${EDITOR_LABEL[payload.actionType]} (${formatEditorSummary(payload.summary)})`;
  }

  if (payload.kind === "base-contribution") {
    // No producer writes this payload yet — recordBaseContribution.ts
    // (specs/055-legible-decision-trail D-11) is a separate, not-yet-landed
    // task. This clause only has to describe the shape truthfully once one
    // does; it is not the final wording for that surface.
    return `Started from base \`${payload.baseId}\` ("${payload.baseDisplayName}")`;
  }

  const value = `"${formatValue(payload.value)}"`;
  const question = `\`${payload.questionId}\``;

  switch (provenance.agency) {
    case "tool-proposed":
      // A proposal always has a source in practice; the type allows it to be
      // absent, and the sentence must still be true if it is.
      return provenance.source === undefined
        ? `Accepted suggested ${value} for ${question}`
        : `Accepted suggested ${value} for ${question} (from ${provenance.source})`;
    case "base-derived":
      return `Kept ${value} for ${question} (from the base keyboard)`;
    case "hand-set":
      return `Chose ${value} for ${question}`;
    default: {
      const _exhaustive: never = provenance.agency;
      return `Set ${value} for ${question} (${String(_exhaustive)})`;
    }
  }
}

/**
 * The consequence, as one English clause.
 *
 * Every state is a positive statement. "no source change" is a finding, not an
 * absence — rendering it as a blank cell would read as a gap in the audit rather
 * than as the decision genuinely having changed nothing (FR-011's reasoning,
 * carried into the reviewer-facing surface).
 */
function formatEffect(impact: DecisionImpact | null | undefined): string {
  if (impact === undefined) return "not captured";
  if (impact === null) return "omitted to keep the record within size limits";

  switch (impact.state) {
    case "captured": {
      // `files` is non-empty (contract §3). Every changed file is identified
      // (FR-017) — a decision widened to several files (specs/055-legible-decision-trail
      // T027) no longer collapses to one path, but the block stays one row per
      // decision, so all files still live in this single effect cell.
      const base =
        impact.files.length === 1
          ? `+${impact.magnitude.added} / -${impact.magnitude.removed} lines in \`${impact.files[0]!.path}\``
          : `+${impact.magnitude.added} / -${impact.magnitude.removed} lines across ${impact.files.length} files: ${impact.files
              .map((file) => `\`${file.path}\` (+${file.magnitude.added} / -${file.magnitude.removed})`)
              .join(", ")}`;

      // FR-019: a change one stage produced for several decisions is claimed
      // jointly, never as though this entry were solely responsible. Absent
      // `sharedWith`, the entry claims the change outright — today's wording,
      // unchanged.
      if (impact.sharedWith === undefined || impact.sharedWith.length === 0) return base;
      const coDecisions = impact.sharedWith.map((entryId) => `\`${entryId}\``).join(", ");
      return `${base} (shared with ${plural(impact.sharedWith.length, "decision", "decisions")}: ${coDecisions})`;
    }
    case "none":
      return "no source change";
    case "unavailable":
      return impact.reason === "lock-gate-dependency"
        ? "not tracked separately (part of a combined change confirmed together)"
        : "not tracked separately (no way to isolate its exact change)";
    default: {
      const _exhaustive: never = impact;
      return String(_exhaustive);
    }
  }
}

// ---------------------------------------------------------------------------
// Block assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the markdown "Authoring decisions" block for the pull-request body.
 *
 * Generated from the record as it stands at submission time — not maintained
 * incrementally — so it cannot drift from what shipped.
 *
 * Pure function: no I/O, safe to unit-test without network mocks.
 */
export function buildDecisionSummaryBlock(
  record: DecisionRecord,
  opts: DecisionSummaryOptions = {},
): string {
  const maxEntries = opts.maxEntries ?? PR_SUMMARY_MAX_ENTRIES;
  const lines: string[] = ["## Authoring decisions"];

  // An entry is superseded when a LATER entry names it. Collected up front so
  // the effective set is one pass rather than a scan per row.
  const supersededIds = new Set<string>();
  for (const entry of record.entries) {
    if (entry.supersedes !== null) supersededIds.add(entry.supersedes);
  }
  const effective = record.entries.filter((e) => !supersededIds.has(e.entryId));

  if (effective.length === 0) {
    lines.push("", "No decisions were recorded for this keyboard.");
    return lines.join("\n");
  }

  const shown = effective.slice(0, Math.max(0, maxEntries));
  lines.push(
    "",
    `${plural(effective.length, "decision", "decisions")} shaped this keyboard, in the order they were made.`,
    "",
    "| # | Step | Decision | Effect on source |",
    "|---|---|---|---|",
  );

  shown.forEach((entry, index) => {
    lines.push(
      `| ${index + 1} | \`${cell(entry.stepId)}\` | ${cell(formatDecision(entry))} | ${cell(formatEffect(entry.impact))} |`,
    );
  });

  // Every bound states itself when it bites (contract §6) — an omission a
  // reviewer cannot see is the failure mode these three notes exist to prevent.
  const notes: string[] = [];
  if (effective.length > shown.length) {
    notes.push(
      `Showing the first ${shown.length} of ${effective.length} decisions. The author's package includes the complete detail in \`${DECISION_RECORD_VFS_PATH}\` and can supply it on request.`,
    );
  }
  const revisedCount = record.entries.length - effective.length;
  if (revisedCount > 0) {
    notes.push(
      `${plural(revisedCount, "earlier decision was", "earlier decisions were")} later revised; the full history is in the author's \`${DECISION_RECORD_VFS_PATH}\`.`,
    );
  }
  if (record.truncated !== null) {
    notes.push(
      `Change detail for ${plural(record.truncated.shedCount, "decision", "decisions")} was omitted to keep the author's record within size limits.`,
    );
  }

  if (notes.length > 0) lines.push("", ...notes);

  return lines.join("\n");
}

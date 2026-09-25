// renderHistoryMd — turn a stored HISTORY proposal decision into the shipped
// HISTORY.md text for either authoring track (spec 080 FR-010–FR-012,
// research R6/R12).
//
// Pure: no VFS, no Date usage. A confirmed/edited entry's own
// `proposal.dateIso` — injected once, at proposal or confirmation time — wins
// over `opts.dateIso` so the heading date does not re-stamp across
// productions of an unchanged keyboard (R12 determinism); `opts.dateIso` is
// the fallback used only when there is no entry to read a date from.
//
// The dismissed/null stub shapes are reproduced here rather than imported,
// because neither existing producer is a projection-safe pure function:
// `generateStubs` (packages/engine/src/scaffolder/index.ts) mutates a VFS and
// derives its own date from a `Date`-like `emitYear`, and `stageAdaptHistory`
// (packages/engine/src/output/adapt-staging.ts) is VFS-mutating and
// output-only. Both must stay byte-identical to what this module renders —
// keep the three in sync if the ATX heading convention ever changes.
//
// New entries always use ATX (`## <version> (<date>)`) — the tool's own
// generator convention. Inherited bases may use setext/hyphen-underline
// headings (criteria.md §3.5 / corpus); those are preserved verbatim below
// the new entry. A leading title / "Change History" preamble is kept *above*
// the new entry so we don't bury `# … Change History` under the adapt line.
//
// `buildHistoryProposal` (../decision-audit/historyProposal.ts) is the
// separate seam that builds the proposal an author is shown; this module
// only renders a stored decision (or its absence) into file text.

import type { HistoryEntryState } from "@keyboard-studio/contracts";

/** Track 1's unedited-stub bullet — unchanged since the scaffolder's stub. */
export const HISTORY_INITIAL_RELEASE_BULLET = "Initial release.";

/** The "Adapted from" attribution bullet's exact text (criterion 19.2 / FR-012). */
export function adaptedFromBullet(id: string, version: string): string {
  return `Adapted from ${id} v${version} via keyboard-studio.`;
}

function heading(version: string, dateIso: string): string {
  return `## ${version} (${dateIso})`;
}

/** One entry's text: heading line, then one `* ` bullet line per bullet. */
function renderEntry(version: string, dateIso: string, bullets: readonly string[]): string {
  return `${heading(version, dateIso)}\n${bullets.map((b) => `* ${b}\n`).join("")}`;
}

/**
 * Find the line index of the first HISTORY entry heading in `lines`.
 * Mirrors keyboard-lint's docs parser: ATX `## …` or setext
 * (`<version> (<date>)` + `---` underline). Kept local because keyboard-lint
 * cannot be imported from the engine (`lint-not-to-engine` is the reverse
 * dep; this is the producer side of the same fact).
 */
function firstHistoryEntryLineIndex(lines: readonly string[]): number {
  const setextUnderline = /^-{3,}\s*$/;
  const entryHeading = /^(\S+)\s+\(([^)]*)\)\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^##\s+/.test(line)) return i;
    const trimmed = line.trim();
    if (
      trimmed !== "" &&
      entryHeading.test(trimmed) &&
      i + 1 < lines.length &&
      setextUnderline.test(lines[i + 1] ?? "")
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Split a base HISTORY.md into the leading preamble (title block before the
 * first entry) and the remainder starting at that entry. Empty/`null` base →
 * empty halves.
 */
export function splitHistoryPreamble(text: string): { preamble: string; rest: string } {
  if (text === "") return { preamble: "", rest: "" };
  const nl = text.includes("\r\n") ? "\r\n" : text.includes("\r") ? "\r" : "\n";
  const lines = text.split(/\r\n|\r|\n/);
  const first = firstHistoryEntryLineIndex(lines);
  if (first <= 0) {
    // No entry, or entry starts at line 0 — nothing to keep above the new entry.
    return first === 0 ? { preamble: "", rest: text } : { preamble: text, rest: "" };
  }
  return {
    preamble: lines.slice(0, first).join(nl),
    rest: lines.slice(first).join(nl),
  };
}

/**
 * Place `entryText` into a base HISTORY.md: after any leading preamble, above
 * the base's own entries (criterion 3.4 cumulative; title stays on top).
 * Separators are exactly one blank line between blocks.
 */
function withBaseText(entryText: string, baseHistoryText: string | null): string {
  if (baseHistoryText === null || baseHistoryText === "") return entryText;

  const { preamble, rest } = splitHistoryPreamble(baseHistoryText);
  const entry = entryText.endsWith("\n") ? entryText : `${entryText}\n`;

  if (preamble === "" && rest === "") {
    return entry;
  }
  if (preamble === "") {
    // No title — new entry on top, base entries below (legacy behaviour).
    return `${entry}\n${rest === "" ? baseHistoryText : rest}`;
  }

  const preambleBlock = preamble.endsWith("\n") ? preamble : `${preamble}\n`;
  if (rest === "") {
    return `${preambleBlock}\n${entry}`;
  }
  return `${preambleBlock}\n${entry}\n${rest}`;
}

export interface RenderHistoryMdOptions {
  /** Heading version; re-derived from here even when an entry is stored (spec edge case: version change). */
  version: string;
  /** Fallback heading date, used only when there is no entry to read `proposal.dateIso` from. */
  dateIso: string;
  /** Set when this production is a Track 2 adaptation; drives the injected attribution bullet. */
  adaptedFrom: { id: string; version: string } | null;
  /** The base's own HISTORY.md text (Track 2), preserved below the new entry (after any preamble). `null` when there is none. */
  baseHistoryText: string | null;
}

/**
 * The complete HISTORY.md text for either authoring track (the T044
 * projection seam).
 *
 * - `entry` is `null`, `"proposed"` (shown but not yet decided), or
 *   `"dismissed"`: the existing stub, unchanged — Track 1's bare
 *   "Initial release." entry, or Track 2's "Adapted from" entry (today's
 *   `stageAdaptHistory` shape) followed by the base text. Nothing the author
 *   has not confirmed or edited ships (FR-011).
 * - `entry` is `"confirmed"` or `"edited"`: the confirmed/edited bullets
 *   render at the top (edited bullets win over the original proposal
 *   bullets) under a heading using `opts.version` (re-derived on a version
 *   change) paired with the entry's own stored `proposal.dateIso` (R12); the
 *   "Adapted from" bullet is injected first whenever `opts.adaptedFrom` is
 *   set, unless the bullets already contain it verbatim (FR-012 / criterion
 *   19.2, no duplication); the base text is preserved below
 *   (criterion 3.4), with any leading title kept above the new entry.
 */
export function renderHistoryMd(
  entry: HistoryEntryState | null,
  opts: RenderHistoryMdOptions,
): string {
  const { version, dateIso, adaptedFrom, baseHistoryText } = opts;
  const decided = entry !== null && (entry.status === "confirmed" || entry.status === "edited");

  if (!decided) {
    const bullets =
      adaptedFrom !== null
        ? [adaptedFromBullet(adaptedFrom.id, adaptedFrom.version)]
        : [HISTORY_INITIAL_RELEASE_BULLET];
    return withBaseText(renderEntry(version, dateIso, bullets), baseHistoryText);
  }

  const authoredBullets = entry.editedBullets ?? entry.proposal.bullets;
  const attribution = adaptedFrom !== null ? adaptedFromBullet(adaptedFrom.id, adaptedFrom.version) : null;
  const bullets =
    attribution !== null && !authoredBullets.includes(attribution)
      ? [attribution, ...authoredBullets]
      : authoredBullets;

  return withBaseText(renderEntry(version, entry.proposal.dateIso, bullets), baseHistoryText);
}

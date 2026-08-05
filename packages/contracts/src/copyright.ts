// Copyright block parsing and license rendering (spec 037).
//
// The license BODY is a constant: all 920 release/ LICENSE.md files in
// keymanapp/keyboards are MIT, and after stripping copyright lines there are
// exactly two distinct bodies — differing only by a UTF-8 BOM. So the only part
// that varies between keyboards is the copyright block, and that is what these
// functions model.
//
// Both functions are PURE: no I/O, no clock, no randomness. The emit year is
// passed IN (see renderLicense), never read from Date here — otherwise the
// round-trip test would be time-dependent and unrunnable at a year boundary.
//
// Contract: specs/037-keyboard-attribution/contracts/copyright.md (P1..P9)
// Fixtures: fixtures/copyrightLines.ts — harvested from the real corpus (FR-014)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Marker form as found in the source. All three occur in the corpus. */
export type CopyrightMarker = "©" | "(c)" | "(C)";

/**
 * A single copyright holder as recorded in one LICENSE.md line.
 *
 * `name` is VERBATIM. It is never normalised, re-cased, or internally
 * re-spaced: "SIL International" and "SIL Global" are distinct holders, both
 * currently shipping (280 and 152 keyboards) during an in-progress rename.
 * Rewriting one to the other would modify a legal notice.
 */
export interface CopyrightHolder {
  /** Holder text exactly as it appeared. */
  name: string;
  /** Years attributed to this holder, ascending and deduped. MAY be empty. */
  years: number[];
  /** Marker style as found. */
  marker: CopyrightMarker;
  /** True when inherited from a base rather than added by the current session. */
  inherited: boolean;
  /**
   * The VERBATIM source line, retained for holders read out of an existing file
   * so FR-007 ("carry inherited lines verbatim") is satisfied by re-emitting the
   * original rather than reconstructing it.
   *
   * Reconstruction is genuinely lossy on real corpus data. 32+ shipped keyboards
   * carry compound lines with two markers and two year groups, e.g.
   * release/fv/fv_dakelh:
   *
   *   Copyright (c) 2008-2024 FirstVoices, SIL International. Portions (c) 2006 Chris Harvey
   *
   * and release/e/ekwtamil99uni mixes a comma list with a range:
   *
   *   Copyright (c) 2008, 2015, 2018-2023 thamiza.com and SIL International
   *
   * No `{name, years, marker}` triple reproduces either byte-for-byte. `years`
   * and `name` remain populated best-effort, because ordering (D3) and dedupe
   * (P8) need them — but rendering an inherited holder uses `raw`.
   *
   * Absent for holders this tool authors; those render from the fields.
   */
  raw?: string;
}

/** The ordered, deduped holders for one keyboard. */
export type CopyrightBlock = readonly CopyrightHolder[];

/** Why a copyright line could not be read. */
export type ParseFailure =
  | "no_copyright_line"
  | "template_placeholder"
  | "no_holder";

/**
 * Failure is a VALUE, never an empty success (contract P1).
 *
 * Returning `{ ok: true, block: [] }` for unreadable input would make "emit a
 * LICENSE.md naming only the current user" the path of least resistance, which
 * is precisely the licensing defect FR-010 prohibits.
 */
export type ParseResult =
  | { ok: true; block: CopyrightBlock }
  | { ok: false; reason: ParseFailure; line: string };

// ---------------------------------------------------------------------------
// The canonical MIT body
// ---------------------------------------------------------------------------

/**
 * The one MIT body, byte-identical for every emitted keyboard (FR-005).
 * Matches the 917-file majority form in the corpus, BOM-free.
 */
export const MIT_BODY: string = [
  "The MIT License (MIT)",
  "",
  "",
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  'of this software and associated documentation files (the "Software"), to deal',
  "in the Software without restriction, including without limitation the rights",
  "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
  "copies of the Software, and to permit persons to whom the Software is",
  "furnished to do so, subject to the following conditions:",
  "",
  "The above copyright notice and this permission notice shall be included in all",
  "copies or substantial portions of the Software.",
  "",
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
  "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
  "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
  "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
  "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
  "SOFTWARE.",
].join("\n");

/** Marker used for lines this tool authors. Inherited lines keep their own. */
export const DEFAULT_MARKER: CopyrightMarker = "©";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const BOM = "﻿";
const COPYRIGHT_LINE = /^[ \t]*copyright\b/i;
const YEAR = /\b(1[89]\d{2}|20\d{2})\b/;
/** Hyphen, en dash, or em dash all separate a range in the corpus. */
const YEAR_RANGE = /\b(1[89]\d{2}|20\d{2})[ \t]*[-–—][ \t]*(1[89]\d{2}|20\d{2})\b/;
const MARKER_TOKENS = /\(c\)|\(C\)|©|&copy;/g;
/** The literal placeholder shipped in release/template/LICENSE.md. */
const TEMPLATE_YEAR = /\bYYYY\b/;
/** A run of 3+ underscores — the template's holder blank. */
const UNDERSCORE_RUN = /_{3,}/;

function detectMarker(line: string): CopyrightMarker {
  if (line.includes("©") || line.includes("&copy;")) return "©";
  if (line.includes("(c)")) return "(c)";
  if (line.includes("(C)")) return "(C)";
  // 16 .kmn COPYRIGHT values use a bare "Copyright <year> <holder>" with no
  // marker at all; render them with the default.
  return DEFAULT_MARKER;
}

/**
 * Every year on the line, ascending and deduped.
 *
 * Collects range endpoints AND standalone years, because real lines mix them:
 * release/e/ekwtamil99uni has `2008, 2015, 2018-2023`, so returning only the
 * range endpoints would silently drop 2008 and 2015. Used for ordering and
 * dedupe; inherited lines re-emit from `raw`, so this need not be lossless.
 */
function extractYears(line: string): number[] {
  const years: number[] = [];
  for (const m of line.matchAll(new RegExp(YEAR.source, "g"))) {
    years.push(Number(m[1]));
  }
  return [...new Set(years)].sort((a, b) => a - b);
}

/**
 * Strip the leading "Copyright" (repeated where the corpus repeats it), all
 * markers, and all years, leaving the holder.
 *
 * INTERNAL whitespace is preserved — 36 corpus holders contain a double space
 * that is part of the notice. Only the leading and trailing edges are trimmed.
 */
function extractHolder(line: string): string {
  let s = line;
  // release/e/enga ships `Copyright © Copyright 2019 Stanley Stanis Kaka, …` —
  // strip repeated leading Copyright tokens, not just the first.
  let prev: string;
  do {
    prev = s;
    s = s.replace(COPYRIGHT_LINE, "").replace(/^[ \t]*(?:\(c\)|\(C\)|©|&copy;)[ \t]*/, "");
  } while (s !== prev);
  s = s.replace(MARKER_TOKENS, "");
  // Remove ALL years — ranges and standalone alike (see extractYears).
  s = s.replace(new RegExp(YEAR_RANGE.source, "g"), "");
  s = s.replace(new RegExp(YEAR.source, "g"), "");
  // Drop separators left where the years were, without touching inner spacing.
  s = s.replace(/^[ \t,.:;–—-]+/, "");
  return s.replace(/[ \t,.:;–—-]+$/, "");
}

/**
 * Parse every copyright line out of a LICENSE.md. Pure.
 *
 * Returns a failure (never an empty success) when the file has no readable
 * notice — see ParseResult.
 */
export function parseCopyright(licenseText: string): ParseResult {
  const text = licenseText.startsWith(BOM) ? licenseText.slice(BOM.length) : licenseText;
  const lines = text.split(/\r?\n/).filter((ln) => COPYRIGHT_LINE.test(ln));

  if (lines.length === 0) {
    return { ok: false, reason: "no_copyright_line", line: "" };
  }

  const holders: CopyrightHolder[] = [];
  for (const raw of lines) {
    const line = raw.trim();

    // Reject the unfilled template before anything else: "YYYY" must never be
    // read as a year, and an underscore run must never become a holder.
    if (TEMPLATE_YEAR.test(line) || UNDERSCORE_RUN.test(line)) {
      return { ok: false, reason: "template_placeholder", line };
    }

    const name = extractHolder(line);
    // A "holder" of only punctuation or whitespace is not a holder.
    if (name === "" || !/[\p{L}\p{N}]/u.test(name)) {
      return { ok: false, reason: "no_holder", line };
    }

    holders.push({
      name,
      years: extractYears(line),
      marker: detectMarker(line),
      // Anything read out of an existing file was authored before this session.
      inherited: true,
      // Retained so FR-007 re-emits this notice verbatim rather than
      // reconstructing it — see CopyrightHolder.raw.
      raw: line,
    });
  }

  return { ok: true, block: dedupeHolders(holders) };
}

// ---------------------------------------------------------------------------
// Dedupe + year accumulation (contract P8)
// ---------------------------------------------------------------------------

/**
 * Merge holders by EXACT name match, unioning their years.
 *
 * Exact-match is deliberately conservative. Fuzzy matching would silently merge
 * "SIL International" with "SIL Global" — two distinct legal entities, and
 * precisely the rename D4 refuses to rewrite.
 */
export function dedupeHolders(holders: readonly CopyrightHolder[]): CopyrightHolder[] {
  const byName = new Map<string, CopyrightHolder>();
  for (const h of holders) {
    const existing = byName.get(h.name);
    if (existing === undefined) {
      byName.set(h.name, { ...h, years: [...new Set(h.years)].sort((a, b) => a - b) });
      continue;
    }
    const years = [...new Set([...existing.years, ...h.years])].sort((a, b) => a - b);
    // A holder is inherited only if EVERY sighting was inherited; contributing
    // again in this session makes them a current holder.
    const inherited = existing.inherited && h.inherited;
    const merged: CopyrightHolder = { ...existing, years, inherited };
    // When the years changed, the retained raw line no longer states them, so it
    // must NOT be re-emitted verbatim — reconstruct from the fields instead.
    const yearsChanged = years.length !== existing.years.length;
    if (!inherited || yearsChanged) delete merged.raw;
    byName.set(h.name, merged);
  }
  return [...byName.values()];
}

/**
 * Add the current session's holder to a block, or extend that holder's years if
 * they are already present (contract P8).
 */
export function addHolder(
  block: CopyrightBlock,
  name: string,
  year: number,
  marker: CopyrightMarker = DEFAULT_MARKER,
): CopyrightBlock {
  return orderHolders(
    dedupeHolders([...block, { name, years: [year], marker, inherited: false }]),
  );
}

// ---------------------------------------------------------------------------
// Ordering (D3)
// ---------------------------------------------------------------------------

/**
 * Order holders so the provenance chain reads chronologically (D3):
 *   1. inherited holders before the current session's
 *   2. within a tier, year-less first (they predate by definition), then by
 *      earliest year ascending
 *
 * STABLE, because re-emitting an unchanged keyboard must produce a
 * byte-identical LICENSE.md — an unstable comparator would churn the file.
 */
export function orderHolders(holders: readonly CopyrightHolder[]): CopyrightHolder[] {
  return holders
    .map((h, i) => ({ h, i }))
    .sort((a, b) => {
      if (a.h.inherited !== b.h.inherited) return a.h.inherited ? -1 : 1;
      const ay = a.h.years[0];
      const by = b.h.years[0];
      if (ay === undefined && by === undefined) return a.i - b.i;
      if (ay === undefined) return -1;
      if (by === undefined) return 1;
      if (ay !== by) return ay - by;
      return a.i - b.i;
    })
    .map((e) => e.h);
}

// ---------------------------------------------------------------------------
// Rendering (contract P6)
// ---------------------------------------------------------------------------

function renderYears(years: readonly number[]): string {
  if (years.length === 0) return "";
  if (years.length === 1) return String(years[0]);
  if (years.length === 2) return `${years[0]}-${years[1]}`;
  return years.join(", ");
}

/**
 * Render one holder as a `Copyright …` line.
 *
 * An inherited holder re-emits its VERBATIM source line (FR-007). Only holders
 * this tool authored — or an inherited holder whose years this session extended,
 * which drops `raw` in dedupeHolders — are reconstructed from the fields.
 */
export function renderHolderLine(h: CopyrightHolder): string {
  if (h.raw !== undefined && h.raw !== "") return h.raw;
  const years = renderYears(h.years);
  return years === ""
    ? `Copyright ${h.marker} ${h.name}`
    : `Copyright ${h.marker} ${years} ${h.name}`;
}

/**
 * Render a canonical MIT LICENSE.md from a copyright block. Pure — the caller
 * supplies any year via the block itself (see addHolder), so this never reads
 * the clock.
 */
export function renderLicense(block: CopyrightBlock): string {
  const lines = orderHolders(block).map(renderHolderLine);
  return `${lines.join("\n")}\n\n${MIT_BODY}\n`;
}

// baseHelpTroubleshooting — symptom/fix lines extracted from the base
// keyboard's own help page, offered as suggestions for the Phase F
// question `pf_troubleshooting` (issue #2206, AC1 of #1800).
//
// This is the ONE narrow exception to the no-base-prose rule, granted by
// Matthew's recorded ruling on #2206 (2026-10-17, comment 6237890731)
// as a carve-out to spec 080 FR-007 / spec 102 FR-032. Its bounds are
// conditions of the ruling, and this module is where most of them are
// enforced:
//
//  - Track 1 (Copy) only — the wiring passes text only on that track
//    (see decisions/liveExtraction.ts); on Adapt the base's section
//    already ships inside the inherited prose and extracting it would
//    duplicate the section, which the ruling does not authorise.
//  - Troubleshooting sections only: lines come from an explicit
//    Troubleshooting-equivalent section of the base's help page, never
//    from anywhere else in the prose.
//  - Suggestion-only, never inheritance: the input is the extraction-
//    only store slice (`baseHelpPhpTextForExtraction`), which no render
//    or serialization path reads. What this module returns joins the
//    facet templates in the spec-092 seed pipeline as a proposal the
//    author keeps, edits, or deletes per line; the AC3 guard in
//    helpDocsFromDecisions keeps a still-`extracted` value out of the
//    composed help page, so nothing here can ship unconfirmed.
//
// Extraction itself follows the parser requirements recorded on #2206:
// PHP blocks and HTML comments are stripped before parsing (both can
// contain heading-like strings and author asides that are not prose);
// parsing is a tolerant block scan, not a DOM walk, so the wild markup
// of real corpus pages (unclosed tags, headings inside list items,
// tables inside lists) degrades to fewer lines, never to a throw; and
// every candidate line passes known-boilerplate exclusion plus the
// base-identity / stale-version filters below before it can be offered.
//
// Corpus reality (km-keyman, queue-1800-ruling.md): only 17/925 main
// help pages carry an explicit Troubleshooting-equivalent heading and,
// after filtering, ~4 yield a transferable pair. Returning nothing is
// the normal outcome — the facet templates remain the common proposal.

/** The base identity a candidate line must not carry (see the filters). */
export interface BaseHelpIdentity {
  /** The base keyboard's catalog id, e.g. "korean_rr". */
  id?: string;
  /** The base keyboard's display name, e.g. "Korean RR". */
  displayName?: string;
}

/** Most lines ever offered from one base page — a proposal, not a dump. */
const MAX_EXTRACTED_LINES = 8;

/** A candidate shorter than this is a fragment, not a symptom/fix line. */
const MIN_LINE_LENGTH = 25;

/**
 * Headings that open a Troubleshooting-equivalent section. English plus
 * the Spanish forms attested in the corpus (winchus: "Solucionar
 * Problemas"); matched against the heading's text content only — a
 * table-of-contents LINK with the same words is not a heading and never
 * opens a section.
 */
const SECTION_HEADING =
  /troubleshoot|solucionar problemas|soluci[óo]n de problemas|problemas y soluciones|known issues|common problems|frequently asked|d[ée]pannage/i;

/**
 * Subsections inside the section whose content is never offered: the
 * ruling names Fonts subsections and contact tails; installation and
 * system-requirements subsections are the same generic class (AC4).
 */
const EXCLUDED_SUBSECTION =
  /fonts?|install|contact|system requirements|requirements|download/i;

/**
 * A subsection heading that merely groups pairs (winchus's "Problemas
 * en el dispositivo móvil:", kbdinben's "Problem Solving") rather than
 * naming a symptom: its following blocks stand on their own instead of
 * becoming the symptom half of a "symptom - fix" line.
 */
const GROUPING_SUBHEADING = /^(problem solving|problems?|problemas?)\b/i;

// Known-boilerplate exclusion (ruling bound, #2206): the stock
// square-box sentence and its guide link (156/164 corpus pages), the
// contact-tail closers, and generic font/installation content (AC4 —
// the standard help already covers fonts and installation).
const BOILERPLATE_PATTERNS: readonly RegExp[] = [
  /troubleshooting guide/i,
  /\/troubleshooting\//i,
  /#boxes\b/i,
  /square boxes|see squares|squares when you type|boxes instead of/i,
  /for any other questions/i,
  /contact us|contact the (author|developer|team)|community site|email us/i,
  /\binstall(ation|ing|ed|s)?\b/i,
  /\bfonts?\b[^.]*\b(install|download|missing|not (be )?(display|shown|render))/i,
  /\b(install|download)\b[^.]*\bfonts?\b/i,
];

/**
 * Stale app/version references (ruling bound): a line pinned to a named
 * release of the host app or OS describes the base's era, not the new
 * keyboard's behaviour ("For Keyman 14.2 users…", "Version 2.0 changed…").
 */
const STALE_VERSION_PATTERNS: readonly RegExp[] = [
  /\b(keyman(web| desktop)?|windows|mac ?os|android|ios|linux)\s+(version\s+)?\d+(\.\d+)*/i,
  /\bversion\s+\d+(\.\d+)+/i,
];

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) =>
      String.fromCodePoint(Number.parseInt(n, 16)),
    );
}

/** Plain text of an HTML fragment: tags stripped, whitespace collapsed. */
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "block"; text: string }
  | { kind: "row"; cells: string[]; header: boolean };

/**
 * Tolerant block scan of the page: headings, paragraphs, list items and
 * table rows in document order. The scan is flat and non-nesting — a
 * block's inner markup contributes its text only — so malformed pages
 * yield fewer blocks rather than an exception.
 */
function scanBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const pattern =
    /<(h[1-6]|tr|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const tag = match[1]!.toLowerCase();
    const inner = match[2]!;
    if (tag.startsWith("h")) {
      blocks.push({ kind: "heading", level: Number(tag[1]), text: textOf(inner) });
    } else if (tag === "tr") {
      const cellPattern = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
      const cells: string[] = [];
      let allHeader = true;
      let cell: RegExpExecArray | null;
      while ((cell = cellPattern.exec(inner)) !== null) {
        if (cell[1]!.toLowerCase() === "td") allHeader = false;
        cells.push(textOf(cell[2]!));
      }
      if (cells.length > 0) {
        blocks.push({ kind: "row", cells, header: allHeader && cells.length > 0 });
      }
    } else {
      const text = textOf(inner);
      if (text !== "") blocks.push({ kind: "block", text });
    }
  }
  return blocks;
}

/** True when a candidate line must never be offered (see the patterns). */
function isDropped(line: string, identityTerms: readonly string[]): boolean {
  if (line.length < MIN_LINE_LENGTH) return true;
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(line)) return true;
  }
  for (const pattern of STALE_VERSION_PATTERNS) {
    if (pattern.test(line)) return true;
  }
  const lower = line.toLowerCase();
  for (const term of identityTerms) {
    if (term !== "" && lower.includes(term)) return true;
  }
  return false;
}

function identityTermsOf(base: BaseHelpIdentity): string[] {
  const terms: string[] = [];
  if (base.id !== undefined && base.id.trim() !== "") {
    terms.push(base.id.trim().toLowerCase());
    // The id's spaced form ("korean rr" for korean_rr) is how prose
    // usually names the base.
    const spaced = base.id.replace(/[_-]+/g, " ").trim().toLowerCase();
    if (spaced !== "" && spaced !== base.id.toLowerCase()) terms.push(spaced);
  }
  if (base.displayName !== undefined && base.displayName.trim() !== "") {
    terms.push(base.displayName.trim().toLowerCase());
  }
  return terms;
}

/**
 * Extract the offerable symptom/fix lines from a base help page's
 * Troubleshooting-equivalent section. Returns [] when the page has no
 * such section or nothing in it survives filtering — the normal corpus
 * outcome. Pure and total: malformed input degrades to fewer lines.
 */
export function extractBaseHelpTroubleshootingLines(
  helpPhpText: string | null,
  base: BaseHelpIdentity,
): string[] {
  if (helpPhpText === null || helpPhpText.trim() === "") return [];

  // Strip PHP blocks and HTML comments FIRST (ruling bound): a PHP
  // block can contain heading-like strings, and comments carry author
  // asides ("including link to Square Boxes help page") that are not
  // prose and must not trip — or feed — the filters.
  const stripped = helpPhpText
    .replace(/<\?php[\s\S]*?(\?>|$)/gi, " ")
    .replace(/<\?=[\s\S]*?(\?>|$)/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const blocks = scanBlocks(stripped);
  const sectionStart = blocks.findIndex(
    (b) => b.kind === "heading" && SECTION_HEADING.test(b.text),
  );
  if (sectionStart === -1) return [];
  const sectionHeading = blocks[sectionStart] as { level: number };
  const sectionEnd = blocks.findIndex(
    (b, i) =>
      i > sectionStart && b.kind === "heading" && b.level <= sectionHeading.level,
  );
  const section = blocks.slice(
    sectionStart + 1,
    sectionEnd === -1 ? undefined : sectionEnd,
  );

  const identityTerms = identityTermsOf(base);
  const lines: string[] = [];
  const seen = new Set<string>();
  const offer = (line: string): void => {
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (isDropped(cleaned, identityTerms)) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (lines.length < MAX_EXTRACTED_LINES) lines.push(cleaned);
  };

  let skipUntilLevel: number | null = null;
  let symptom: string | null = null;
  let symptomParts: string[] = [];
  const flushSymptom = (): void => {
    // A contact tail or boilerplate paragraph trailing a symptom's real
    // fix blocks (korean_rr ends its last symptom with a community-site
    // closer) contaminates only itself: drop such parts here, and let
    // the composed line face the full filter in `offer`.
    const parts = symptomParts.filter(
      (part) => !BOILERPLATE_PATTERNS.some((pattern) => pattern.test(part)),
    );
    if (symptom !== null && parts.length > 0) {
      offer(`${symptom} - ${parts.join(" ")}`);
    }
    symptom = null;
    symptomParts = [];
  };

  for (const block of section) {
    if (block.kind === "heading") {
      if (skipUntilLevel !== null && block.level > skipUntilLevel) continue;
      skipUntilLevel = null;
      flushSymptom();
      if (EXCLUDED_SUBSECTION.test(block.text)) {
        skipUntilLevel = block.level;
        continue;
      }
      if (GROUPING_SUBHEADING.test(block.text)) continue;
      symptom = block.text.replace(/[\s:]+$/, "");
      symptomParts = [];
      continue;
    }
    if (skipUntilLevel !== null) continue;
    if (block.kind === "row") {
      flushSymptom();
      if (block.header) continue;
      const cells = block.cells.filter((c) => c !== "");
      if (cells.length >= 2) offer(`${cells[0]} - ${cells.slice(1).join(" ")}`);
      else if (cells.length === 1) offer(cells[0]!);
      continue;
    }
    // A plain block: the fix half of a pending symptom heading, or a
    // standalone pair written as prose.
    if (symptom !== null) symptomParts.push(block.text);
    else offer(block.text);
  }
  flushSymptom();
  return lines;
}

/**
 * The `pf_troubleshooting` proposal from both sources: the facet
 * template lines first (studio-authored, strictly gated — the common
 * case), then the extracted base-help lines, de-duplicated. Undefined
 * when neither source offers anything, so the question opens blank
 * exactly as it did before either feature.
 */
export function combineTroubleshootingProposals(
  facetProposal: string | undefined,
  extractedLines: readonly string[],
): string | undefined {
  const lines: string[] = [];
  const seen = new Set<string>();
  const add = (line: string): void => {
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(line);
  };
  if (facetProposal !== undefined) {
    for (const line of facetProposal.split("\n")) {
      if (line.trim() !== "") add(line);
    }
  }
  for (const line of extractedLines) add(line);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

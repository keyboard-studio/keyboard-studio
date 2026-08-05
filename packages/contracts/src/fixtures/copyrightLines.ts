// Copyright-line fixtures HARVESTED from keymanapp/keyboards (FR-014).
//
// Every string below is a real line from a shipped LICENSE.md, with its source
// path recorded. Nothing here is invented — the whole point is that the parser
// meets the shapes that actually exist rather than the shapes we imagined.
//
// Re-harvest with specs/059-keyboard-attribution/corpus-scan.py.
//
// Distribution at the time of harvest (920 release/ LICENSE.md files, all MIT):
//   marker:  ©  597   (c) 316   (C) 7
//   years:   range 720   single 197   none 2   comma-list 1
//   holders: exactly one copyright line per file; none with two, none with zero

/** A real line the parser MUST read correctly. */
export interface CopyrightLineFixture {
  /** Verbatim line from a shipped LICENSE.md. */
  line: string;
  /** Repo-relative source, so a surprising expectation can be checked against the real file. */
  source: string;
  /** Expected holder — verbatim, including any internal double spaces. */
  holder: string;
  /** Expected years, ascending. Empty when the line states none. */
  years: number[];
  /** Expected marker form. */
  marker: "©" | "(c)" | "(C)";
  /** Why this fixture is in the table. */
  note: string;
}

/** A real line the parser MUST refuse, rather than misread. */
export interface CopyrightRejectFixture {
  line: string;
  source: string;
  /** Expected ParseFailure reason. */
  reason: "template_placeholder" | "no_holder";
  note: string;
}

export const COPYRIGHT_LINE_FIXTURES: readonly CopyrightLineFixture[] = [
  // --- marker forms: all three occur ---
  {
    line: "Copyright © 2022 Haroon Showgan",
    source: "release/a/adiga_danef/LICENSE.md",
    holder: "Haroon Showgan",
    years: [2022],
    marker: "©",
    note: "symbol marker, single year — the most common shape",
  },
  {
    line: "Copyright (c) 2018 Enabling Languages",
    source: "release/el/el_pasifika/LICENSE.md",
    holder: "Enabling Languages",
    years: [2018],
    marker: "(c)",
    note: "lowercase (c) marker",
  },
  {
    line: "Copyright (C) 2019 SIL International, Latam Asia 拉美亞太",
    source: "release/m/mongolian_cyrillic_qwerty/LICENSE.md",
    holder: "SIL International, Latam Asia 拉美亞太",
    years: [2019],
    marker: "(C)",
    note: "uppercase (C) marker, compound holder, and NON-ASCII (CJK) in the holder name",
  },

  // --- year forms ---
  {
    line: "Copyright © 2015-2026 SIL Global",
    source: "release/a/akha_lahu/LICENSE.md",
    holder: "SIL Global",
    years: [2015, 2026],
    marker: "©",
    note: "hyphen range — the COMMON case (720 of 920), not an edge case",
  },
  {
    line: "Copyright (c) 2019, 2020 National Research Council Canada",
    source: "release/nrc/nrc_crk_cans/LICENSE.md",
    holder: "National Research Council Canada",
    years: [2019, 2020],
    marker: "(c)",
    note: "comma-separated year list — the only instance in the corpus",
  },
  {
    line: "Copyright © SIL International",
    source: "release/m/mitterhofer/LICENSE.md",
    holder: "SIL International",
    years: [],
    marker: "©",
    note: "NO YEAR — holder only. Must not invent a year",
  },

  // --- whitespace: internal spacing is part of the notice ---
  {
    line: "Copyright © 2021-2023  Dr Khampha Sidavong and John Durdin",
    source: "release/l/lao_pali_us/LICENSE.md",
    holder: "Dr Khampha Sidavong and John Durdin",
    years: [2021, 2023],
    marker: "©",
    note: "DOUBLE SPACE after the year range; joint holders expressed as prose in one line",
  },
  {
    line: "Copyright © 2024-2025  SIL Global",
    source: "release/sil/sil_mende_kikakui/LICENSE.md",
    holder: "SIL Global",
    years: [2024, 2025],
    marker: "©",
    note: "double space before an organisation holder",
  },

  // --- the live SIL rename: both forms are current, neither may be normalised ---
  {
    line: "Copyright © 2025 SIL Global",
    source: "release/a/amazigh_latin/LICENSE.md",
    holder: "SIL Global",
    years: [2025],
    marker: "©",
    note: "SIL Global — the NEW name (152 keyboards). Must not be rewritten to SIL International",
  },
  {
    line: "Copyright (c) 2024 FirstVoices, SIL International",
    source: "release/fv/fv_lekwungen/LICENSE.md",
    holder: "FirstVoices, SIL International",
    years: [2024],
    marker: "(c)",
    note: "SIL International — the OLD name (280 keyboards), still shipping. Must not be rewritten",
  },

  // --- a defunct company: proof that holders are historical facts, not current entities ---
  {
    line: "Copyright (c) 2008 Tavultesoft Tavultesoft Pty Ltd",
    source: "release/k/kbdsn1/LICENSE.md",
    holder: "Tavultesoft Tavultesoft Pty Ltd",
    years: [2008],
    marker: "(c)",
    note: "duplicated word in the holder, from a predecessor company — preserve verbatim, do not tidy",
  },

  // --- the hard real shapes. These broke a first implementation that assumed
  //     one marker, one year group, and one leading "Copyright" per line. ---
  {
    line: "Copyright (c) 2008, 2015, 2018-2023 thamiza.com and SIL International",
    source: "release/e/ekwtamil99uni/LICENSE.md",
    holder: "thamiza.com and SIL International",
    years: [2008, 2015, 2018, 2023],
    marker: "(c)",
    note: "MIXES a comma list with a range — reading only the range endpoints silently drops 2008 and 2015. Holder typo 'thamiza' is preserved verbatim",
  },
  {
    line: "Copyright © Copyright 2019 Stanley Stanis Kaka, Marc Durdin",
    source: "release/e/enga/LICENSE.md",
    holder: "Stanley Stanis Kaka, Marc Durdin",
    years: [2019],
    marker: "©",
    note: "the word Copyright appears TWICE — stripping only the first leaves it inside the holder",
  },
  {
    line: "Copyright (c) 2008-2024 FirstVoices, SIL International. Portions (c) 2006 Chris Harvey",
    source: "release/fv/fv_dakelh/LICENSE.md",
    holder: "FirstVoices, SIL International. Portions   Chris Harvey",
    years: [2006, 2008, 2024],
    marker: "(c)",
    note: "TWO markers and TWO year groups on one line (32+ keyboards). Proof the {name,years,marker} triple is lossy and inherited lines must re-emit from `raw`",
  },
] as const;

/**
 * Lines the parser MUST reject rather than misread (contract P4).
 *
 * Both are REAL shipped files. The template placeholder is the more instructive:
 * it is what a tool produces when it emits a license without knowing the holder,
 * and it is the exact outcome FR-010 exists to prevent.
 */
export const COPYRIGHT_REJECT_FIXTURES: readonly CopyrightRejectFixture[] = [
  {
    line: "Copyright (c) YYYY _____________________",
    source: "release/template/LICENSE.md",
    reason: "template_placeholder",
    note: "unfilled template, shipped in release/. YYYY is not a year; underscores are not a holder",
  },
  {
    line: "Copyright © 2015",
    source: "legacy/b/bod/LICENSE.md",
    reason: "no_holder",
    note: "year with no holder — attributes the work to nobody",
  },
] as const;

/**
 * A BOM-prefixed license body. 3 of 920 files carry a UTF-8 BOM, and it is the
 * ONLY difference between the two distinct license bodies in the corpus — so
 * failing to strip it would read as a second, different license.
 */
export const BOM_PREFIXED_LINE = {
  line: "﻿Copyright (c) 2007-2020 Arun Sarkar",
  source: "release/b/bangla_joy/LICENSE.md",
  holder: "Arun Sarkar",
  years: [2007, 2020],
  marker: "(c)" as const,
  note: "UTF-8 BOM before 'Copyright' — must be stripped before matching",
} as const;

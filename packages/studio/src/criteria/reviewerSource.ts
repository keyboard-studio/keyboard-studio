// Reviewer source facts for the /review judgment (foreign mode).
//
// The yellow and red rows cannot be decided by a lint pass; a reviewer has
// to compare things (the .kps name against the .kmn &NAME and the README
// title, the declared language tags against langtags, the welcome text
// against its purpose). This module reads those few facts once from the
// judged VFS into plain data (`ReviewerSource`), and formats them into the
// short "Reviewer context" lines the resolver shows. It never decides a
// status itself; the resolver reads two positive facts from it (the
// LICENSE and HISTORY.md years, for 4.2/4.8's Not applicable).
//
// Pure apart from the optional langtags lookup, which the caller supplies
// (the studio loads it lazily) so this module imports no engine data.

import type {
  KeyboardIR,
  ReviewContext,
  VirtualFS,
} from "@keyboard-studio/contracts";

import { readVfsText } from "../lib/vfsText.ts";
import type { LanguageTagAnalysis } from "./languageTags.ts";

/** One .kps `<Info>` child: its text and its URL attribute. */
export interface KpsInfoField {
  text: string;
  url: string;
}

/** A langtags answer for a base language subtag, or null when unknown. */
export type LangtagsLookup = (
  subtag: string,
) => { name?: string; script?: string; region?: string } | null;

export interface ReviewerSource {
  kps?: {
    name: KpsInfoField;
    description: KpsInfoField;
    author: KpsInfoField;
    website: KpsInfoField;
  };
  kmnName?: string;
  kmnCopyright?: string;
  readmeTitle?: string;
  /** Each .kps language tag with its langtags name, script, and region. */
  languages?: { tag: string; name?: string; script?: string; region?: string }[];
  /** First ~300 chars of tag-stripped text, keyed by document. */
  excerpts?: {
    readmeHtm?: { text: string; words: number };
    welcomeHtm?: { text: string; sentences: string[] };
    history?: string;
  };
  /** Years found in HISTORY.md entry headings. */
  historyYears?: { earliest: number; latest: number };
  /**
   * PR targets that change an existing keyboard (not one the PR adds):
   * the keyboard-folder-relative paths the PR changed, lower-cased.
   */
  upgradePr?: { changedFiles: readonly string[] };
  /** The .kps tags against langtags, Glottolog and the output script. */
  languageTags?: LanguageTagAnalysis;
  /** PR targets: the PR's diff-comment, conversation-comment and review counts. */
  prCommentCounts?: { diff: number; conversation: number; reviews: number };
}

const EXCERPT_CHARS = 300;

/** Strip tags, `<style>`/`<script>` bodies, and collapse whitespace. */
export function stripMarkup(html: string): string {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\?php[\s\S]*?\?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text: string): string {
  return text.length > EXCERPT_CHARS
    ? `${text.slice(0, EXCERPT_CHARS).trimEnd()}...`
    : text;
}

/** `<Info><Tag URL="...">text</Tag>` (or the `value="..."` form). */
export function kpsInfoField(kps: string, tag: string): KpsInfoField {
  const info =
    /<Info(?:\s[^>]*)?>([\s\S]*?)<\/Info\s*>/i.exec(kps)?.[1] ?? "";
  const m = new RegExp(
    `<${tag}\\b([^>]*?)(?:/>|>([^<]*)</${tag}\\s*>)`,
    "i",
  ).exec(info);
  if (m === null) return { text: "", url: "" };
  const attrs = m[1] ?? "";
  const url = /\bURL="([^"]*)"/i.exec(attrs)?.[1] ?? "";
  const value = /\bvalue="([^"]*)"/i.exec(attrs)?.[1] ?? "";
  const text = (m[2] ?? "").trim() || value.trim();
  return { text, url: url.trim() };
}

/** First Markdown heading (ATX or setext), else the first non-empty line. */
function readmeTitle(md: string): string | undefined {
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    const atx = /^#{1,6}\s+(.*?)\s*#*$/.exec(line);
    if (atx) return atx[1];
    return line;
  }
  return undefined;
}

function historyYears(
  md: string,
): { earliest: number; latest: number } | undefined {
  const years: number[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = /^#{0,6}\s*\S+\s+\(([^)]*)\)\s*$/.exec(line.trim());
    if (m === null) continue;
    const y = /\b(\d{4})\b/.exec(m[1] ?? "")?.[1];
    if (y !== undefined) years.push(Number(y));
  }
  if (years.length === 0) return undefined;
  return { earliest: Math.min(...years), latest: Math.max(...years) };
}

function findDoc(vfs: VirtualFS, re: RegExp): string | undefined {
  const p = vfs.list().find((x) => re.test(x));
  return p === undefined ? undefined : readVfsText(vfs, p);
}

/** Build the reviewer's source facts from the judged VFS. */
export function buildReviewerSource(args: {
  vfs: VirtualFS;
  kpsText: string | undefined;
  kpsLanguages: readonly string[];
  keyboardIR: KeyboardIR | undefined;
  reviewContext: ReviewContext | undefined;
  /** The PR changes a keyboard that already exists at the base commit. */
  isUpgradePr: boolean;
  langtags?: LangtagsLookup;
  languageTags?: LanguageTagAnalysis;
}): ReviewerSource {
  const { vfs, kpsText, reviewContext } = args;
  const src: ReviewerSource = {};
  if (args.languageTags !== undefined) src.languageTags = args.languageTags;
  if (reviewContext?.prCommentCounts !== undefined) {
    src.prCommentCounts = reviewContext.prCommentCounts;
  }

  if (kpsText !== undefined) {
    src.kps = {
      name: kpsInfoField(kpsText, "Name"),
      description: kpsInfoField(kpsText, "Description"),
      author: kpsInfoField(kpsText, "Author"),
      website: kpsInfoField(kpsText, "WebSite"),
    };
  }
  const header = args.keyboardIR?.header;
  if (header?.name) src.kmnName = header.name;
  if (header?.copyright) src.kmnCopyright = header.copyright;

  const readme = readVfsText(vfs, "README.md");
  if (readme !== undefined) {
    const t = readmeTitle(readme);
    if (t !== undefined) src.readmeTitle = t;
  }

  if (args.kpsLanguages.length > 0) {
    src.languages = args.kpsLanguages.map((tag) => {
      const base = tag.split("-")[0] ?? tag;
      const hit = args.langtags?.(base) ?? null;
      return {
        tag,
        ...(hit?.name ? { name: hit.name } : {}),
        ...(hit?.script ? { script: hit.script } : {}),
        ...(hit?.region ? { region: hit.region } : {}),
      };
    });
  }

  const excerpts: NonNullable<ReviewerSource["excerpts"]> = {};
  const readmeHtm = findDoc(vfs, /(^|\/)readme\.htm$/i);
  if (readmeHtm !== undefined) {
    const text = stripMarkup(readmeHtm);
    excerpts.readmeHtm = {
      text: excerpt(text),
      words: text === "" ? 0 : text.split(" ").length,
    };
  }
  const welcomeHtm = findDoc(vfs, /(^|\/)welcome\.htm$/i);
  if (welcomeHtm !== undefined) {
    const text = stripMarkup(welcomeHtm);
    const sentences = (text.match(/[^.!?]+[.!?]?/g) ?? [])
      .map((s) => s.trim())
      .filter((s) => /\b(install|download)/i.test(s))
      .slice(0, 3);
    excerpts.welcomeHtm = { text: excerpt(text), sentences };
  }
  const history = readVfsText(vfs, "HISTORY.md");
  if (history !== undefined) {
    excerpts.history = excerpt(history.replace(/\s+/g, " ").trim());
    const y = historyYears(history);
    if (y !== undefined) src.historyYears = y;
  }
  if (Object.keys(excerpts).length > 0) src.excerpts = excerpts;

  if (
    reviewContext !== undefined &&
    reviewContext.isPr &&
    args.isUpgradePr &&
    reviewContext.treePaths !== undefined
  ) {
    const prefix = `${reviewContext.repoPath}/`.toLowerCase();
    src.upgradePr = {
      changedFiles: reviewContext.treePaths
        .map((p) => p.toLowerCase())
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length)),
    };
  }
  return src;
}

// ---------------------------------------------------------------------------
// Formatting: the reviewer-context lines per criterion
// ---------------------------------------------------------------------------

const none = "(none)";
const show = (s: string | undefined): string =>
  s !== undefined && s !== "" ? s : none;

function fieldLine(label: string, f: KpsInfoField): string {
  return f.url !== ""
    ? `${label}: ${show(f.text)} (${f.url})`
    : `${label}: ${show(f.text)}`;
}

/** Section number prefix -> the files whose change makes the row current. */
const SCOPE_FILES: readonly { section: string; label: string; re: RegExp }[] = [
  {
    section: "6.",
    label: "welcome/readme",
    re: /(^|\/)(welcome|readme)[^/]*\.html?$|(^|\/)welcome\//i,
  },
  { section: "5.", label: "README.md", re: /^readme\.md$/i },
  { section: "10.", label: ".kps", re: /\.kps$/i },
  {
    section: "7.",
    label: ".kmn/.kvks/touch layout",
    re: /\.(kmn|kvks|keyman-touch-layout)$/i,
  },
];

/** "Source file unchanged by this PR." for an upgrade PR, else null. */
export function scopeNote(
  section: string,
  src: ReviewerSource | undefined,
): string | null {
  const changed = src?.upgradePr?.changedFiles;
  if (changed === undefined) return null;
  const rule = SCOPE_FILES.find((r) => section.startsWith(r.section));
  if (rule === undefined) return null;
  return changed.some((p) => rule.re.test(p))
    ? null
    : "Source file unchanged by this PR.";
}

const NAME_ROWS = new Set([
  "7.7-display-name-no-underscores",
  "10.10-kps-description-meaningful",
  "10.11-kps-no-spelling-errors",
  "5.1-readme-good-header",
  "5.4-readme-description-sensible",
]);
const LANG_ROWS = new Set([
  "10.3-kps-tags-minimal",
  "10.4-kps-unusual-tag-flagged",
  "12.1-bcp47-tag-correct",
  "12.5-script-mismatch-flagged",
]);

/**
 * The side-by-side context a reviewer compares for one row, or [] when
 * the row has none. At most ~6 lines.
 */
export function sourceContextLines(
  criterionId: string,
  src: ReviewerSource | undefined,
): string[] {
  if (src === undefined) return [];
  if (NAME_ROWS.has(criterionId)) {
    const lines: string[] = [];
    if (src.kps !== undefined) {
      lines.push(fieldLine(".kps <Info><Name>", src.kps.name));
      if (
        criterionId.startsWith("10.1") ||
        criterionId.startsWith("5.")
      ) {
        lines.push(fieldLine(".kps <Info><Description>", src.kps.description));
      }
      if (criterionId.startsWith("5.")) {
        lines.push(fieldLine(".kps <Info><Author>", src.kps.author));
        lines.push(fieldLine(".kps <Info><WebSite>", src.kps.website));
      }
    }
    if (src.kmnName !== undefined) lines.push(`.kmn &NAME: ${src.kmnName}`);
    if (src.readmeTitle !== undefined)
      lines.push(`README title: ${src.readmeTitle}`);
    return lines;
  }
  if (LANG_ROWS.has(criterionId)) {
    return (src.languages ?? []).slice(0, 6).map((l) => {
      const bits = [
        l.name,
        l.script !== undefined || l.region !== undefined
          ? `default ${[l.script, l.region].filter(Boolean).join(", ")}`
          : undefined,
      ].filter((b): b is string => b !== undefined);
      return `.kps language ${l.tag}: ${bits.length > 0 ? bits.join("; ") : "not in langtags"}`;
    });
  }
  const ex = src.excerpts;
  switch (criterionId) {
    case "6.2-readme-htm-short":
      return ex?.readmeHtm
        ? [`readme.htm: ${ex.readmeHtm.words} words`, `Excerpt: ${ex.readmeHtm.text}`]
        : [];
    case "6.4-welcome-htm-describes-usage":
    case "6.7-welcome-htm-not-political":
      return ex?.welcomeHtm ? [`welcome.htm excerpt: ${ex.welcomeHtm.text}`] : [];
    case "6.5-welcome-htm-no-install-instructions": {
      const w = ex?.welcomeHtm;
      if (w === undefined) return [];
      return [
        w.sentences.length > 0
          ? `Install/download sentences in welcome.htm: ${w.sentences.join(" | ")}`
          : "No sentence in welcome.htm mentions install or download.",
        `welcome.htm excerpt: ${w.text}`,
      ];
    }
    case "3.2-history-header-sensible":
      return ex?.history ? [`HISTORY.md excerpt: ${ex.history}`] : [];
    default:
      return [];
  }
}

/** The LICENSE copyright line from 4.1b's verified `Found: "..."` line. */
export function licenseCopyrightLine(
  verified: readonly string[],
): string | undefined {
  for (const v of verified) {
    const m = /^Found:\s*"(.*)"\s*$/.exec(v);
    if (m) return m[1];
  }
  return undefined;
}

/** Every four-digit year in a copyright line, in order ([] for none). */
export function copyrightYears(line: string | undefined): number[] {
  return [...(line ?? "").matchAll(/\b(\d{4})\b/g)].map((m) => Number(m[1]));
}

/**
 * The one year a copyright line states, or undefined when it states none,
 * several, or an open range ("2024-present", "2024–").
 */
export function copyrightSingleYear(line: string | undefined): number | undefined {
  const years = copyrightYears(line);
  if (years.length !== 1 || /\d{4}\s*[-\u2013\u2014]/.test(line ?? "")) return undefined;
  return years[0];
}

/** 17.1: the PR's comment counts, and why resolution is not shown. */
export function prCommentLines(src: ReviewerSource | undefined): string[] {
  const c = src?.prCommentCounts;
  if (c === undefined) return [];
  return [
    `This PR has ${c.diff} comment(s) on the diff, ${c.conversation} conversation comment(s) and ${c.reviews} review(s) requesting changes or commenting.`,
    "Whether review threads are resolved is only in GitHub's GraphQL API, which needs a signed-in request; check the PR's Files tab.",
  ];
}

/** First year or year range ("2015-2024") in a copyright line. */
function yearsIn(line: string): string | undefined {
  return /\b(\d{4})(?:\s*[-–]\s*(\d{4}))?\b/.exec(line)?.[0];
}

/**
 * Copyright rows 4.2/4.3/4.4/4.8: the LICENSE line beside the other
 * places a holder or year is stated.
 */
export function copyrightContextLines(
  criterionId: string,
  licenseLine: string | undefined,
  src: ReviewerSource | undefined,
): string[] {
  const lines: string[] = [
    licenseLine !== undefined
      ? `LICENSE.md copyright: ${licenseLine}`
      : "LICENSE.md: no copyright line found.",
  ];
  if (criterionId.startsWith("4.3")) {
    if (src?.kps !== undefined)
      lines.push(fieldLine(".kps <Info><Author>", src.kps.author));
    if (src?.kmnCopyright !== undefined)
      lines.push(`.kmn &COPYRIGHT: ${src.kmnCopyright}`);
  }
  if (criterionId.startsWith("4.2") || criterionId.startsWith("4.8")) {
    const y = licenseLine !== undefined ? yearsIn(licenseLine) : undefined;
    if (y !== undefined) lines.push(`LICENSE year(s): ${y}`);
    const h = src?.historyYears;
    if (h !== undefined)
      lines.push(
        `HISTORY.md entry years: earliest ${h.earliest}, latest ${h.latest}`,
      );
  }
  return lines;
}

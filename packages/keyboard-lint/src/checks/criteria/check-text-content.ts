// Checks 4.1b / 4.5b / 4.6b / 5.2b / 5.3b / 5.5b / 5.6b / 6.6b / 7.11b /
// 11.1b / 11.3b / 11.4b — the text-content twins (Group A2, Batch 4).
//
// Each is the post-hoc checkable twin of a scaffolder-bake criterion: the
// bake row is Met-by-guarantee for studio-built keyboards and
// not-yet-checkable ("foreign-bake") for foreign keyboards; the twin row
// is a real layer-c check that reads the judged files' text.
//
// All twelve are pure functions of the judged texts (LICENSE.md, .kmn,
// .kps, README.md, readme.htm, welcome.htm, help .php) plus the keyboard
// id and primary BCP47 tag. A missing source file never fabricates a
// verdict — the studio assembly names it in contextMissing for the
// affected codes (except 11.1b, where the .php's existence is itself the
// criterion, so absence is the finding).

import {
  checkFailed,
  checkPassed,
  criteriaFinding,
  mergeResults,
  type CheckResult,
} from "./_shared.js";

export interface TextContentFacts {
  keyboardId: string;
  /** LICENSE.md text; undefined when the file is absent. */
  licenseMd?: string;
  /** .kmn source text; undefined when absent/unreadable. */
  kmn?: string;
  /** .kps text; undefined when absent/unreadable. */
  kps?: string;
  /** Root README.md text; undefined when absent. */
  readmeMd?: string;
  /** source/readme.htm text; undefined when absent. */
  readmeHtm?: string;
  /** source/welcome.htm (or the folder convention) text; undefined when absent. */
  welcomeHtm?: string;
  /** Help .php text; undefined when absent. */
  php?: string;
  /** VFS path of the judged .php (finding location). */
  phpPath?: string;
  /** Primary BCP47 tag; undefined when unknown. */
  primaryBcp47?: string;
}

const COPYRIGHT_YEAR = /copyright[^\n]{0,80}\d{4}/i;
// 4.5's "exact syntax": Copyright (C) <year> <holder>. The (C) is matched
// case-insensitively — the MIT template the scaffolder emits uses (c),
// and the shape (copyright + year + holder) is what the criterion pins.
const COPYRIGHT_SYNTAX =
  /copyright\s+\(c\)\s+\d{4}(?:\s*-\s*\d{4})?\s+\S/i;
const VERSION_LIKE = /\b\d+\.\d+(?:\.\d+)?\b/;
const KMN_AUTHOR_STORE = /store\s*\(\s*&author\b/i;
const HTML_LANG = /<html[^>]*\blang\s*=\s*["']([^"']+)["']/i;
const PHP_OPEN = /<\?php/i;
const PHP_HEADER_BLOCK = /<\?php[\s\S]*?\/\*[\s\S]*?Name\s*:/i;

/** First line matching `re` in `text`, trimmed — for evidence. */
function firstMatchingLine(text: string, re: RegExp): string | undefined {
  return text
    .split("\n")
    .find((l) => re.test(l))
    ?.trim();
}

/** 4.1b — LICENSE.md has no copyright statement with year(s). */
export function checkCopyrightAbsent(facts: TextContentFacts): CheckResult {
  const code = "KM_LINT_COPYRIGHT_ABSENT";
  if (facts.licenseMd === undefined)
    return checkPassed(code, ["No LICENSE.md to check."]);
  const line = firstMatchingLine(facts.licenseMd, COPYRIGHT_YEAR);
  if (line !== undefined)
    return checkPassed(code, ["File: LICENSE.md", `Found: "${line}"`]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_COPYRIGHT_ABSENT",
      file: "LICENSE.md",
      message: "LICENSE.md has no copyright statement with year(s).",
      hint: "Add a copyright line with year(s) to LICENSE.md.",
    }),
  ]);
}

/**
 * 4.5b — the LICENSE.md copyright line does not follow the
 * `Copyright (C) <year> <holder>` syntax. Only runs when a copyright
 * line exists at all (absence is 4.1b's finding).
 */
export function checkCopyrightSyntax(facts: TextContentFacts): CheckResult {
  const code = "KM_LINT_COPYRIGHT_SYNTAX";
  if (facts.licenseMd === undefined)
    return checkPassed(code, ["No LICENSE.md to check."]);
  if (!COPYRIGHT_YEAR.test(facts.licenseMd))
    return checkPassed(code, [
      "No copyright line in LICENSE.md (absence is 4.1b's check).",
    ]);
  const line = firstMatchingLine(facts.licenseMd, COPYRIGHT_YEAR);
  if (COPYRIGHT_SYNTAX.test(facts.licenseMd))
    return checkPassed(code, line ? ["File: LICENSE.md", `Found: "${line}"`] : []);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_COPYRIGHT_SYNTAX",
      file: "LICENSE.md",
      message:
        "The LICENSE.md copyright line does not follow the `Copyright (C) <year> <holder>` syntax." +
        (line ? ` Found: "${line}"` : ""),
      hint: "Rewrite the copyright line as `Copyright (C) <year> <holder>`.",
    }),
  ]);
}

/**
 * 4.6b — a copyright year is embedded in the .kmn or .kps copyright
 * strings (years belong in LICENSE.md / HISTORY.md, not in the
 * compiled artifacts' metadata).
 */
export function checkCopyrightYearEmbedded(
  facts: TextContentFacts,
): CheckResult {
  const code = "KM_LINT_COPYRIGHT_YEAR_EMBEDDED";
  if (facts.kmn === undefined && facts.kps === undefined)
    return checkPassed(code, ["No .kmn or .kps to check."]);
  const hits: string[] = [];
  let offending: string | undefined;
  if (facts.kmn !== undefined && COPYRIGHT_YEAR.test(facts.kmn)) {
    hits.push("the .kmn");
    offending ??= firstMatchingLine(facts.kmn, COPYRIGHT_YEAR);
  }
  if (facts.kps !== undefined) {
    const copyrightEl = /<Copyright[^>]*>([^<]*)<\/Copyright>/i.exec(facts.kps);
    if (copyrightEl !== null && /\d{4}/.test(copyrightEl[1] ?? "")) {
      hits.push("the .kps");
      offending ??= copyrightEl[0].trim();
    }
  }
  if (hits.length === 0)
    return checkPassed(code, ["No copyright year in .kmn or .kps."]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_COPYRIGHT_YEAR_EMBEDDED",
      file: facts.kps !== undefined ? "package" : "source",
      message:
        `A copyright year is embedded in ${hits.join(" and ")} copyright strings.` +
        (offending ? ` Found: "${offending}"` : ""),
      hint: "Remove the year from the .kmn/.kps copyright strings — years live in LICENSE.md and HISTORY.md.",
    }),
  ]);
}

/**
 * 5.2b — a version number is embedded in README.md, readme.htm,
 * welcome.htm, or the help .php. Heuristic: any X.Y[.Z] pattern — a
 * warning-level lint, not a proof.
 */
export function checkVersionInDocs(facts: TextContentFacts): CheckResult {
  const code = "KM_LINT_VERSION_IN_DOCS";
  const docs: Array<[string, string | undefined]> = [
    ["README.md", facts.readmeMd],
    ["source/readme.htm", facts.readmeHtm],
    ["source/welcome.htm", facts.welcomeHtm],
    [facts.phpPath ?? "help .php", facts.php],
  ];
  // Strip HTML tags: a version in markup (e.g. <meta>) is not a hardcoded
  // version in the visible documentation text.
  const stripTags = (t: string) => t.replace(/<[^>]*>/g, " ");
  const hits = docs.filter(
    ([, text]) => text !== undefined && VERSION_LIKE.test(stripTags(text)),
  );
  const present = docs.filter(([, t]) => t !== undefined).map(([n]) => n);
  if (hits.length === 0) {
    if (present.length === 0)
      return checkPassed(code, ["No documentation files to check."]);
    return checkPassed(code, [`Checked: ${present.join(", ")}.`]);
  }
  const versionMatch = stripTags(hits[0]![1]!).match(VERSION_LIKE);
  const version = versionMatch ? versionMatch[0] : "";
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_VERSION_IN_DOCS",
      file: hits[0]![0],
      message:
        `A version number is embedded in ${hits.map(([n]) => n).join(", ")} — versions go stale in docs.` +
        (version ? ` Found: "${version}"` : ""),
      hint: "Remove the hardcoded version from the documentation; the package version is the single source of truth.",
    }),
  ]);
}

/** 5.3b — a copyright year/statement is in README.md, readme.htm, or welcome.htm. */
export function checkCopyrightInDocs(facts: TextContentFacts): CheckResult {
  const code = "KM_LINT_COPYRIGHT_IN_DOCS";
  const docs: Array<[string, string | undefined]> = [
    ["README.md", facts.readmeMd],
    ["source/readme.htm", facts.readmeHtm],
    ["source/welcome.htm", facts.welcomeHtm],
  ];
  const hits = docs.filter(
    ([, text]) => text !== undefined && COPYRIGHT_YEAR.test(text),
  );
  if (hits.length === 0) {
    if (docs.every(([, t]) => t === undefined))
      return checkPassed(code, ["No documentation files to check."]);
    return checkPassed(code, [
      "No copyright statement in the documentation.",
    ]);
  }
  const line = firstMatchingLine(hits[0]![1]!, COPYRIGHT_YEAR);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_COPYRIGHT_IN_DOCS",
      file: hits[0]![0],
      message:
        `A copyright statement is embedded in ${hits.map(([n]) => n).join(", ")}.` +
        (line ? ` Found: "${line}"` : ""),
      hint: "Remove the copyright statement from the documentation — it belongs in LICENSE.md.",
    }),
  ]);
}

/** 5.5b — README.md does not link to https://keyman.com/keyboards/<id>. */
export function checkReadmeKeymanLinkAbsent(
  facts: TextContentFacts,
): CheckResult {
  const code = "KM_LINT_README_KEYMAN_LINK_ABSENT";
  if (facts.readmeMd === undefined)
    return checkPassed(code, ["No README.md to check."]);
  const want = `https://keyman.com/keyboards/${facts.keyboardId}`.toLowerCase();
  if (facts.readmeMd.toLowerCase().includes(want))
    return checkPassed(code, ["File: README.md", `Found: ${want}`]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_README_KEYMAN_LINK_ABSENT",
      file: "README.md",
      message: `README.md does not link to https://keyman.com/keyboards/${facts.keyboardId}.`,
      hint: `Add a link to https://keyman.com/keyboards/${facts.keyboardId} in README.md.`,
    }),
  ]);
}

/** 5.6b — README.md does not link to http(s)://help.keyman.com/keyboard/<id>. */
export function checkReadmeHelpLinkAbsent(
  facts: TextContentFacts,
): CheckResult {
  const code = "KM_LINT_README_HELP_LINK_ABSENT";
  if (facts.readmeMd === undefined)
    return checkPassed(code, ["No README.md to check."]);
  const lowered = facts.readmeMd.toLowerCase();
  const id = facts.keyboardId.toLowerCase();
  const http = `http://help.keyman.com/keyboard/${id}`;
  const https = `https://help.keyman.com/keyboard/${id}`;
  if (lowered.includes(http) || lowered.includes(https)) {
    const found = lowered.includes(https) ? https : http;
    return checkPassed(code, ["File: README.md", `Found: ${found}`]);
  }
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_README_HELP_LINK_ABSENT",
      file: "README.md",
      message: `README.md does not link to http://help.keyman.com/keyboard/${facts.keyboardId}.`,
      hint: `Add a link to http://help.keyman.com/keyboard/${facts.keyboardId} in README.md.`,
    }),
  ]);
}

/**
 * 6.6b — the welcome.htm `<html lang>` does not match the keyboard's
 * primary BCP47 tag.
 */
export function checkWelcomeLangMismatch(
  facts: TextContentFacts,
): CheckResult {
  const code = "KM_LINT_WELCOME_LANG_MISMATCH";
  if (facts.welcomeHtm === undefined)
    return checkPassed(code, ["No welcome.htm to check."]);
  if (facts.primaryBcp47 === undefined)
    return checkPassed(code, ["Primary BCP47 tag unknown."]);
  const m = HTML_LANG.exec(facts.welcomeHtm);
  const lang = (m?.[1] ?? "").trim().toLowerCase();
  if (lang === facts.primaryBcp47.toLowerCase())
    return checkPassed(code, [
      "File: source/welcome.htm",
      `welcome.htm <html lang="${m?.[1]}"> matches "${facts.primaryBcp47}".`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_WELCOME_LANG_MISMATCH",
      file: "source/welcome.htm",
      message:
        lang === ""
          ? "welcome.htm has no <html lang> attribute."
          : `welcome.htm <html lang="${m?.[1]}"> does not match the keyboard's primary BCP47 tag "${facts.primaryBcp47}".`,
      hint: `Set <html lang="${facts.primaryBcp47}"> in welcome.htm.`,
    }),
  ]);
}

/** 7.11b — the author name is in a .kmn Author store (it belongs in the .kps). */
export function checkAuthorInKmn(facts: TextContentFacts): CheckResult {
  const code = "KM_LINT_AUTHOR_IN_KMN";
  if (facts.kmn === undefined)
    return checkPassed(code, ["No .kmn to check."]);
  if (!KMN_AUTHOR_STORE.test(facts.kmn))
    return checkPassed(code, ["No store(&Author) in the .kmn."]);
  const line = firstMatchingLine(facts.kmn, KMN_AUTHOR_STORE);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_AUTHOR_IN_KMN",
      file: `source/${facts.keyboardId}.kmn`,
      message:
        "The author name is in a .kmn Author store — it belongs in the .kps." +
        (line ? ` Found: "${line}"` : ""),
      hint: "Remove the store(&Author) from the .kmn; set the author in the .kps Info tab.",
    }),
  ]);
}

/**
 * 11.1b — the help .php is absent, or present without a proper PHP
 * header (the `<?php` open tag plus a `Name:` header comment block).
 * Existence is part of the criterion, so absence is the finding
 * (not a missing input).
 */
export function checkPhpHeaderBad(facts: TextContentFacts): CheckResult {
  const code = "KM_LINT_PHP_HEADER_BAD";
  const phpFile = facts.phpPath ?? "source/help/" + facts.keyboardId + ".php";
  if (facts.php === undefined) {
    return checkFailed(code, [
      criteriaFinding({
        code: "KM_LINT_PHP_HEADER_BAD",
        file: phpFile,
        message: "No <name>.php help file found.",
        hint:
          "Add source/help/" + facts.keyboardId + ".php with the standard PHP header.",
      }),
    ]);
  }
  // Strip a BOM before checking the open tag.
  const text = facts.php.replace(/^\ufeff/, "");
  if (PHP_OPEN.test(text) && PHP_HEADER_BLOCK.test(text))
    return checkPassed(code, [`File: ${phpFile}`, `Found: ${phpFile} with PHP header.`]);
  const firstLine = text.split("\n")[0]?.trim();
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_PHP_HEADER_BAD",
      file: phpFile,
      message:
        "The help .php does not have the proper PHP header." +
        (firstLine ? ` First line: "${firstLine}"` : ""),
      hint: "Start the .php with <?php and the /* Name: ... */ header block.",
    }),
  ]);
}

/** 11.3b — style information (<style> tags) is outside the PHP header block. */
export function checkPhpStyleOutside(facts: TextContentFacts): CheckResult {
  const code = "KM_LINT_PHP_STYLE_OUTSIDE";
  if (facts.php === undefined)
    return checkPassed(code, ["No .php file to check."]);
  const phpFile = facts.phpPath ?? "source/help/" + facts.keyboardId + ".php";
  // Everything after the closing ?> is outside the PHP header.
  const closeIdx = facts.php.indexOf("?>");
  const outside = closeIdx >= 0 ? facts.php.slice(closeIdx + 2) : facts.php;
  if (!/<style[\s>]/i.test(outside))
    return checkPassed(code, [`File: ${phpFile}`, "No <style> outside the PHP header block."]);
  const line = firstMatchingLine(outside, /<style[\s>]/i);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_PHP_STYLE_OUTSIDE",
      file: phpFile,
      message:
        "Style information (<style>) is outside the PHP header block." +
        (line ? ` Found: "${line}"` : ""),
      hint: "Move style information inside the PHP header block (the $pagestyle variable).",
    }),
  ]);
}

/** 11.4b — the help .php contains closing </body> or </html> tags. */
export function checkPhpClosingTags(facts: TextContentFacts): CheckResult {
  const code = "KM_LINT_PHP_CLOSING_TAGS";
  if (facts.php === undefined)
    return checkPassed(code, ["No .php file to check."]);
  const phpFile = facts.phpPath ?? "source/help/" + facts.keyboardId + ".php";
  if (!/<\/(body|html)\s*>/i.test(facts.php))
    return checkPassed(code, [`File: ${phpFile}`, "No closing </body> or </html> tags."]);
  const line = firstMatchingLine(facts.php, /<\/(body|html)\s*>/i);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_PHP_CLOSING_TAGS",
      file: phpFile,
      message:
        "The help .php contains closing </body> or </html> tags." +
        (line ? ` Found: "${line}"` : ""),
      hint: "Remove the closing </body> / </html> tags — the site template supplies them.",
    }),
  ]);
}

/** Run all twelve text-content checks over one judged text set. */
export function checkTextContent(
  facts: TextContentFacts,
): ReturnType<typeof mergeResults> {
  return mergeResults(
    checkCopyrightAbsent(facts),
    checkCopyrightSyntax(facts),
    checkCopyrightYearEmbedded(facts),
    checkVersionInDocs(facts),
    checkCopyrightInDocs(facts),
    checkReadmeKeymanLinkAbsent(facts),
    checkReadmeHelpLinkAbsent(facts),
    checkWelcomeLangMismatch(facts),
    checkAuthorInKmn(facts),
    checkPhpHeaderBad(facts),
    checkPhpStyleOutside(facts),
    checkPhpClosingTags(facts),
  );
}

/**
 * The twelve text-content twin codes, for the assembly's contextMissing.
 * 11.1b (KM_LINT_PHP_HEADER_BAD) is NOT here — the .php's existence is
 * the criterion, so absence is a finding, never a missing input.
 */
export const TEXT_CONTENT_CODES = [
  "KM_LINT_COPYRIGHT_ABSENT",
  "KM_LINT_COPYRIGHT_SYNTAX",
  "KM_LINT_COPYRIGHT_YEAR_EMBEDDED",
  "KM_LINT_VERSION_IN_DOCS",
  "KM_LINT_COPYRIGHT_IN_DOCS",
  "KM_LINT_README_KEYMAN_LINK_ABSENT",
  "KM_LINT_README_HELP_LINK_ABSENT",
  "KM_LINT_WELCOME_LANG_MISMATCH",
  "KM_LINT_AUTHOR_IN_KMN",
  "KM_LINT_PHP_STYLE_OUTSIDE",
  "KM_LINT_PHP_CLOSING_TAGS",
] as const;

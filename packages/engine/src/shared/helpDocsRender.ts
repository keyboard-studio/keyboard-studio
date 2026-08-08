// helpDocsRender — turn a keyboard's Phase F help-docs answers plus its
// design-derived metadata (display name, primary BCP47 tag, TARGETS platform
// list, keyboard id) into the four shipped documentation files (spec 061).
//
// Pure functions only: no VFS access, no store reads. `projectWorkingCopyForOutput`
// (the shared output projection, spec 061 D-03) and `useDocsPreview` (Story 2's
// synchronous preview) are the two callers, so both the download path and the
// in-studio preview render from one implementation and cannot visibly disagree
// (FR-005/FR-010).
//
// `welcome.htm` and `help/<id>.php` share ONE rendered body (buildDocSections +
// renderDocBodyHtml below) — a structural guarantee of FR-005 parity, not a
// style preference (research D-02). `README.md`/`readme.htm` follow a
// deliberately narrower shape per docs/keyboard-documentation-plan.md's write
// order (description, links, platforms only) — the opt-in battery and the
// default-path extras (usage tips, credits, contact) are welcome/help-page
// content, never README content.

import type { HelpDocsAnswers } from "@keyboard-studio/contracts";
import { escapeHtml, phpCommentEscape } from "./escapeHtml.js";
import { welcomeHtm, readmeHtm } from "./packageDocs.js";

export interface DocSection {
  heading: string;
  /** Already HTML-escaped for the .htm/.php callers; plain text for the README caller. */
  body: string;
}

export interface HelpDocsRenderInput {
  /** `null` → placeholder fallback (research D-04); every render path is total. */
  answers: HelpDocsAnswers | null;
  displayName: string;
  primaryBcp47?: string;
  platforms: string[];
  keyboardId: string;
}

// Opt-in "additional detail" battery (FR-011/FR-014), fixed order per research D-10.
const OPT_IN_FIELDS: ReadonlyArray<{ key: keyof HelpDocsAnswers; heading: string }> = [
  { key: "designRationale", heading: "Design Rationale" },
  { key: "fontGuidance", heading: "Font Guidance" },
  { key: "canonicalOrder", heading: "Canonical Order" },
  { key: "scriptGlossary", heading: "Script Glossary" },
  { key: "exampleWords", heading: "Example Words" },
  { key: "scopeVariety", heading: "Scope & Variety" },
  { key: "provenanceBasis", heading: "Provenance" },
  { key: "troubleshooting", heading: "Troubleshooting" },
  { key: "knownLimitations", heading: "Known Limitations" },
  { key: "relatedKeyboards", heading: "Related Keyboards" },
  { key: "furtherReading", heading: "Further Reading" },
];
const OPT_IN_HEADINGS: ReadonlySet<string> = new Set(OPT_IN_FIELDS.map((f) => f.heading));
const USAGE_TIPS_HEADING = "Usage Tips";
const ADDITIONAL_DETAIL_HEADING = "Additional Detail";
const MERGE_BOUNDARY_COMMENT = "<!-- Keyboard Studio additions -->";
const MERGE_BOUNDARY_HEADING = "Keyboard Studio Additions";

function nonBlank(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t !== undefined && t !== "" ? t : undefined;
}

/**
 * The welcome-page / help-page section list: usage tips, credits, contact,
 * then the opt-in battery — each independently omitted when blank (FR-003,
 * FR-011). Never includes the description itself (the caller renders that as
 * the lead paragraph) and never anything README-only (links, platforms).
 */
export function buildDocSections(answers: HelpDocsAnswers | null): DocSection[] {
  if (answers === null) return [];
  const sections: DocSection[] = [];

  const tips = answers.usageTips.map((t) => t.trim()).filter((t) => t !== "");
  if (tips.length > 0) {
    sections.push({ heading: USAGE_TIPS_HEADING, body: tips.join("\n") });
  }
  const credits = nonBlank(answers.credits);
  if (credits !== undefined) sections.push({ heading: "Credits", body: credits });
  const contactInfo = nonBlank(answers.contactInfo);
  if (contactInfo !== undefined) sections.push({ heading: "Contact", body: contactInfo });

  for (const { key, heading } of OPT_IN_FIELDS) {
    const raw = answers[key];
    if (typeof raw !== "string") continue;
    const value = nonBlank(raw);
    if (value !== undefined) sections.push({ heading, body: value });
  }
  return sections;
}

/** One section's HTML, escaping its free-text body (D-07). Usage tips render as a list. */
function renderSectionHtml(section: DocSection): string {
  const heading = `<h2>${escapeHtml(section.heading)}</h2>`;
  if (section.heading === USAGE_TIPS_HEADING) {
    const items = section.body
      .split("\n")
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("");
    return `${heading}<ul>${items}</ul>`;
  }
  const paragraphs = section.body
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  return `${heading}${paragraphs}`;
}

/** The full section list's HTML, inserting the "Additional Detail" grouping heading once, before the first opt-in section (T028/D-10) — omitted entirely when no opt-in answer was given. */
function renderSectionsHtml(sections: DocSection[]): string {
  const parts: string[] = [];
  let announcedAdditionalDetail = false;
  for (const section of sections) {
    if (OPT_IN_HEADINGS.has(section.heading) && !announcedAdditionalDetail) {
      parts.push(`<h2>${escapeHtml(ADDITIONAL_DETAIL_HEADING)}</h2>`);
      announcedAdditionalDetail = true;
    }
    parts.push(renderSectionHtml(section));
  }
  return parts.join("\n");
}

/**
 * The ONE rendered body shared by welcome.htm and help/<id>.php (FR-005): the
 * description paragraph plus every answered section. Both callers pass this
 * exact string through to their own document/merge wrapper — that identity is
 * the structural parity guarantee, not a byte-comparison after the fact.
 */
function renderDocBodyHtml(answers: HelpDocsAnswers | null, description: string): string {
  const parts = [`<p>${escapeHtml(description)}</p>`];
  const sectionsHtml = renderSectionsHtml(buildDocSections(answers));
  if (sectionsHtml !== "") parts.push(sectionsHtml);
  return parts.join("\n");
}

/** Set (or insert) the `<html lang="...">` attribute (FR-006). No-op when `lang` is absent/blank. */
function setHtmlLang(htmlText: string, lang: string | undefined): string {
  const value = nonBlank(lang);
  if (value === undefined) return htmlText;
  const escaped = escapeHtml(value);
  if (/<html\b[^>]*\blang\s*=/i.test(htmlText)) {
    return htmlText.replace(
      /<html\b([^>]*)\blang\s*=\s*(["'])[^"']*\2/i,
      (_m, pre: string) => `<html${pre}lang="${escaped}"`,
    );
  }
  return htmlText.replace(/<html\b/i, `<html lang="${escaped}"`);
}

/**
 * FR-013: preserve a fetched base's original body verbatim, appending the
 * newly-rendered content below a clearly delineated boundary rather than
 * interleaving into the original prose (research D-05). Inserted just before
 * `</body>` when present, so the base's own document structure survives.
 */
function mergeWithBase(baseText: string, newBodyHtml: string): string {
  const addition = `${MERGE_BOUNDARY_COMMENT}\n<h2>${escapeHtml(MERGE_BOUNDARY_HEADING)}</h2>\n${newBodyHtml}`;
  const closingBodyIdx = baseText.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIdx === -1) {
    return `${baseText}\n${addition}`;
  }
  return `${baseText.slice(0, closingBodyIdx)}${addition}\n${baseText.slice(closingBodyIdx)}`;
}

function buildFreshHtmlDoc(bodyHtml: string, lang: string | undefined): string {
  const langAttr = nonBlank(lang) !== undefined ? ` lang="${escapeHtml(lang as string)}"` : "";
  return `<html${langAttr}><body>${bodyHtml}</body></html>`;
}

/** `README.md` — package-listing description, links, and supported platforms. No version/copyright (FR-007). */
export function renderReadmeMd(input: HelpDocsRenderInput): string {
  const { answers, displayName, platforms } = input;
  const description = answers !== null ? nonBlank(answers.description) : undefined;
  if (description === undefined) {
    // FR-002 fallback — byte-identical to today's bare scaffolder stub.
    return `# ${displayName}\n`;
  }

  const lines: string[] = [`# ${displayName}`, "", description];

  const homeUrl = nonBlank(answers?.projectHomeUrl);
  const helpUrl = nonBlank(answers?.projectHelpUrl);
  if (homeUrl !== undefined || helpUrl !== undefined) {
    lines.push("", "## Links");
    if (homeUrl !== undefined) lines.push(`- Keyboard homepage: ${homeUrl}`);
    if (helpUrl !== undefined) lines.push(`- Online help: ${helpUrl}`);
  }

  if (platforms.length > 0) {
    lines.push("", "## Supported Platforms");
    for (const p of platforms) lines.push(`- ${p}`);
  }

  return `${lines.join("\n")}\n`;
}

/** `source/readme.htm` — the same description, condensed for the package-details popup. */
export function renderReadmeHtm(input: HelpDocsRenderInput): string {
  const { answers, displayName } = input;
  const description = answers !== null ? nonBlank(answers.description) : undefined;
  if (description === undefined) {
    // FR-002 fallback — byte-identical to today's scaffolder/packageDocs stub.
    return readmeHtm(displayName);
  }
  return `<html><body><h1>${escapeHtml(displayName)}</h1><p>${escapeHtml(description)}</p></body></html>`;
}

/** `source/welcome.htm` — the first-run page. Merges with the base's own welcome.htm when one was fetched (FR-013). */
export function renderWelcomeHtm(
  input: HelpDocsRenderInput,
  baseWelcomeHtmText: string | null,
): string {
  const { answers, displayName, primaryBcp47 } = input;
  const description = answers !== null ? nonBlank(answers.description) : undefined;
  if (description === undefined) {
    // FR-002 fallback — byte-identical to today's placeholder. Never merged
    // with a base even when one was fetched: there is nothing authored yet.
    return welcomeHtm(displayName);
  }

  const bodyHtml = renderDocBodyHtml(answers, description);
  const doc =
    baseWelcomeHtmText !== null
      ? mergeWithBase(baseWelcomeHtmText, bodyHtml)
      : buildFreshHtmlDoc(bodyHtml, primaryBcp47);
  return setHtmlLang(doc, primaryBcp47);
}

/** `source/help/<id>.php` — the online help page. Merges with the base's own help page when one was fetched (FR-013). */
export function renderHelpPhp(
  input: HelpDocsRenderInput,
  baseHelpPhpText: string | null,
): string {
  const { answers, displayName, primaryBcp47 } = input;
  const description = answers !== null ? nonBlank(answers.description) : undefined;
  if (description === undefined) {
    // FR-002 fallback — byte-identical to today's scaffolder stub.
    return `<?php /* ${phpCommentEscape(displayName)} help */ ?>`;
  }

  const bodyHtml = renderDocBodyHtml(answers, description);
  const doc =
    baseHelpPhpText !== null
      ? mergeWithBase(baseHelpPhpText, bodyHtml)
      : buildFreshHtmlDoc(bodyHtml, primaryBcp47);
  return setHtmlLang(doc, primaryBcp47);
}

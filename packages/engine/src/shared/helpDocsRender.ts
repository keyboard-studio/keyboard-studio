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
import { escapeHtml } from "./escapeHtml.js";
import { welcomeHtm, readmeHtm, helpSiteHeader, helpPhpStub } from "./packageDocs.js";
import { layoutChartPlatformFromFilename } from "../layout-chart/filename.js";

export { helpSiteHeader, helpSitePageName, helpPhpStub } from "./packageDocs.js";

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

/** Insert `addition` just before `</body>` when present, else append below (shared by {@link mergeWithBase} and the FR-006/T051 image-only append path). */
function insertBeforeClosingBody(html: string, addition: string): string {
  const closingBodyIdx = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIdx === -1) {
    return `${html}\n${addition}`;
  }
  return `${html.slice(0, closingBodyIdx)}${addition}\n${html.slice(closingBodyIdx)}`;
}

/**
 * FR-013: preserve a fetched base's original body verbatim, appending the
 * newly-rendered content below a clearly delineated boundary rather than
 * interleaving into the original prose (research D-05). Inserted just before
 * `</body>` when present, so the base's own document structure survives.
 */
function mergeWithBase(baseText: string, newBodyHtml: string): string {
  const addition = `${MERGE_BOUNDARY_COMMENT}\n<h2>${escapeHtml(MERGE_BOUNDARY_HEADING)}</h2>\n${newBodyHtml}`;
  return insertBeforeClosingBody(baseText, addition);
}

function buildFreshHtmlDoc(bodyHtml: string, lang: string | undefined): string {
  const langAttr = nonBlank(lang) !== undefined ? ` lang="${escapeHtml(lang as string)}"` : "";
  return `<html${langAttr}><body>${bodyHtml}</body></html>`;
}

const KEYBOARD_LAYOUT_HEADING = "Keyboard Layout";

/**
 * A layout image's `alt` text from its file name: `desktop_layout_shift.png` →
 * `desktop layout shift`. Generated charts and hand-drawn base images alike get
 * a programmatic name rather than an empty alt (docs/accessibility.md).
 */
function layoutImageAlt(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const words = stem.replace(/^ks-layout-/, "").replace(/[-_]+/g, " ").trim();
  return words !== "" ? words : stem;
}

/** Platform grouping order for the layout section (spec 076 T051): generated desktop/phone/tablet charts first, then anything else (a base's own hand-authored images). */
const LAYOUT_SECTION_GROUPS = ["desktop", "phone", "tablet", "other"] as const;
type LayoutSectionGroup = (typeof LAYOUT_SECTION_GROUPS)[number];

const LAYOUT_SECTION_GROUP_LABEL: Readonly<Record<LayoutSectionGroup, string>> = {
  desktop: "Desktop",
  phone: "Phone",
  tablet: "Tablet",
  other: "Other",
};

/** Bucket `files` by the platform encoded in a generated chart filename (see `layoutChartPlatformFromFilename`), falling back to `"other"` for a base's free-form image names. Preserves each file's relative order within its own bucket. */
function groupWelcomeImageFiles(files: readonly string[]): ReadonlyMap<LayoutSectionGroup, string[]> {
  const groups = new Map<LayoutSectionGroup, string[]>(LAYOUT_SECTION_GROUPS.map((g) => [g, []]));
  for (const file of files) {
    const group = layoutChartPlatformFromFilename(file) ?? "other";
    groups.get(group)!.push(file);
  }
  return groups;
}

/**
 * The welcome page's "Keyboard Layout" section (spec 076 FR-004/T051, research
 * R9): every file shipped beside the page in `source/welcome/` — the inherited
 * base images on a Track 1 copy, the generated charts otherwise — grouped by
 * platform (desktop, phone, tablet, then any other/base image) with no
 * omission regardless of how many layers/files there are. The `src` is the
 * bare file name because the page and the images share a folder. `""` when
 * there is nothing to show, so a page with no images is byte-identical to the
 * pre-076 render. Welcome-page only: the help page's body never carries it,
 * which is the one permitted welcome/help difference on the welcome side
 * (FR-004).
 */
export function renderWelcomeLayoutSection(welcomeImageFiles: readonly string[]): string {
  const files = welcomeImageFiles.map((f) => f.trim()).filter((f) => f !== "");
  if (files.length === 0) return "";
  const groups = groupWelcomeImageFiles(files);
  const groupsHtml = LAYOUT_SECTION_GROUPS.filter((g) => (groups.get(g) ?? []).length > 0)
    .map((g) => {
      const images = (groups.get(g) ?? [])
        .map((f) => `<p><img src="${escapeHtml(f)}" alt="${escapeHtml(layoutImageAlt(f))}"></p>`)
        .join("");
      return `<h3>${escapeHtml(LAYOUT_SECTION_GROUP_LABEL[g])}</h3>${images}`;
    })
    .join("");
  return `<h2>${escapeHtml(KEYBOARD_LAYOUT_HEADING)}</h2>${groupsHtml}`;
}

/**
 * The distinct relative `<img src>` targets of a welcome page, in document
 * order (spec 076 contracts/engine-api.md). Scheme-qualified, protocol-
 * relative, root-anchored and `data:` sources are skipped — only files the
 * package would have to ship count. A leading `./` is dropped. Used by the
 * projection to compute `missingInheritedImages` (a base page that references
 * an image the base does not list) and by the classifier's layout-section strip.
 */
export function extractWelcomeImageRefs(welcomeHtml: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  const imgRe = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(welcomeHtml)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (raw === "") continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//") || raw.startsWith("/")) continue;
    const rel = raw.replace(/^\.\//, "");
    if (rel === "" || seen.has(rel)) continue;
    seen.add(rel);
    refs.push(rel);
  }
  return refs;
}

/** `files` with every entry already referenced by `baseHtml`'s own `<img>` tags removed (spec 076 T051: append the layout section only for supplied files the base does not already reference). */
function filesNotReferencedIn(files: readonly string[], baseHtml: string): string[] {
  const referenced = new Set(extractWelcomeImageRefs(baseHtml));
  return files.map((f) => f.trim()).filter((f) => f !== "" && !referenced.has(f));
}

/** Strip all trailing whitespace/newlines from `s` and add back exactly one. */
function withOneTrailingNewline(s: string): string {
  return `${s.replace(/\s+$/, "")}\n`;
}

/** The description/Links/Supported-Platforms body `renderReadmeMd` shares between the fresh-title path and the FR-006 base-inheritance path, WITHOUT the `# title` heading. */
function buildReadmeBody(input: HelpDocsRenderInput, description: string): string {
  const { answers, platforms } = input;
  const lines: string[] = [description];

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

  return lines.join("\n");
}

/**
 * `README.md` — package-listing description, links, and supported platforms.
 * No version/copyright (FR-007).
 *
 * @param baseReadmeMdText spec 076 FR-006: a fetched base's own `README.md`,
 *   inherited even before the author has answered anything. `null` keeps
 *   today's byte-identical behaviour (the bare `# title` stub, or the
 *   title + description/links/platforms once answered). Non-null: no
 *   description yet -> the base text verbatim (one trailing newline); a
 *   description answered -> the base text, one blank line, then the tool's
 *   own sections WITHOUT a second `# title` heading (the base already has one).
 */
export function renderReadmeMd(
  input: HelpDocsRenderInput,
  baseReadmeMdText: string | null = null,
): string {
  const { displayName } = input;
  const description = input.answers !== null ? nonBlank(input.answers.description) : undefined;

  if (baseReadmeMdText !== null) {
    if (description === undefined) return withOneTrailingNewline(baseReadmeMdText);
    return `${baseReadmeMdText.replace(/\s+$/, "")}\n\n${buildReadmeBody(input, description)}\n`;
  }

  if (description === undefined) {
    // FR-002 fallback — byte-identical to today's bare scaffolder stub.
    return `# ${displayName}\n`;
  }

  return `# ${displayName}\n\n${buildReadmeBody(input, description)}\n`;
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

/**
 * `source/welcome/welcome.htm` — the first-run page. Merges with the base's own
 * welcome page when one was fetched (FR-013); inherits it verbatim even before
 * anything is authored (FR-006).
 *
 * @param welcomeImageFiles bare names of the image files shipped beside the page
 *   (spec 076 FR-004/R9/T051) — rendered as a grouped "Keyboard Layout" section.
 *   On a FRESH page (no base) every file is listed. On a page merged with (or
 *   inherited from) a base, only files the base does NOT already reference are
 *   listed (via `extractWelcomeImageRefs`), so a carried image is never shown
 *   twice.
 */
export function renderWelcomeHtm(
  input: HelpDocsRenderInput,
  baseWelcomeHtmText: string | null,
  welcomeImageFiles: readonly string[] = [],
): string {
  const { answers, displayName, primaryBcp47 } = input;
  const description = answers !== null ? nonBlank(answers.description) : undefined;
  const unlistedFiles =
    baseWelcomeHtmText !== null
      ? filesNotReferencedIn(welcomeImageFiles, baseWelcomeHtmText)
      : welcomeImageFiles;
  const layoutSection = renderWelcomeLayoutSection(unlistedFiles);

  if (description === undefined) {
    if (baseWelcomeHtmText !== null) {
      // FR-006: inherit the base page even before anything is authored —
      // never the tool placeholder once a base welcome page exists.
      if (layoutSection === "") return baseWelcomeHtmText;
      return insertBeforeClosingBody(baseWelcomeHtmText, layoutSection);
    }
    // FR-002 fallback — byte-identical to today's placeholder when there are
    // no images to reference. With images (a Track 1 copy of an illustrated
    // base, produced before Phase F) the placeholder still references them,
    // so the carried files are never orphaned.
    if (layoutSection === "") return welcomeHtm(displayName);
    return `<html><body><p>Welcome to ${escapeHtml(displayName)}</p>${layoutSection}</body></html>`;
  }

  const bodyHtml = renderDocBodyHtml(answers, description);
  const bodyWithLayout = layoutSection === "" ? bodyHtml : `${bodyHtml}\n${layoutSection}`;
  const doc =
    baseWelcomeHtmText !== null
      ? mergeWithBase(baseWelcomeHtmText, bodyWithLayout)
      : buildFreshHtmlDoc(bodyWithLayout, primaryBcp47);
  return setHtmlLang(doc, primaryBcp47);
}

/**
 * `source/help/<id>.php` — the online help page. Merges with the base's own help
 * page when one was fetched (FR-013); a base page keeps its own header and is
 * never given a second one. Inherits the base page verbatim even before
 * anything is authored (FR-006). A FRESH page (no base help text) opens with
 * the standard help-site header (spec 076 FR-003) above the same body
 * welcome.htm renders — the header is the one permitted difference between
 * the two on the help side (spec 076 FR-004).
 */
export function renderHelpPhp(
  input: HelpDocsRenderInput,
  baseHelpPhpText: string | null,
): string {
  const { answers, displayName, primaryBcp47 } = input;
  const description = answers !== null ? nonBlank(answers.description) : undefined;
  if (description === undefined) {
    // FR-006: inherit the base help page even before anything is authored.
    if (baseHelpPhpText !== null) return baseHelpPhpText;
    // FR-002 fallback — byte-identical to the scaffolder stub: standard header
    // + the bare placeholder comment (spec 076 US1-3: an early production's
    // help page still renders on the help site).
    return helpPhpStub(displayName);
  }

  const bodyHtml = renderDocBodyHtml(answers, description);
  if (baseHelpPhpText !== null) {
    return setHtmlLang(mergeWithBase(baseHelpPhpText, bodyHtml), primaryBcp47);
  }
  return `${helpSiteHeader(displayName)}${setHtmlLang(buildFreshHtmlDoc(bodyHtml, primaryBcp47), primaryBcp47)}`;
}

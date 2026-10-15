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
// Every file is rendered from its content-owned form (spec 102, `DOC_FORMS`
// in @keyboard-studio/contracts) by `renderDocForm`; this module computes the
// slot values, escaped per target file, and owns the Track 2 splice.
// `welcome.htm` and `help/<id>.php` both render the ONE `body` form — a
// structural guarantee of FR-005 parity, not a style preference (research
// D-02). `README.md`/`readme.htm` follow a deliberately narrower shape
// (description, links, platforms only): the opt-in battery, the default-path
// extras and the derived sections are welcome/help-page content, never README
// content.
//
// Track 2 (a start keyboard's own page was fetched) keeps that page as the
// start of the document and adds the generated sections after it, between
// DOC_GENERATED_START/END. Any earlier generated block in the inherited page
// is stripped first, so re-rendering never stacks blocks (spec 102 FR-033).

import { DOC_FORMS, scriptSubtagOf, type HelpDocsAnswers } from "@keyboard-studio/contracts";
import { escapeHtml, phpSingleQuoteEscape } from "./escapeHtml.js";
import { DOC_PAGE_STYLE, helpSiteHeader, helpSitePageName } from "./packageDocs.js";
import {
  layoutChartLayerFromFilename,
  layoutChartPlatformFromFilename,
} from "../layout-chart/filename.js";
import {
  DOC_GENERATED_END,
  DOC_GENERATED_START,
  escapeDocHtml,
  escapeDocMarkdown,
  stripGeneratedBlocks,
  type DocSlotModel,
} from "./docSlots.js";
import { renderDocForm } from "./renderDocForm.js";

export { helpSiteHeader, helpSitePageName, helpPhpStub } from "./packageDocs.js";

export interface DocSection {
  heading: string;
  /** Already HTML-escaped for the .htm/.php callers; plain text for the README caller. */
  body: string;
}

/** The derived sections the studio's `buildDocContent` supplies, already escaped for the .htm/.php forms. */
export type GeneratedDocSlots = Pick<
  DocSlotModel,
  "typingGuide" | "mechanisms" | "layoutPictures" | "touchNotes" | "characterInventory"
>;

export interface HelpDocsRenderInput {
  /** `null` → no answers yet; the forms still render a complete document (spec 102 FR-030). */
  answers: HelpDocsAnswers | null;
  displayName: string;
  primaryBcp47?: string;
  /**
   * The language's English name as the author confirmed it at the identity
   * step (IdentityPatch.languageName). Feeds the intro language/script line
   * alongside `primaryBcp47`; absent means the line is omitted — the
   * renderer never guesses a language name.
   */
  languageName?: string;
  platforms: string[];
  /** The keyboard id; when set, the README and readme.htm link the keyboard's help-site page. */
  keyboardId?: string;
  /** Derived sections from the studio's buildDocContent; absent means none. */
  generated?: GeneratedDocSlots;
  /**
   * Accepted documentation-fix proposals for an adaptation (issue #1908).
   * Populated only by the adapt path, only from the author's recorded
   * answers — never by the copy path and never as a default. Absent means
   * the inherited pages render exactly as they always have.
   */
  inheritedFixes?: {
    /** Rewrite the inherited help header's $pagename/$pagetitle (criterion 11.7). */
    pagename?: boolean;
    /** Sync the welcome/help bodies from the named canonical side (criterion 11.9). */
    bodySync?: "welcome" | "help";
  };
}

// Opt-in "additional detail" battery (FR-011/FR-014), fixed order per research D-10.
// Font guidance is NOT in this battery: it is core intro matter (element spec
// §2) and renders through the fontNote slot instead — see renderDocBodyHtml.
const OPT_IN_FIELDS: ReadonlyArray<{ key: keyof HelpDocsAnswers; heading: string }> = [
  { key: "designRationale", heading: "Design Rationale" },
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
const CREDITS_HEADING = "Credits";
const CONTACT_HEADING = "Contact";

function nonBlank(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t !== undefined && t !== "" ? t : undefined;
}

/**
 * The welcome-page / help-page section list: usage tips, credits, contact,
 * then the opt-in battery — each independently omitted when blank (FR-003,
 * FR-011). Never includes the description itself (the caller renders that as
 * the lead paragraph), never the font note (intro matter, rendered through
 * its own slot), and never anything README-only (links, platforms).
 */
export function buildDocSections(answers: HelpDocsAnswers | null): DocSection[] {
  if (answers === null) return [];
  const sections: DocSection[] = [];

  const tips = answers.usageTips.map((t) => t.trim()).filter((t) => t !== "");
  if (tips.length > 0) {
    sections.push({ heading: USAGE_TIPS_HEADING, body: tips.join("\n") });
  }
  const credits = nonBlank(answers.credits);
  if (credits !== undefined) sections.push({ heading: CREDITS_HEADING, body: credits });
  const contactInfo = nonBlank(answers.contactInfo);
  if (contactInfo !== undefined) sections.push({ heading: CONTACT_HEADING, body: contactInfo });

  for (const { key, heading } of OPT_IN_FIELDS) {
    const raw = answers[key];
    if (typeof raw !== "string") continue;
    const value = nonBlank(raw);
    if (value !== undefined) sections.push({ heading, body: value });
  }
  return sections;
}

/** A free-text answer as one `<p>` per non-blank line, escaped (D-07). */
function paragraphsHtml(body: string): string {
  return body
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

/** The welcome/help author-answer slots, from the one section list: usage tips as a list, the opt-in battery as one slot the form heads with "Additional Detail" (T028/D-10). */
function answerSlotsHtml(answers: HelpDocsAnswers | null): Partial<DocSlotModel> {
  const slots: Partial<DocSlotModel> = {};
  const optIn: string[] = [];
  for (const section of buildDocSections(answers)) {
    if (section.heading === USAGE_TIPS_HEADING) {
      slots.usageTips = `<ul>${section.body
        .split("\n")
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("")}</ul>`;
    } else if (section.heading === CREDITS_HEADING) {
      slots.credits = paragraphsHtml(section.body);
    } else if (section.heading === CONTACT_HEADING) {
      slots.contactInfo = paragraphsHtml(section.body);
    } else if (OPT_IN_HEADINGS.has(section.heading)) {
      optIn.push(`<h2>${escapeHtml(section.heading)}</h2>${paragraphsHtml(section.body)}`);
    }
  }
  if (optIn.length > 0) slots.additionalDetail = optIn.join("\n");
  return slots;
}

function descriptionOf(input: HelpDocsRenderInput): string | undefined {
  return input.answers !== null ? nonBlank(input.answers.description) : undefined;
}

/** An author-supplied link, kept only when it is a plain http(s) or mailto URL: no other scheme (such as `javascript:`), and nothing that would break a Markdown or HTML link. */
function safeUrl(url: string | undefined): string | undefined {
  const value = nonBlank(url);
  return value !== undefined && /^(?:https?:\/\/|mailto:)[^\s<>"'`]+$/i.test(value) ? value : undefined;
}

/**
 * Plain-English display name for the ISO 15924 scripts an intro line is
 * likely to name — the same curated set the character map qualifies its
 * block headings with. A script outside the set is not named: the line
 * falls back to the language alone rather than printing a raw code.
 */
const SCRIPT_DISPLAY_NAME: Readonly<Record<string, string>> = {
  Latn: "Latin",
  Cyrl: "Cyrillic",
  Arab: "Arabic",
  Deva: "Devanagari",
  Grek: "Greek",
  Armn: "Armenian",
  Geor: "Georgian",
  Hebr: "Hebrew",
  Thaa: "Thaana",
  Nkoo: "NKo",
  Adlm: "Adlam",
  Cher: "Cherokee",
  Beng: "Bengali",
  Taml: "Tamil",
  Telu: "Telugu",
  Knda: "Kannada",
  Mlym: "Malayalam",
  Sinh: "Sinhala",
  Thai: "Thai",
  Laoo: "Lao",
  Mymr: "Myanmar",
  Khmr: "Khmer",
  Tibt: "Tibetan",
  Ethi: "Ethiopic",
  Hira: "Hiragana",
  Kana: "Katakana",
  Yiii: "Yi",
  Syrc: "Syriac",
  Hani: "Han",
  Hang: "Hangul",
};

/**
 * The intro language/script sentence (element spec §2), a fact of the
 * keyboard itself: the author-confirmed language name plus the script the
 * keyboard's own BCP47 tag names. No explicit script subtag (the tag relies
 * on the language's default script) → the sentence names the language only.
 * No confirmed language name → no sentence; nothing is inferred here.
 */
function languageLineOf(input: HelpDocsRenderInput): string {
  const name = nonBlank(input.languageName);
  if (name === undefined) return "";
  const tag = nonBlank(input.primaryBcp47);
  const script = tag !== undefined ? scriptSubtagOf(tag) : undefined;
  const scriptName = script !== undefined ? SCRIPT_DISPLAY_NAME[script] : undefined;
  const sentence =
    scriptName !== undefined
      ? `This keyboard is for typing ${name} in the ${scriptName} script.`
      : `This keyboard is for typing ${name}.`;
  return escapeDocHtml(sentence);
}

/** The author's font note as intro paragraphs (element spec §2), or "" when unanswered. */
function fontNoteHtml(answers: HelpDocsAnswers | null): string {
  const value = answers !== null ? nonBlank(answers.fontGuidance) : undefined;
  return value !== undefined ? paragraphsHtml(value) : "";
}

/** The keyboard's help-site page: the author's own help URL, else the keyman.com help page for the id, else none. */
function helpPageUrl(input: HelpDocsRenderInput): string {
  const answered = safeUrl(input.answers?.projectHelpUrl);
  if (answered !== undefined) return answered;
  const id = nonBlank(input.keyboardId);
  return id !== undefined ? `https://help.keyman.com/keyboard/${id}` : "";
}

/**
 * The ONE rendered body shared by welcome.htm and help/<id>.php (FR-005,
 * spec 102 FR-025): the `body` form over the description, every answered
 * section and the derived sections. `inherited` drops the fallback sentence,
 * because the inherited prose already introduces the keyboard — and drops
 * the page heading with it, so a generated block spliced into an inherited
 * page never gives that page a second <h1>. A fresh render carries the
 * heading, so the welcome page and the fresh help page open with the same
 * one (criterion 11.9 parity compares the bodies, headings included).
 */
function renderDocBodyHtml(input: HelpDocsRenderInput, inherited: boolean): string {
  const description = descriptionOf(input);
  const generated = input.generated;
  const slots: Partial<DocSlotModel> = {
    displayName: escapeDocHtml(input.displayName),
    pageHeading: inherited ? "" : "1",
    description: description !== undefined ? escapeDocHtml(description) : "",
    noDescription: description === undefined && !inherited ? "1" : "",
    // The language line is fresh-page intro matter: an inherited page keeps
    // its own introduction, so the derived line never forces a generated
    // block onto a page that would otherwise ship verbatim (FR-006). The
    // font note is an author answer, so it splices like every other answer.
    languages: inherited ? "" : languageLineOf(input),
    fontNote: fontNoteHtml(input.answers),
    ...answerSlotsHtml(input.answers),
    ...(generated !== undefined
      ? {
          typingGuide: generated.typingGuide,
          mechanisms: generated.mechanisms,
          touchNotes: generated.touchNotes,
          characterInventory: generated.characterInventory,
        }
      : {}),
  };
  return renderDocForm(DOC_FORMS.forms.body, slots).replace(/\n+$/, "");
}

/** The generated sections, marked, spliced into an inherited page before `</body>` (FR-033). */
function spliceGenerated(inheritedPage: string, generated: string): string {
  return insertBeforeClosingBody(inheritedPage, `${DOC_GENERATED_START}\n${generated}\n${DOC_GENERATED_END}`);
}

/**
 * The `lang` for authored prose (FR-006 as amended in the spec 061
 * AS-BUILT): the first language the author said the help is written in,
 * else the keyboard's own primary language.
 */
function proseLang(answers: HelpDocsAnswers | null, primaryBcp47: string | undefined): string | undefined {
  return nonBlank(answers?.docLanguageTags?.[0]) ?? primaryBcp47;
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

/** Insert `addition` just before `</body>` when present, else append below. */
function insertBeforeClosingBody(html: string, addition: string): string {
  const closingBodyIdx = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIdx === -1) {
    // One newline between page and addition, so re-rendering a stripped page is stable.
    return html.endsWith("\n") ? `${html}${addition}` : `${html}\n${addition}`;
  }
  return `${html.slice(0, closingBodyIdx)}${addition}\n${html.slice(closingBodyIdx)}`;
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

/** Platform grouping order for the layout section (spec 080 T051): generated desktop/phone/tablet charts first, then anything else (a base's own hand-authored images). */
const LAYOUT_SECTION_GROUPS = ["desktop", "phone", "tablet", "other"] as const;
type LayoutSectionGroup = (typeof LAYOUT_SECTION_GROUPS)[number];

/**
 * Desktop layer subsections in the corpus's own heading names (element spec
 * §3: the most common welcome-page headings after "Keyboard Layout" itself),
 * in reading order. A desktop layer outside this set falls back to a
 * humanized form of its id, after the named four.
 */
const DESKTOP_LAYER_ORDER: readonly string[] = ["default", "shift", "rightalt", "rightalt-shift"];
const DESKTOP_LAYER_LABEL: Readonly<Record<string, string>> = {
  default: "Default (unshifted)",
  shift: "Shift",
  rightalt: "Right ALT (unshifted)",
  "rightalt-shift": "Right ALT Shift",
};

/** Touch layer names: the same layers, without the desktop "(unshifted)" qualifiers. */
const TOUCH_LAYER_LABEL: Readonly<Record<string, string>> = {
  default: "Default",
  shift: "Shift",
  rightalt: "Right ALT",
  "rightalt-shift": "Right ALT Shift",
};

/** Multi-word layer-id tokens whose display form is not simple capitalization. */
const LAYER_TOKEN_LABEL: Readonly<Record<string, string>> = {
  rightalt: "Right ALT",
  leftalt: "Left ALT",
  rightctrl: "Right Ctrl",
  leftctrl: "Left Ctrl",
  alt: "Alt",
  ctrl: "Ctrl",
  shift: "Shift",
  caps: "Caps",
  default: "Default",
};

/** A layer id as a display label: `_xNN_` filename escapes decoded, tokens humanized, first letters capitalized. */
function humanizeLayerId(layer: string): string {
  const decoded = layer.replace(/_x([0-9a-f]+)_/gi, (_m, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
  return decoded
    .split(/[-_]+/)
    .filter((token) => token !== "")
    .map((token) => {
      const known = LAYER_TOKEN_LABEL[token];
      return known ?? token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(" ");
}

/** Bucket `files` by the platform encoded in a generated chart filename (see `layoutChartPlatformFromFilename`), falling back to `"other"` for a base's free-form image names. Preserves each file's relative order within its own bucket. */
function groupWelcomeImageFiles(files: readonly string[]): ReadonlyMap<LayoutSectionGroup, string[]> {
  const groups = new Map<LayoutSectionGroup, string[]>(LAYOUT_SECTION_GROUPS.map((g) => [g, []]));
  for (const file of files) {
    const group = layoutChartPlatformFromFilename(file) ?? "other";
    groups.get(group)!.push(file);
  }
  return groups;
}

function layoutImageHtml(file: string): string {
  return `<p><img src="${escapeHtml(file)}" alt="${escapeHtml(layoutImageAlt(file))}"></p>`;
}

/**
 * One platform's charts as per-layer subsections (element spec §3): bucketed
 * by the layer encoded in the chart filename, layers in `order` first (any
 * remaining layers in input order), each under its own heading. Desktop
 * layers take the corpus heading names bare; touch layers are prefixed with
 * the platform, because a phone and a tablet can carry layers with the same
 * names and the subsections must stay distinguishable.
 */
function layoutLayerSubsections(
  files: readonly string[],
  labels: Readonly<Record<string, string>>,
  order: readonly string[],
  headingPrefix: string,
): string {
  const byLayer = new Map<string, string[]>();
  for (const file of files) {
    const layer = layoutChartLayerFromFilename(file) ?? "";
    const bucket = byLayer.get(layer) ?? [];
    bucket.push(file);
    byLayer.set(layer, bucket);
  }
  const layers = [
    ...order.filter((layer) => byLayer.has(layer)),
    ...[...byLayer.keys()].filter((layer) => !order.includes(layer)),
  ];
  return layers
    .map((layer) => {
      const label = labels[layer] ?? humanizeLayerId(layer);
      const images = (byLayer.get(layer) ?? []).map(layoutImageHtml).join("");
      return `<h3>${escapeHtml(headingPrefix + label)}</h3>${images}`;
    })
    .join("");
}

/**
 * The welcome page's "Keyboard Layout" section (spec 080 FR-004/T051, research
 * R9; structure per the welcome element spec §3): every file shipped beside
 * the page in `source/welcome/` — the inherited base images on a Track 1
 * copy, the generated charts otherwise — with no omission regardless of how
 * many layers/files there are. Generated charts appear as one subsection per
 * layer: the desktop layers first under the corpus heading names, then the
 * phone and tablet layers. A base's own hand-authored images carry no layer
 * in their names, so they keep a single "Other" subsection after the charts.
 * The `src` is the bare file name because the page and the images share a
 * folder. `""` when there is nothing to show, so a page with no images is
 * byte-identical to the pre-080 render. Welcome-page only: the help page's
 * body never carries it, which is the one permitted welcome/help difference
 * on the welcome side (FR-004).
 */
export function renderWelcomeLayoutSection(welcomeImageFiles: readonly string[]): string {
  const files = welcomeImageFiles.map((f) => f.trim()).filter((f) => f !== "");
  if (files.length === 0) return "";
  const groups = groupWelcomeImageFiles(files);
  const parts: string[] = [];
  const desktop = groups.get("desktop") ?? [];
  if (desktop.length > 0) {
    parts.push(layoutLayerSubsections(desktop, DESKTOP_LAYER_LABEL, DESKTOP_LAYER_ORDER, ""));
  }
  const phone = groups.get("phone") ?? [];
  if (phone.length > 0) {
    parts.push(layoutLayerSubsections(phone, TOUCH_LAYER_LABEL, DESKTOP_LAYER_ORDER, "Phone "));
  }
  const tablet = groups.get("tablet") ?? [];
  if (tablet.length > 0) {
    parts.push(layoutLayerSubsections(tablet, TOUCH_LAYER_LABEL, DESKTOP_LAYER_ORDER, "Tablet "));
  }
  const other = groups.get("other") ?? [];
  if (other.length > 0) {
    parts.push(`<h3>Other</h3>${other.map(layoutImageHtml).join("")}`);
  }
  return `<h2>${escapeHtml(KEYBOARD_LAYOUT_HEADING)}</h2>${parts.join("")}`;
}

/**
 * The distinct relative `<img src>` targets of a welcome page, in document
 * order (spec 080 contracts/engine-api.md). Scheme-qualified, protocol-
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

/** `files` with every entry already referenced by `baseHtml`'s own `<img>` tags removed (spec 080 T051: append the layout section only for supplied files the base does not already reference). */
function filesNotReferencedIn(files: readonly string[], baseHtml: string): string[] {
  const referenced = new Set(extractWelcomeImageRefs(baseHtml));
  return files.map((f) => f.trim()).filter((f) => f !== "" && !referenced.has(f));
}

/** Strip all trailing whitespace/newlines from `s` and add back exactly one. */
function withOneTrailingNewline(s: string): string {
  return `${s.replace(/\s+$/, "")}\n`;
}

// ---------------------------------------------------------------------------
// Accepted inherited-page fixes (issue #1908) — applied only when the input
// carries the author's recorded acceptance; see HelpDocsRenderInput.
// ---------------------------------------------------------------------------

const PHP_STRING_LITERAL = String.raw`'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"`;

function rewriteInheritedPagename(helpPhpText: string, displayName: string): string {
  const expected = phpSingleQuoteEscape(helpSitePageName(displayName));
  const pagenameRe = new RegExp(String.raw`(\$pagename\s*=\s*)(?:${PHP_STRING_LITERAL})`);
  const pagetitleRe = new RegExp(
    String.raw`(\$pagetitle\s*=\s*)(?!\$pagename\b)(?:${PHP_STRING_LITERAL})`,
  );
  return helpPhpText
    .replace(pagenameRe, (_m, prefix: string) => `${prefix}'${expected}'`)
    .replace(pagetitleRe, (_m, prefix: string) => `${prefix}'${expected}'`);
}

const LEADING_PHP_BLOCK_RE = /^(\uFEFF?\s*(?:<\?php[\s\S]*?\?>\s*)+)/;

/** The page's leading `<?php … ?>` header block (the help-site header), or "" when it has none. */
function leadingPhpBlock(page: string): string {
  return LEADING_PHP_BLOCK_RE.exec(page)?.[1] ?? "";
}

/**
 * A page's body content with its document chrome removed: any leading PHP
 * header and `<head>` go, and — for the welcome page's form — relative
 * sibling links point at `.htm` pages rather than their `.php` twins.
 */
function bodyContentOfPage(page: string): string {
  const withoutPhp = page.replace(LEADING_PHP_BLOCK_RE, "");
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(withoutPhp);
  const body = (
    bodyMatch?.[1] ??
    withoutPhp
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
      .replace(/<\/?(?:html|body)\b[^>]*>/gi, "")
  )
    .replace(/(\bhref\s*=\s*["'])(?![a-z][a-z0-9+.-]*:|\/\/)([^"'#]*?)\.php(?=["'#])/gi, "$1$2.htm")
    .trim();
  return body;
}

/** `page` with its `<body>` content replaced by `body` (a body element is added when the page has none). */
function replaceBodyContent(page: string, body: string): string {
  if (/<body\b[^>]*>[\s\S]*?<\/body>/i.test(page)) {
    return page.replace(
      /(<body\b[^>]*>)[\s\S]*?(<\/body>)/i,
      (_m, open: string, close: string) => `${open}\n${body}\n${close}`,
    );
  }
  const closingHtmlIdx = page.toLowerCase().lastIndexOf("</html>");
  if (closingHtmlIdx !== -1) {
    return `${page.slice(0, closingHtmlIdx)}<body>\n${body}\n</body>\n${page.slice(closingHtmlIdx)}`;
  }
  return `${page}\n<body>\n${body}\n</body>\n`;
}

/**
 * `README.md` — package-listing description, links and supported platforms,
 * from the `readmeMd` form. No version/copyright (FR-007), no typing guide
 * (spec 102 FR-029). Platform tokens keep their raw spellings (`- any`), so
 * the generator satisfies its own 5.7 readme-targets check even
 * before a description is written.
 *
 * @param startReadmeMdText spec 080 FR-006: a fetched base's own `README.md`.
 *   No description yet -> the base text verbatim (one trailing newline); a
 *   description answered -> the base text, one blank line, then the form's
 *   sections WITHOUT a second `# title` heading (the base already has one).
 */
export function renderReadmeMd(
  input: HelpDocsRenderInput,
  startReadmeMdText: string | null = null,
): string {
  const description = descriptionOf(input);
  if (startReadmeMdText !== null && description === undefined) {
    return withOneTrailingNewline(startReadmeMdText);
  }
  const helpUrl = helpPageUrl(input);
  const homeUrl = safeUrl(input.answers?.projectHomeUrl) ?? "";
  const rendered = withOneTrailingNewline(
    renderDocForm(DOC_FORMS.forms.readmeMd, {
      // An empty title slot drops the `# title` line under an inherited README.
      displayName: startReadmeMdText === null ? escapeDocMarkdown(input.displayName) : "",
      description: description !== undefined ? escapeDocMarkdown(description) : "",
      helpPageUrl: helpUrl,
      projectHomeUrl: homeUrl,
      hasLinks: helpUrl !== "" || homeUrl !== "" ? "1" : "",
      platforms: input.platforms.map((p) => `- ${p}`).join("\n"),
    }),
  );
  return startReadmeMdText === null ? rendered : `${startReadmeMdText.replace(/\s+$/, "")}\n${rendered}`;
}

/** `source/readme.htm` — the description, condensed for the package-details popup, and a pointer to the help page (spec 102 FR-029). */
export function renderReadmeHtm(input: HelpDocsRenderInput): string {
  const description = descriptionOf(input);
  return renderDocForm(DOC_FORMS.forms.readmeHtm, {
    displayName: escapeDocHtml(input.displayName),
    description: description !== undefined ? escapeDocHtml(description) : "",
    noDescription: description === undefined ? "1" : "",
    helpPageUrl: escapeDocHtml(helpPageUrl(input)),
  });
}

/**
 * `source/welcome/welcome.htm` — the first-run page, from the `welcome` form
 * around the shared body. When the base's own welcome page was fetched (Track
 * 2), that page comes first and the generated sections follow in one marked
 * block (spec 102 FR-032/FR-033); with nothing generated it ships verbatim
 * (FR-006).
 *
 * @param welcomeImageFiles bare names of the image files shipped beside the page
 *   (spec 080 FR-004/R9/T051) — rendered as a grouped "Keyboard Layout" section.
 *   On a FRESH page (no base) every file is listed. On a page merged with (or
 *   inherited from) a base, only files the base does NOT already reference are
 *   listed (via `extractWelcomeImageRefs`), so a carried image is never shown
 *   twice.
 */
export function renderWelcomeHtm(
  input: HelpDocsRenderInput,
  startWelcomeHtmText: string | null,
  welcomeImageFiles: readonly string[] = [],
  startHelpPhpText: string | null = null,
): string {
  const lang = descriptionOf(input) !== undefined ? proseLang(input.answers, input.primaryBcp47) : undefined;

  if (startWelcomeHtmText !== null) {
    const inherited = stripGeneratedBlocks(startWelcomeHtmText);
    // Issue #1908, accepted body-sync with the HELP page canonical: the
    // welcome body becomes the help page's body (sibling links back to
    // their .htm form), under the welcome page's own chrome. The welcome
    // layout section still follows for carried images the canonical body
    // does not already show — the one permitted welcome-side extra.
    if (input.inheritedFixes?.bodySync === "help" && startHelpPhpText !== null) {
      const inheritedHelp = stripGeneratedBlocks(startHelpPhpText);
      const generated = renderDocBodyHtml(input, true);
      const canonicalHelp = generated === "" ? inheritedHelp : spliceGenerated(inheritedHelp, generated);
      const canonicalBody = bodyContentOfPage(canonicalHelp);
      const layoutSection = renderWelcomeLayoutSection(filesNotReferencedIn(welcomeImageFiles, canonicalBody));
      const body = [canonicalBody, layoutSection].filter((part) => part !== "").join("\n");
      return setHtmlLang(replaceBodyContent(inherited, body), lang);
    }
    const layoutSection = renderWelcomeLayoutSection(filesNotReferencedIn(welcomeImageFiles, inherited));
    const generated = [renderDocBodyHtml(input, true), layoutSection].filter((part) => part !== "").join("\n");
    // FR-006: with nothing generated, the inherited page ships as it is.
    if (generated === "") return inherited;
    return setHtmlLang(spliceGenerated(inherited, generated), lang);
  }

  // Fresh page: the element-spec §1 shell names the page language even with
  // no answers yet — the written language when the author said, else the
  // keyboard's own primary tag (the proseLang fallback itself). The
  // inherited paths above keep their description-gated `lang`: retagging a
  // base page the author has not touched is not this render's business.
  const freshLang = proseLang(input.answers, input.primaryBcp47);
  return renderDocForm(DOC_FORMS.forms.welcome, {
    docLang: freshLang !== undefined ? escapeDocHtml(freshLang) : "",
    displayName: escapeDocHtml(input.displayName),
    pageStyle: DOC_PAGE_STYLE,
    body: renderDocBodyHtml(input, false),
    layoutPictures: renderWelcomeLayoutSection(welcomeImageFiles),
  });
}

/**
 * The help-page body fragment for a welcome page: its `<style>` blocks (so
 * inline-CSS parity, criterion 11.10, holds) followed by the content of its
 * `<body>`, with no document chrome (criterion 11.4 — the help site's
 * `header.php` owns it). Relative links to sibling `.htm` pages point at their
 * `.php` twins, the help site's form of the same page.
 */
function helpFragmentFromWelcome(welcomeHtml: string): string {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(welcomeHtml)?.[1] ?? "";
  const styles = head.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? [];
  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(welcomeHtml);
  const body = (
    bodyMatch?.[1] ??
    welcomeHtml
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
      .replace(/<\/?(?:html|body)\b[^>]*>/gi, "")
  )
    .replace(/(\bhref\s*=\s*["'])(?![a-z][a-z0-9+.-]*:|\/\/)([^"'#]*?)\.htm(?=["'#])/gi, "$1$2.php")
    .trim();
  return `${[...styles, body].join("\n")}\n`;
}

/**
 * `source/help/<id>.php` — the online help page. When the base's own help page
 * was fetched, it comes first and the generated sections follow in one marked
 * block, exactly as on the welcome page; a base page keeps its own header and
 * is never given a second one, and with nothing generated it ships verbatim
 * (FR-006). A FRESH page (no base help text) opens with
 * the standard help-site header (spec 080 FR-003) above the same *inner* body
 * welcome.htm renders — without wrapping `<html>`/`<body>` tags (criteria.md
 * §11.4 / keymanapp/keyboards#3877: the site's `header.php` owns the document
 * chrome, so a nested document is non-compliant). `<html lang>` (spec 061
 * FR-006) therefore applies to welcome.htm and to inherited help pages that
 * already carry an `<html>` element; a fresh help page has no `<html>` to
 * annotate.
 *
 * @param startWelcomeHtmText the base's own welcome page, for a base that ships
 *   one but no help page of its own. The help page is then derived from the
 *   welcome page {@link renderWelcomeHtm} renders from it, so the two carry the
 *   same body (criterion 11.9) instead of an inherited welcome page beside the
 *   bare placeholder stub.
 */
export function renderHelpPhp(
  input: HelpDocsRenderInput,
  startHelpPhpText: string | null,
  startWelcomeHtmText: string | null = null,
): string {
  const { answers, displayName, primaryBcp47 } = input;
  if (startHelpPhpText === null && startWelcomeHtmText !== null) {
    return `${helpSiteHeader(displayName)}${helpFragmentFromWelcome(
      renderWelcomeHtm(input, startWelcomeHtmText),
    )}`;
  }
  if (startHelpPhpText !== null) {
    let inherited = stripGeneratedBlocks(startHelpPhpText);
    // Issue #1908, accepted pagename fix: the inherited header stays, with
    // only its $pagename (and a literal $pagetitle) rewritten to the
    // expected form for this keyboard's display name (criterion 11.7).
    if (input.inheritedFixes?.pagename === true) {
      inherited = rewriteInheritedPagename(inherited, displayName);
    }
    // Issue #1908, accepted body-sync with the WELCOME page canonical: the
    // help page keeps its own (possibly just-rewritten) header and takes
    // the rendered welcome page's body, exactly as a base with no help page
    // of its own derives one — so the two bodies match (criterion 11.9).
    if (input.inheritedFixes?.bodySync === "welcome" && startWelcomeHtmText !== null) {
      const header = leadingPhpBlock(inherited);
      return `${header}${helpFragmentFromWelcome(renderWelcomeHtm(input, startWelcomeHtmText))}`;
    }
    const generated = renderDocBodyHtml(input, true);
    // FR-006: with nothing generated, the inherited page ships as it is.
    if (generated === "") return inherited;
    // An inherited page may be a full document (older bases) or a
    // header-plus-fragment; setHtmlLang is a no-op without an `<html>` tag.
    const lang = descriptionOf(input) !== undefined ? proseLang(answers, primaryBcp47) : undefined;
    return setHtmlLang(spliceGenerated(inherited, generated), lang);
  }
  // Fresh page: header + body fragment only — never nest a document inside
  // the site's `header.php` chrome (criterion 11.4). The shared inline style
  // leads the fragment, exactly where a derived page's extracted styles sit,
  // so fresh and derived help pages carry the welcome page's CSS alike
  // (criterion 11.10).
  return renderDocForm(DOC_FORMS.forms.help, {
    helpHeader: helpSiteHeader(displayName),
    pageStyle: DOC_PAGE_STYLE,
    body: renderDocBodyHtml(input, false),
  });
}

// classifyBaseDocumentation — spec 076 FR-008/FR-009, research R4.
//
// Pure classification of a base's documentation completeness from its already-
// parsed `.kps` <Files> manifest plus (when fetched) its welcome/help page
// texts. Computed at base-selection time for the focused/selected base only
// (base-browser.ts); never runs across the whole gallery. Never throws:
// malformed input degrades to "unknown" (no manifest to read) or "minimal"
// (a manifest with no usable description).

import type {
  BaseDocLevel,
  BaseDocumentationProfile,
  DocMemberId,
  WelcomeConvention,
} from "@keyboard-studio/contracts";
import { kpsRefToPosix, type KpsFileEntry } from "./kps-parser.js";

const WELCOME_FOLDER_PREFIX = "welcome/";
const FOLDER_WELCOME_PAGE = "welcome/welcome.htm";
const FLAT_WELCOME_PAGE = "welcome.htm";

const EMPTY_PROFILE: BaseDocumentationProfile = {
  level: "unknown",
  members: [],
  welcomeConvention: "absent",
  welcomeImages: [],
  hasUsableDescription: false,
};

/** Map one `.kps` `<Files>` entry's basename to its `DocMemberId`, or `null`. */
function mapMember(relPath: string): DocMemberId | null {
  const base = (relPath.split("/").pop() ?? relPath).toLowerCase();
  switch (base) {
    case "welcome.htm":
      return "welcome-htm";
    case "readme.htm":
      return "readme-htm";
    case "readme.md":
      return "readme-md";
    case "history.md":
      return "history-md";
    case "license.md":
      return "license-md";
    default:
      return base.endsWith(".php") ? "help-php" : null;
  }
}

/**
 * Classify a base's documentation profile (spec 076 data-model §2).
 *
 * `members`/`welcomeConvention`/`welcomeImages` come from the `.kps` manifest
 * alone; `level`/`hasUsableDescription` also weigh the fetched welcome/help
 * text (when the caller has it — the one welcome-probe fetch, research R4).
 *
 * Edge cases: `folder` wins over `flat` when a manifest lists both; a
 * declared welcome file that could not be fetched (`welcomeText === null`)
 * downgrades `welcomeConvention` to `"absent"` — a ghost descriptor entry
 * does not count as a real welcome page.
 */
export function classifyBaseDocumentation(
  kpsFiles: KpsFileEntry[],
  welcomeText: string | null,
  helpText: string | null,
): BaseDocumentationProfile {
  if (!Array.isArray(kpsFiles) || kpsFiles.length === 0) {
    return EMPTY_PROFILE;
  }

  const members = new Set<DocMemberId>();
  let folderWelcomeListed = false;
  let flatWelcomeListed = false;
  const welcomeImages: string[] = [];
  const seenImages = new Set<string>();

  for (const entry of kpsFiles) {
    if (entry === null || typeof entry !== "object" || typeof entry.name !== "string") continue;
    const rel = kpsRefToPosix(entry.name);
    if (rel === "") continue;
    const lowerRel = rel.toLowerCase();

    if (lowerRel === FOLDER_WELCOME_PAGE) {
      folderWelcomeListed = true;
    } else if (lowerRel === FLAT_WELCOME_PAGE) {
      flatWelcomeListed = true;
    } else if (lowerRel.startsWith(WELCOME_FOLDER_PREFIX) && !seenImages.has(lowerRel)) {
      seenImages.add(lowerRel);
      welcomeImages.push(rel);
    }

    const member = mapMember(rel);
    if (member !== null) members.add(member);
  }

  // Folder wins over flat (spec edge case).
  let welcomeConvention: WelcomeConvention = "absent";
  if (folderWelcomeListed) welcomeConvention = "folder";
  else if (flatWelcomeListed) welcomeConvention = "flat";

  // Ghost descriptor entry: declared in the manifest but not actually
  // fetchable — the convention downgrades to absent (data-model §2).
  if (welcomeConvention !== "absent" && welcomeText === null) {
    welcomeConvention = "absent";
  }
  if (welcomeConvention !== "folder") {
    welcomeImages.length = 0;
  }

  const hasUsableDescription = extractUsableBaseDescription(welcomeText, helpText) !== null;
  const membersBeyondLicense = [...members].some((m) => m !== "license-md");

  let level: BaseDocLevel;
  if (!membersBeyondLicense) {
    level = "none";
  } else if (hasUsableDescription) {
    level = "full";
  } else {
    level = "minimal";
  }

  return {
    level,
    members: [...members],
    welcomeConvention,
    welcomeImages,
    hasUsableDescription,
  };
}

// ---------------------------------------------------------------------------
// Usable-description extraction (spec assumption, ~spec.md line 230)
// ---------------------------------------------------------------------------

const KEYBOARD_LAYOUT_HEADING_RE = /<h[1-6][^>]*>\s*keyboard\s+layout\s*<\/h[1-6]>/i;
const PARAGRAPH_RE = /<p[^>]*>([\s\S]*?)<\/p>/gi;
const TAG_RE = /<[^>]*>/g;
// The tool's own welcome placeholder (packageDocs.ts `welcomeHtm`): a base
// page that is nothing but this is not a usable description, even though it
// has a <p> and the "Welcome to" text is not otherwise excluded.
const PLACEHOLDER_WELCOME_RE = /^welcome to .+$/i;

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITY_MAP[m] ?? m);
}

/** Strip every tag (HTML or a `<?php ... ?>` block) and collapse whitespace. */
function plainText(html: string): string {
  return decodeEntities(html.replace(TAG_RE, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The first paragraph of `html`, after dropping the "Keyboard Layout" section
 * (and everything after it) and tag-stripping, that is non-empty (excludes a
 * paragraph that is solely an image/chart reference) and is not the tool's own
 * placeholder text. `null` when no such paragraph exists.
 */
function firstUsableParagraph(html: string): string | null {
  const layoutMatch = KEYBOARD_LAYOUT_HEADING_RE.exec(html);
  const scoped = layoutMatch !== null ? html.slice(0, layoutMatch.index) : html;

  PARAGRAPH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PARAGRAPH_RE.exec(scoped)) !== null) {
    const text = plainText(m[1] ?? "");
    if (text === "") continue; // image-only / empty paragraph
    if (PLACEHOLDER_WELCOME_RE.test(text)) continue; // tool's own placeholder
    return text;
  }
  return null;
}

/**
 * The base's usable description per the spec's threshold (FR-009): the
 * welcome page's body, then the help page's body, after stripping the header
 * (the PHP `<?php ... ?>` block naturally disappears with tag-stripping) and
 * the "Keyboard Layout" section, contains at least one paragraph that is not
 * the tool's own placeholder and not solely a chart/image reference. `null`
 * when neither page has one.
 */
export function extractUsableBaseDescription(
  welcomeText: string | null,
  helpText: string | null,
): string | null {
  if (welcomeText !== null) {
    const fromWelcome = firstUsableParagraph(welcomeText);
    if (fromWelcome !== null) return fromWelcome;
  }
  if (helpText !== null) {
    const fromHelp = firstUsableParagraph(helpText);
    if (fromHelp !== null) return fromHelp;
  }
  return null;
}

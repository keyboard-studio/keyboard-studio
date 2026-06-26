// see spec.md §8 step 1 — .kps XML metadata extraction

import type { KeymanPlatformTarget } from "@keyboard-studio/contracts";

export interface KpsMetadata {
  displayName: string;
  version: string;
  targets: KeymanPlatformTarget[];
  script: string;
  languages: string[];
}

/**
 * Font and stylesheet references extracted from a .kps XML file.
 * Returned by {@link parseKpsFontRefs}; kept separate from
 * {@link KpsMetadata} so the gallery hot path (which calls
 * {@link parseKps} for ~2000 keyboards) pays no cost for font extraction.
 */
export interface KpsFontRefs {
  /**
   * Raw paths from <OSKFont> and <DisplayFont> elements in the .kps.
   * These are the fonts the OSK preview must load for correct glyph
   * rendering.  Deduped.  Backslashes intact as they appear in the XML.
   */
  oskFonts: string[];
  /**
   * Raw paths from <File> entries whose <FileType> is ".ttf" or ".otf".
   * May overlap with oskFonts; the loader deduplicates across the two lists.
   * Deduped.  Backslashes intact.
   */
  fileFonts: string[];
  /**
   * Raw paths from <File> entries whose <FileType> is ".css".  These carry
   * per-keyboard OSK styling (.kmw-keyboard-<id> rules) that bind the OSK
   * font and paint the keys.  Deduped.  Backslashes intact.
   */
  stylesheets: string[];
}

// [^>]* tolerates optional attributes on the opening tag, matching the
// regex style used by parseKvks for the <encoding> element.
function extractTagValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const val = (m[1] ?? "").trim();
    if (val.length > 0) out.push(val);
  }
  return out;
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr)];
}

const VALID_TARGETS = new Set<string>([
  "windows",
  "macosx",
  "linux",
  "web",
  "mobile",
  "tablet",
]);

/**
 * Parse a Keyman Package Source (.kps) XML string and extract the metadata
 * fields required to populate a {@link BaseKeyboard}.
 *
 * The .kps format was introduced in Keyman Developer 7.0 and the XML schema
 * has been stable across all versions since.  The standard form uses value
 * attributes on Info children (`<Name value="..."/>`).  A text-content
 * fallback (`<Name>...</Name>`) handles hand-edited or non-standard files.
 *
 * `script` is derived from the first BCP47 Language ID that contains a
 * four-letter script subtag (e.g. "hi-Deva" → "Deva").  Defaults to "Latn".
 *
 * Font and stylesheet references are intentionally excluded — call
 * {@link parseKpsFontRefs} separately when they are needed (e.g. in the
 * loader).  This keeps the gallery listing path free of font-regex cost.
 */
export function parseKps(xml: string): KpsMetadata {
  // Standard .kps schema (Keyman Developer v7+): value attribute on Info children
  const infoNameMatch = xml.match(/<Info[\s\S]*?<Name\s+value="([^"]+)"/);
  // Fallback: text-content form for hand-edited or non-standard .kps files
  const tagNameMatch = xml.match(/<Name\s*>([^<]+)<\/Name>/);
  const displayName = (infoNameMatch?.[1] ?? tagNameMatch?.[1] ?? "").trim();

  // Standard .kps schema (Keyman Developer v7+): value attribute on Info children
  const infoVersionMatch = xml.match(/<Info[\s\S]*?<Version\s+value="([^"]+)"/);
  // Fallback: text-content form for hand-edited or non-standard .kps files
  const tagVersionMatch = xml.match(/<Version\s*>([^<]+)<\/Version>/);
  const version = (
    infoVersionMatch?.[1] ?? tagVersionMatch?.[1] ?? "1.0"
  ).trim();

  // <Targets>windows macosx linux web</Targets> — space-separated platform list
  const targetsMatch = xml.match(/<Targets\s*>([^<]+)<\/Targets>/);
  const rawTargets = (targetsMatch?.[1] ?? "").trim().split(/\s+/);
  const targets = rawTargets.filter(
    (t): t is KeymanPlatformTarget => VALID_TARGETS.has(t)
  );

  // Extract all BCP47 Language IDs and derive the script subtag from the first
  // one that contains a four-letter script code (Latn, Deva, Arab, …).
  const langRe = /Language[^>]+ID="([^"]+)"/g;
  const languages: string[] = [];
  let script = "Latn";
  let scriptFound = false;
  for (const match of xml.matchAll(langRe)) {
    const langId = match[1];
    if (langId === undefined) continue;
    languages.push(langId);
    if (!scriptFound) {
      const scriptPart = langId.split("-").find((p) => /^[A-Za-z]{4}$/.test(p));
      if (scriptPart !== undefined) {
        script =
          scriptPart.charAt(0).toUpperCase() +
          scriptPart.slice(1).toLowerCase();
        scriptFound = true;
      }
    }
  }

  return {
    displayName,
    version,
    targets: targets.length > 0 ? targets : ["windows"],
    script,
    languages,
  };
}

/**
 * Walk the <File> blocks in the .kps XML and collect font and stylesheet
 * paths into typed buckets.  A <File> block is included when its
 * <FileType> child is ".ttf", ".otf", or ".css".
 */
function extractFileBlocks(xml: string): {
  fileFonts: string[];
  stylesheetPaths: string[];
} {
  const fileBlockRe = /<File\s*>([\s\S]*?)<\/File>/gi;
  const fileFonts: string[] = [];
  const stylesheetPaths: string[] = [];
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = fileBlockRe.exec(xml)) !== null) {
    const block = blockMatch[1] ?? "";
    const typeMatch = /<FileType\s*>([^<]*)<\/FileType>/i.exec(block);
    if (typeMatch === null) continue;
    const fileType = (typeMatch[1] ?? "").trim().toLowerCase();
    const nameMatch = /<Name\s*>([^<]*)<\/Name>/i.exec(block);
    if (nameMatch === null) continue;
    const name = (nameMatch[1] ?? "").trim();
    if (name.length === 0) continue;
    if (fileType === ".ttf" || fileType === ".otf") {
      fileFonts.push(name);
    } else if (fileType === ".css") {
      stylesheetPaths.push(name);
    }
  }
  return { fileFonts, stylesheetPaths };
}

/**
 * Parse a Keyman Package Source (.kps) XML string and extract font and
 * stylesheet references needed by the loader.
 *
 * Separated from {@link parseKps} so the gallery hot path (which runs
 * {@link parseKps} for every keyboard in the release tree) pays no font-regex
 * cost.  Call this only in the loader after the keyboard is selected.
 *
 * OSKFont/DisplayFont elements are matched anywhere in the document —
 * they are not restricted to any particular ancestor block.
 */
export function parseKpsFontRefs(xml: string): KpsFontRefs {
  const oskFonts = dedup([
    ...extractTagValues(xml, "OSKFont"),
    ...extractTagValues(xml, "DisplayFont"),
  ]);

  const { fileFonts, stylesheetPaths } = extractFileBlocks(xml);

  return {
    oskFonts,
    fileFonts: dedup(fileFonts),
    stylesheets: dedup(stylesheetPaths),
  };
}

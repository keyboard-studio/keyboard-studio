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

/**
 * Extract the four-letter ISO 15924 script subtag from a single BCP47 tag
 * (e.g. "Deva" from "hi-Deva"), title-cased, or `null` when the tag carries
 * no such subtag. Shared by {@link parseKps} (which defaults the result to
 * "Latn" for display purposes) and the facet-index build orchestrator
 * (utilities/facet-index/build-index.ts), which needs the null-preserving
 * form to distinguish "no declared script" from "declared Latin".
 */
export function extractScriptSubtag(tag: string): string | null {
  const seg = tag.split("-").find((p) => /^[A-Za-z]{4}$/.test(p));
  if (seg === undefined) return null;
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
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
/**
 * Extract a single Info-child value for `tag`, preferring the standard
 * Keyman Developer v7+ `<Info><Tag value="...">` form and falling back to
 * the hand-edited text-content form `<Tag>...</Tag>`. Returns `fallback`
 * (trimmed callers still get their own default applied) when neither form
 * matches.
 */
function extractInfoValue(xml: string, tag: string, fallback: string): string {
  const infoRe = new RegExp(`<Info[\\s\\S]*?<${tag}\\s+value="([^"]+)"`);
  const tagRe = new RegExp(`<${tag}\\s*>([^<]+)<\\/${tag}>`);
  const infoMatch = xml.match(infoRe);
  const tagMatch = xml.match(tagRe);
  return (infoMatch?.[1] ?? tagMatch?.[1] ?? fallback).trim();
}

export function parseKps(xml: string): KpsMetadata {
  const displayName = extractInfoValue(xml, "Name", "");
  const version = extractInfoValue(xml, "Version", "1.0");

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
      const scriptPart = extractScriptSubtag(langId);
      if (scriptPart !== null) {
        script = scriptPart;
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

/** One `<Files><File>` entry: its `<Name>` and its (lowercased) `<FileType>`. */
export interface KpsFileEntry {
  /** The `<Name>` value, backslashes intact as they appear in the XML. */
  name: string;
  /** The `<FileType>` value lowercased (e.g. ".ttf"), or "" when the block has none. */
  fileType: string;
}

/**
 * Walk every `<File>` block in the .kps XML and yield its `<Name>` + `<FileType>`.
 * The single `<File>`-block walker shared by {@link extractFileBlocks} (which
 * filters by font/stylesheet type) and the facet-index reader (which needs the
 * full name list regardless of type). Blocks with no `<Name>` are skipped; a
 * block with no `<FileType>` yields `fileType: ""`.
 */
export function parseKpsFiles(xml: string): KpsFileEntry[] {
  const fileBlockRe = /<File\s*>([\s\S]*?)<\/File>/gi;
  const entries: KpsFileEntry[] = [];
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = fileBlockRe.exec(xml)) !== null) {
    const block = blockMatch[1] ?? "";
    const nameMatch = /<Name\s*>([^<]*)<\/Name>/i.exec(block);
    if (nameMatch === null) continue;
    const name = (nameMatch[1] ?? "").trim();
    if (name.length === 0) continue;
    const typeMatch = /<FileType\s*>([^<]*)<\/FileType>/i.exec(block);
    const fileType = (typeMatch?.[1] ?? "").trim().toLowerCase();
    entries.push({ name, fileType });
  }
  return entries;
}

/**
 * Collect font and stylesheet paths into typed buckets.  A `<File>` block is
 * included when its `<FileType>` child is ".ttf", ".otf", or ".css".
 */
function extractFileBlocks(xml: string): {
  fileFonts: string[];
  stylesheetPaths: string[];
} {
  const fileFonts: string[] = [];
  const stylesheetPaths: string[] = [];
  for (const { name, fileType } of parseKpsFiles(xml)) {
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

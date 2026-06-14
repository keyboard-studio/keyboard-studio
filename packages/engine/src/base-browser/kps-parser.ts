// see spec.md §8 step 1 — .kps XML metadata extraction

import type { KeymanPlatformTarget } from "@keyboard-studio/contracts";

export interface KpsMetadata {
  displayName: string;
  version: string;
  targets: KeymanPlatformTarget[];
  script: string;
  languages: string[];
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

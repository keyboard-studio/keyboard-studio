// The start-keyboard catalog entry for one keyboard directory: the record the
// start-keyboard browser lists (name from the .kmn header, languages from the
// .kps, script from the facet index). Lifted out of the localKeyboards Vite
// plugin so the plugin's catalog scan and the headless author's start keyboard
// are built by the same function.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { loadFacetScripts, resolveKeyboardScript } from "../scripts/facet-script-lookup.mjs";

/** The committed keyboard facet index (this repo's docs/keyboard-facet-index.json). */
export function defaultFacetIndexPath(): string {
  // Resolved on use: some test runners give modules a non-file import.meta.url.
  const here = import.meta.url.startsWith("file:")
    ? path.dirname(fileURLToPath(import.meta.url))
    : path.resolve(process.cwd(), "vite-plugins");
  return path.resolve(here, "../../../docs/keyboard-facet-index.json");
}

const STORE_NAME_RE = /^\s*store\s*\(\s*&NAME\s*\)\s*'([^']*)'/im;
const STORE_VERSION_RE = /^\s*store\s*\(\s*&VERSION\s*\)\s*'([^']*)'/im;

// Match each `<Language ID="bcp47-tag">` occurrence anywhere in the .kps text.
// In the current .kps schema the ONLY `<Language ID=...>` elements live in the
// single <Keyboard><Languages> block, and Keyman Developer always serializes
// `ID` as the first attribute — so this unscoped scan is exact in practice. If a
// future schema adds a `<Language ID=...>` elsewhere (e.g. an <Info>/<Files>
// block), constrain this to the <Languages>...</Languages> span first.
const KPS_LANGUAGE_ID_RE = /<Language\s+ID="([^"]+)"/g;

/**
 * Extract BCP47 language tags from a keyboard's `.kps` package file.
 * Reads the `<Languages><Language ID="...">` block via a regex scan.
 * Returns an empty array when the file is absent, unreadable, or has no
 * `<Languages>` block — the caller continues with script-match ranking.
 */
function parseKpsLanguages(kpsPath: string): string[] {
  if (!fs.existsSync(kpsPath)) return [];
  let xml: string;
  try {
    xml = fs.readFileSync(kpsPath, "utf8");
  } catch {
    return [];
  }
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  KPS_LANGUAGE_ID_RE.lastIndex = 0;
  while ((m = KPS_LANGUAGE_ID_RE.exec(xml)) !== null) {
    if (m[1] !== undefined && m[1].length > 0) ids.push(m[1]);
  }
  return ids;
}

function parseKmnMetadata(kmnPath: string): { name: string; version: string } {
  try {
    const fd = fs.openSync(kmnPath, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString("utf8");
    const nameMatch = STORE_NAME_RE.exec(head);
    const versionMatch = STORE_VERSION_RE.exec(head);
    return {
      name: nameMatch?.[1] ?? "",
      version: versionMatch?.[1] ?? "1.0",
    };
  } catch {
    return { name: "", version: "1.0" };
  }
}

let defaultFacetScripts: Map<string, string> | null = null;

/**
 * The catalog entry for `<keyboardsRepoRoot>/<tier>/<vendor>/<id>`, or null when
 * the directory has no `source/<id>.kmn` (not a keyboard). `facetScripts`
 * defaults to the committed facet index, loaded once.
 */
export function readCatalogEntry(
  keyboardsRepoRoot: string,
  tier: string,
  vendor: string,
  id: string,
  facetScripts?: Map<string, string>,
): StartKeyboard | null {
  const kbDir = path.join(keyboardsRepoRoot, tier, vendor, id);
  const kmnPath = path.join(kbDir, "source", `${id}.kmn`);
  if (!fs.existsSync(kmnPath)) return null;
  const scripts = facetScripts ?? (defaultFacetScripts ??= loadFacetScripts(defaultFacetIndexPath()));
  const meta = parseKmnMetadata(kmnPath);
  const languages = parseKpsLanguages(path.join(kbDir, "source", `${id}.kps`));
  const entry: StartKeyboard = {
    id,
    path: `${tier}/${vendor}/${id}`,
    script: resolveKeyboardScript(id, languages, scripts),
    targets: ["windows", "macosx", "linux", "web"],
    displayName: meta.name !== "" ? meta.name : id,
    version: meta.version,
    sourceUrl: `https://github.com/keyboard-studio/keyboards/tree/master/${tier}/${vendor}/${id}`,
  };
  if (languages.length > 0) entry.languages = languages;
  return entry;
}

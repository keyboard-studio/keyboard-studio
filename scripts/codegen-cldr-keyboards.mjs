#!/usr/bin/env node
/**
 * Builds the pinned, generated index of CLDR 43.1 legacy keyboards behind
 * the #2599 importer (criterion 1): one entry per file — locale, platform,
 * variant — plus the display name, script, and languages, and the pinned
 * `release-43-1` tag commit SHA for attribution.
 *
 * Sources (see #2599 / #2600):
 *   unicode-org/cldr@release-43-1, keyboards/{android,windows,osx,chromeos}
 *   (legacy data, frozen at CLDR 43.1; CLDR 44 dropped it). Unicode License.
 *
 * Usage:
 *   node scripts/codegen-cldr-keyboards.mjs [--cldr <path-to-cldr-checkout>]
 *
 * Without --cldr it reads the GitHub API (tag ref + per-platform directory
 * listings) and raw.githubusercontent for each file's `<name>`. With --cldr
 * it reads a local checkout instead (offline; the tag commit comes from
 * `git rev-parse release-43-1`, falling back to HEAD).
 *
 * The output is COMMITTED (CI and Vercel do not run prebuild, so the
 * committed output is what ships — the windows-layouts precedent). This
 * script is in the root prebuild chain. Offline it fails soft when the
 * generated file already exists (keeps the pinned copy) and hard-fails
 * when it is missing.
 *
 * Output:
 *   packages/engine/src/cldr-import/cldr-index.generated.ts
 *
 * Also prints a corpus survey (modifier vocabulary, ISO positions,
 * transform shapes, multi-char outputs, multitap presence) — the evidence
 * the importer's mapping table and skip rules are complete for this data.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

export const OUTPUT_PATH = join(
  REPO_ROOT, "packages", "engine", "src", "cldr-import",
  "cldr-index.generated.ts",
);
export const TAG = "release-43-1";
export const REPO = "unicode-org/cldr";
export const PLATFORMS = ["android", "windows", "osx", "chromeos"];

const API_BASE = `https://api.github.com/repos/${REPO}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${TAG}/keyboards`;

/** `de-t-k0-windows.xml` → { locale, platform, variant, dpi }. */
export function parseCldrFileName(file, platform) {
  const m = /^(.+)-t-k0-(android|windows|osx|chromeos)(?:-(.+))?\.xml$/.exec(file);
  if (m === null) return null;
  if (m[2] !== platform) return null;
  let rest = m[3] ?? "";
  let dpi;
  // The dpi suffix is either the whole remainder (`-600dpi`) or its tail
  // (`-var-600dpi`); the remainder before it is the variant.
  const dpiMatch = /(?:^|-)(600dpi|768dpi)$/.exec(rest);
  if (dpiMatch !== null) {
    dpi = dpiMatch[1];
    rest = rest.slice(0, rest.length - dpiMatch[0].length);
  }
  return {
    locale: m[1],
    platform: m[2],
    variant: rest,
    ...(dpi !== undefined ? { dpi } : {}),
    file,
  };
}

/** BCP47 script for a locale via ICU maximization (e.g. `de` → `Latn`). */
export function scriptForLocale(locale) {
  try {
    return new Intl.Locale(locale).maximize().script ?? "Latn";
  } catch {
    return "Latn";
  }
}

function decodeXml(s) {
  return s
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_m, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_m, dec) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    // NOTE: deliberately no .trim() here. A trailing space is meaningful in
    // transform `from` values (`from="^ "` is deadkey+space, not a bare
    // deadkey); trimming it would miscount single-char `from` and multi-char
    // `to` in the survey below. Names are trimmed at the call site instead.
}

function nameFromXml(xml) {
  const m = /<names>[\s\S]*?<name\s+value="([^"]*)"/.exec(xml);
  return m === null ? undefined : decodeXml(m[1]).trim();
}

/** Corpus survey counters, filled while reading files. */
function newSurvey() {
  return {
    files: 0,
    modifiers: new Set(),
    isoPositions: new Set(),
    transforms: 0,
    transformsSingleCharFrom: 0,
    transformsNonSimpleTypes: new Set(),
    mapsMultiCharTo: 0,
    mapsWithMultitap: 0,
    mapsWithLongPress: 0,
    mapsTransformNo: 0,
  };
}

function surveyXml(survey, xml) {
  const noComments = xml.replace(/<!--[\s\S]*?-->/g, "");
  for (const m of noComments.matchAll(/<keyMap\b([^>]*)>/g)) {
    const mod = /modifiers="([^"]*)"/.exec(m[1]);
    if (mod !== null) survey.modifiers.add(mod[1]);
  }
  for (const m of noComments.matchAll(/<map\b([^>]*?)\/>/g)) {
    const attrs = m[1];
    const iso = /iso="([^"]*)"/.exec(attrs);
    if (iso !== null) survey.isoPositions.add(iso[1]);
    const to = /to="([^"]*)"/.exec(attrs);
    if (to !== null && [...decodeXml(to[1])].length > 1) survey.mapsMultiCharTo++;
    if (/multitap="/.test(attrs)) survey.mapsWithMultitap++;
    if (/longPress="/.test(attrs)) survey.mapsWithLongPress++;
    if (/transform="no"/.test(attrs)) survey.mapsTransformNo++;
  }
  for (const b of noComments.matchAll(/<transforms\b([^>]*)>([\s\S]*?)<\/transforms>/g)) {
    const type = /type="([^"]*)"/.exec(b[1]);
    if (type === null || type[1] !== "simple") {
      survey.transformsNonSimpleTypes.add(type?.[1] ?? "(missing)");
      continue;
    }
    for (const t of b[2].matchAll(/<transform\b([^>]*?)\/>/g)) {
      survey.transforms++;
      const from = /from="([^"]*)"/.exec(t[1]);
      if (from !== null && [...decodeXml(from[1])].length < 2) {
        survey.transformsSingleCharFrom++;
      }
    }
  }
}

async function fetchWithRetry(url, init, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fetchJson(url) {
  const res = await fetchWithRetry(url, { headers: { Accept: "application/vnd.github+json" } });
  return res.json();
}

async function fetchText(url) {
  const res = await fetchWithRetry(url);
  return res.text();
}

let _ghAvailable;
function ghAvailable() {
  if (_ghAvailable === undefined) {
    try {
      execFileSync("gh", ["--version"], { stdio: "ignore" });
      _ghAvailable = true;
    } catch {
      _ghAvailable = false;
    }
  }
  return _ghAvailable;
}

/**
 * GitHub API read: `gh api` when installed (authenticated, and reliable
 * from this VM where api.github.com direct calls intermittently 503/504),
 * plain fetch otherwise.
 */
async function githubApiJson(path) {
  if (ghAvailable()) {
    return JSON.parse(
      execFileSync("gh", ["api", path], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  }
  return fetchJson(`${API_BASE}${path}`);
}

/** Read the file list + names from the network (GitHub API + raw). */
async function collectFromNetwork(survey) {
  const ref = await githubApiJson(`/repos/${REPO}/git/ref/tags/${TAG}`);
  const commit = ref.object?.sha ?? null;
  const entries = [];
  for (const platform of PLATFORMS) {
    const listing = await githubApiJson(
      `/repos/${REPO}/contents/keyboards/${platform}?ref=${TAG}`,
    );
    const files = listing.filter((e) => e.type === "file" && e.name.endsWith(".xml")).map((e) => e.name);
    const names = await mapConcurrent(files, 8, async (file) => {
      const xml = await fetchText(`${RAW_BASE}/${platform}/${file}`);
      surveyXml(survey, xml);
      survey.files++;
      return { file, name: nameFromXml(xml) };
    });
    for (const { file, name } of names) {
      const parsed = parseCldrFileName(file, platform);
      if (parsed === null) continue;
      entries.push({
        ...parsed,
        name: name ?? parsed.locale,
        script: scriptForLocale(parsed.locale),
        languages: [parsed.locale],
      });
    }
  }
  return { commit, entries };
}

/** Read the file list + names from a local CLDR checkout. */
function collectFromLocal(dir, survey) {
  let commit = null;
  try {
    commit = execFileSync("git", ["-C", dir, "rev-parse", TAG], { encoding: "utf8" }).trim();
  } catch {
    try {
      commit = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      commit = null;
    }
  }
  const entries = [];
  for (const platform of PLATFORMS) {
    const platformDir = join(dir, "keyboards", platform);
    if (!existsSync(platformDir)) continue;
    for (const file of readdirSync(platformDir).filter((f) => f.endsWith(".xml")).sort()) {
      const xml = readFileSync(join(platformDir, file), "utf8");
      surveyXml(survey, xml);
      survey.files++;
      const parsed = parseCldrFileName(file, platform);
      if (parsed === null) continue;
      entries.push({
        ...parsed,
        name: nameFromXml(xml) ?? parsed.locale,
        script: scriptForLocale(parsed.locale),
        languages: [parsed.locale],
      });
    }
  }
  return { commit, entries };
}

async function mapConcurrent(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

function renderTs(source, entries) {
  const header = [
    "// GENERATED by scripts/codegen-cldr-keyboards.mjs — do not edit.",
    `// Pinned to unicode-org/cldr@${TAG} (legacy keyboards, frozen at CLDR 43.1).`,
    "// Regenerate with: node scripts/codegen-cldr-keyboards.mjs",
    "",
    "/** One CLDR 43.1 legacy keyboard file. */",
    "export interface CldrIndexEntry {",
    "  /** BCP47 tag from the file name, e.g. `de`, `az-Cyrl`. */",
    "  locale: string;",
    "  /** `android` | `windows` | `osx` | `chromeos`. */",
    "  platform: \"android\" | \"windows\" | \"osx\" | \"chromeos\";",
    "  /** File-name variant after the platform, e.g. `extended`, `102key`, `var`; `\"\"` for the base file. */",
    "  variant: string;",
    "  /** Android tablet variants only: the `-600dpi` / `-768dpi` suffix. */",
    "  dpi?: \"600dpi\" | \"768dpi\";",
    "  /** File name, e.g. `de-t-k0-windows.xml`. */",
    "  file: string;",
    "  /** `<name value>` from the file, e.g. `German`. */",
    "  name: string;",
    "  /** Script from ICU maximization of the locale, e.g. `Latn`. */",
    "  script: string;",
    "  /** BCP47 tags the keyboard covers: `[locale]`. */",
    "  languages: string[];",
    "}",
    "",
    "/** Pinned source + the full per-file inventory. */",
    "export const CLDR_INDEX: {",
    "  source: { repo: string; tag: string; commit: string | null };",
    "  entries: CldrIndexEntry[];",
    "} = ",
  ].join("\n");
  const body = JSON.stringify(
    {
      source: { repo: REPO, tag: TAG, commit: source.commit },
      entries,
    },
    null,
    2,
  );
  return `${header}${body};\n`;
}

function printSurvey(survey) {
  const sorted = (set) => [...set].sort();
  console.log(`[OK] codegen-cldr-keyboards: ${survey.files} files -> ${OUTPUT_PATH}`);
  console.log(`  modifiers vocabulary (${survey.modifiers.size}): ${JSON.stringify(sorted(survey.modifiers))}`);
  console.log(`  ISO positions (${survey.isoPositions.size}): ${JSON.stringify(sorted(survey.isoPositions))}`);
  console.log(
    `  transforms: ${survey.transforms} simple, ${survey.transformsSingleCharFrom} single-char from, ` +
    `non-simple types: ${JSON.stringify(sorted(survey.transformsNonSimpleTypes))}`,
  );
  console.log(
    `  maps: ${survey.mapsMultiCharTo} multi-char to, ${survey.mapsWithLongPress} with longPress, ` +
    `${survey.mapsWithMultitap} with multitap, ${survey.mapsTransformNo} transform="no"`,
  );
}

async function main(argv) {
  const flag = argv.indexOf("--cldr");
  const localDir = flag !== -1 ? resolve(argv[flag + 1]) : null;
  const survey = newSurvey();
  let collected;
  try {
    collected = localDir !== null
      ? collectFromLocal(localDir, survey)
      : await collectFromNetwork(survey);
  } catch (err) {
    if (existsSync(OUTPUT_PATH)) {
      console.warn(
        `[WARN] codegen-cldr-keyboards: fetch failed (${err instanceof Error ? err.message : String(err)}); ` +
        `keeping the existing pinned index at ${OUTPUT_PATH}`,
      );
      return;
    }
    throw err;
  }
  const { commit, entries } = collected;
  entries.sort((a, b) =>
    a.locale.localeCompare(b.locale) ||
    a.platform.localeCompare(b.platform) ||
    a.variant.localeCompare(b.variant) ||
    (a.dpi ?? "").localeCompare(b.dpi ?? ""),
  );
  writeFileSync(OUTPUT_PATH, renderTs({ commit }, entries));
  printSurvey(survey);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}

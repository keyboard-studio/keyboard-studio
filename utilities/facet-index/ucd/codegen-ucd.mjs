#!/usr/bin/env node
/**
 * Derives a slim, deterministic per-codepoint script lookup from the pinned
 * Unicode Character Database (UCD) files, for the facet-index script classifier
 * (spec 036 T005; FR-005).
 *
 * Inputs (read from lib/ucd/, pinned in scripts/ucd-version.json):
 *   Scripts.txt              codepoint → Script (long names, incl. Common/Inherited)
 *   ScriptExtensions.txt     codepoint → Script_Extensions set (short codes)
 *   PropertyValueAliases.txt sc short↔long aliases (ISO 15924) — the canonical table
 *   Blocks.txt               codepoint range → block name (Latin sub-profile only)
 *
 * Each file is SHA-256-verified against the pin BEFORE any derivation runs; a
 * PLACEHOLDER or mismatched hash fails loud and writes nothing partial (FR-005).
 *
 * Outputs (write-only-if-changed, sorted → deterministic):
 *   utilities/facet-index/ucd/generated/scriptLookup.ts  slim lookup (data + accessors)
 *   utilities/facet-index/data/SOURCES.json              per-file sha256 + unicodeVersion
 *
 * Usage:
 *   node utilities/facet-index/ucd/codegen-ucd.mjs                 verify + generate
 *   node utilities/facet-index/ucd/codegen-ucd.mjs --compute-sha   fill hashes in the pin
 *
 * Ports the verify/--compute-sha discipline of scripts/fetch-langtags.mjs and the
 * deterministic write-only-on-change output of scripts/codegen-langtags.mjs.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(HERE, ".."); // utilities/facet-index
const REPO_ROOT = resolve(TOOL_DIR, "..", "..");
const PIN_FILE = join(REPO_ROOT, "scripts", "ucd-version.json");
const GENERATED_DIR = join(TOOL_DIR, "ucd", "generated");
const GENERATED_FILE = join(GENERATED_DIR, "scriptLookup.ts");
const SOURCES_FILE = join(TOOL_DIR, "data", "SOURCES.json");

const computeSha = process.argv.slice(2).includes("--compute-sha");

// ---------------------------------------------------------------------------
// Load + verify the pin
// ---------------------------------------------------------------------------

if (!existsSync(PIN_FILE)) {
  fail(`pin file not found: ${rel(PIN_FILE)} (T002 should have created it)`);
}
const pin = JSON.parse(readFileSync(PIN_FILE, "utf8"));

if (!pin.unicodeVersion || !Array.isArray(pin.files) || pin.files.length === 0) {
  fail(`${rel(PIN_FILE)} is malformed: expected { unicodeVersion, files: [...] }`);
}

/** Absolute path of a pinned file, resolved from its repo-root-relative `path`. */
const pinnedPath = (entry) => join(REPO_ROOT, entry.path);

// Read each pinned file's bytes + actual hash up front (both modes need them).
const actuals = new Map(); // path → { bytes, sha256 }
for (const entry of pin.files) {
  const abs = pinnedPath(entry);
  if (!existsSync(abs)) {
    fail(`pinned UCD file missing: ${rel(abs)}\n        Expected under lib/ucd/ per scripts/ucd-version.json.`);
  }
  const bytes = readFileSync(abs);
  actuals.set(entry.path, { bytes, sha256: createHash("sha256").update(bytes).digest("hex") });
}

if (computeSha) {
  // Fill the real hashes into the pin and exit — the maintainer commits the pin,
  // then re-runs without the flag to produce the generated lookup (T006).
  for (const entry of pin.files) {
    entry.sha256 = actuals.get(entry.path).sha256;
  }
  writeFileSync(PIN_FILE, JSON.stringify(pin, null, 2) + "\n", "utf8");
  console.log(`[OK] wrote ${pin.files.length} SHA-256 hashes into ${rel(PIN_FILE)}`);
  for (const entry of pin.files) console.log(`     ${entry.path}  ${entry.sha256}`);
  console.log("[OK] re-run without --compute-sha to generate the lookup.");
  process.exit(0);
}

// Verify: any placeholder or mismatch fails loud, writing nothing partial.
for (const entry of pin.files) {
  const expected = String(entry.sha256 ?? "").toLowerCase();
  if (!expected || expected.startsWith("placeholder")) {
    fail(
      `${rel(PIN_FILE)} has a placeholder SHA-256 for ${entry.path}.\n` +
        "        Run: node utilities/facet-index/ucd/codegen-ucd.mjs --compute-sha",
    );
  }
  const actual = actuals.get(entry.path).sha256;
  if (actual !== expected) {
    fail(
      `SHA-256 mismatch for ${entry.path} — UCD file corrupt or tampered.\n` +
        `        Expected: ${expected}\n        Got:      ${actual}`,
    );
  }
}
console.log(`[OK] verified ${pin.files.length} pinned UCD files @ Unicode ${pin.unicodeVersion}`);

/** Return the verified UTF-8 text of a pinned file by its basename. */
function ucdText(basename) {
  const entry = pin.files.find((f) => f.path.endsWith(`/${basename}`) || f.path.endsWith(basename));
  if (!entry) fail(`pin does not list ${basename}`);
  return actuals.get(entry.path).bytes.toString("utf8");
}

// ---------------------------------------------------------------------------
// PropertyValueAliases.txt → canonical short-code table
// ---------------------------------------------------------------------------
// `sc ; <short> ; <long> [; <alias>...]` — every name (short, long, extra alias)
// maps to the canonical 4-letter short code (the first value). Normalizes both
// Scripts.txt's long names and ScriptExtensions.txt's short codes to one form.

const scriptAlias = new Map(); // any-name (normalized) → canonical short code
for (const line of ucdText("PropertyValueAliases.txt").split(/\r?\n/)) {
  const stripped = line.split("#")[0].trim();
  if (!stripped.startsWith("sc ")) continue;
  const parts = stripped.split(";").map((p) => p.trim());
  // parts[0] === "sc"; parts[1] = canonical short; parts[2..] = long + aliases
  const canonical = parts[1];
  if (!canonical) continue;
  for (const name of parts.slice(1)) {
    if (name) scriptAlias.set(name, canonical);
  }
}
if (!scriptAlias.has("Common")) fail("PropertyValueAliases.txt: 'Common' alias not found — wrong file?");

/** Normalize any script name/code to its canonical ISO-15924 short code. */
function canonicalScript(name) {
  const c = scriptAlias.get(name);
  if (!c) fail(`unknown script value '${name}' — not in PropertyValueAliases.txt sc table`);
  return c;
}

// ---------------------------------------------------------------------------
// Range parsing helpers
// ---------------------------------------------------------------------------

/** Parse `NNNN` or `NNNN..MMMM` at the start of a UCD data line → [start, end]. */
function parseCodepointRange(field) {
  const m = /^([0-9A-Fa-f]+)(?:\.\.([0-9A-Fa-f]+))?$/.exec(field.trim());
  if (!m) return null;
  const start = parseInt(m[1], 16);
  const end = m[2] !== undefined ? parseInt(m[2], 16) : start;
  return [start, end];
}

/**
 * Sort ranges by start and coalesce adjacent/contiguous ranges carrying an
 * equal value (compared via `eq`) — keeps the emitted table slim + canonical.
 */
function coalesce(ranges, eq) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] === last[1] + 1 && eq(last[2], r[2])) {
      last[1] = r[1];
    } else {
      out.push([r[0], r[1], r[2]]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scripts.txt → [start, end, canonicalShortCode]
// ---------------------------------------------------------------------------

const scriptRangesRaw = [];
for (const line of ucdText("Scripts.txt").split(/\r?\n/)) {
  const stripped = line.split("#")[0].trim();
  if (!stripped) continue;
  const [rangeField, valueField] = stripped.split(";");
  if (valueField === undefined) continue;
  const range = parseCodepointRange(rangeField);
  if (!range) continue;
  scriptRangesRaw.push([range[0], range[1], canonicalScript(valueField.trim())]);
}
const scriptRanges = coalesce(scriptRangesRaw, (a, b) => a === b);

// ---------------------------------------------------------------------------
// ScriptExtensions.txt → [start, end, sortedShortCode[]]
// ---------------------------------------------------------------------------

const scriptExtRaw = [];
for (const line of ucdText("ScriptExtensions.txt").split(/\r?\n/)) {
  const stripped = line.split("#")[0].trim();
  if (!stripped) continue;
  const [rangeField, valueField] = stripped.split(";");
  if (valueField === undefined) continue;
  const range = parseCodepointRange(rangeField);
  if (!range) continue;
  const codes = valueField
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(canonicalScript)
    .sort();
  scriptExtRaw.push([range[0], range[1], codes]);
}
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const scriptExtensionRanges = coalesce(scriptExtRaw, arrEq);

// ---------------------------------------------------------------------------
// Blocks.txt → Latin sub-profile ranges [start, end, ('plain'|'extended'|'ipa')]
// ---------------------------------------------------------------------------
// The Script property calls Basic Latin / Latin Extended-* / IPA Extensions all
// `Latn`; the plain/extended/ipa distinction is a BLOCK distinction (research D2).
// Only genuinely Latin/IPA-phonetic blocks are emitted — Katakana Phonetic
// Extensions (a Katakana block) is deliberately excluded.

/** Map a block name to a Latin sub-profile, or null if it is not a Latin block. */
function latinProfileForBlock(name) {
  const norm = name.toLowerCase().replace(/[\s_-]/g, "");
  if (norm.startsWith("ipaextensions") || norm.startsWith("phoneticextensions")) return "ipa";
  if (norm === "basiclatin" || norm === "latin1supplement") return "plain";
  if (norm.startsWith("latinextended")) return "extended";
  return null;
}

const latinBlockRaw = [];
for (const line of ucdText("Blocks.txt").split(/\r?\n/)) {
  const stripped = line.split("#")[0].trim();
  if (!stripped) continue;
  const semi = stripped.indexOf(";");
  if (semi === -1) continue;
  const range = parseCodepointRange(stripped.slice(0, semi));
  if (!range) continue;
  const profile = latinProfileForBlock(stripped.slice(semi + 1).trim());
  if (!profile) continue;
  latinBlockRaw.push([range[0], range[1], profile]);
}
const latinBlockRanges = coalesce(latinBlockRaw, (a, b) => a === b);

// ---------------------------------------------------------------------------
// DerivedAge.txt → per-script first-assigned Unicode version
// ---------------------------------------------------------------------------
// DerivedAge lists `RANGE ; MAJOR.MINOR` — when each codepoint was first
// assigned. Joined against Scripts.txt, the MINIMUM version across a script's
// assigned codepoints is that script's first-assigned version — the block-age
// signal the orth.display-difficulty facet reads (spec 041 P3, FR-030/031).
// Versions are tracked from 1.1 onwards; 1.0 predates the ISO 10646 merger.

/** Parse `MAJOR.MINOR` → [major, minor]; null on malformed. */
function parseVersion(field) {
  const m = /^(\d+)\.(\d+)/.exec(field.trim());
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

/** True when version a is strictly older (earlier) than b. */
function versionLt(a, b) {
  return a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
}

// [start, end, [major, minor]] — sorted by start for the overlap scan below.
const ageRanges = [];
for (const line of ucdText("DerivedAge.txt").split(/\r?\n/)) {
  const stripped = line.split("#")[0].trim();
  if (!stripped) continue;
  const [rangeField, valueField] = stripped.split(";");
  if (valueField === undefined) continue;
  const range = parseCodepointRange(rangeField);
  const version = parseVersion(valueField);
  if (!range || !version) continue;
  ageRanges.push([range[0], range[1], version]);
}
ageRanges.sort((a, b) => a[0] - b[0]);
if (ageRanges.length === 0) fail("DerivedAge.txt parsed to zero ranges — wrong file?");

// Join: minimum assigned version per canonical script short code. Pseudo-scripts
// (Common/Inherited/Unknown) are joined too, but the facet never queries them.
const scriptFirstVersion = new Map(); // canonical short code → [major, minor]
for (const [s, e, script] of scriptRanges) {
  for (const [as, ae, version] of ageRanges) {
    if (ae < s) continue;
    if (as > e) break; // ageRanges sorted by start — no later range can overlap
    const prev = scriptFirstVersion.get(script);
    if (!prev || versionLt(version, prev)) scriptFirstVersion.set(script, version);
  }
}
if (!scriptFirstVersion.has("Latn")) fail("DerivedAge join produced no 'Latn' version — join broken?");

// ---------------------------------------------------------------------------
// Emit generated/scriptLookup.ts
// ---------------------------------------------------------------------------

const hex = (n) => "0x" + n.toString(16).toUpperCase();

const scriptRangeLines = scriptRanges
  .map(([s, e, v]) => `  [${hex(s)}, ${hex(e)}, ${JSON.stringify(v)}],`)
  .join("\n");
const scriptExtLines = scriptExtensionRanges
  .map(([s, e, v]) => `  [${hex(s)}, ${hex(e)}, [${v.map((c) => JSON.stringify(c)).join(", ")}]],`)
  .join("\n");
const latinLines = latinBlockRanges
  .map(([s, e, v]) => `  [${hex(s)}, ${hex(e)}, ${JSON.stringify(v)}],`)
  .join("\n");
const firstVersionLines = [...scriptFirstVersion.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([script, [maj, min]]) => `  ${JSON.stringify(script)}: [${maj}, ${min}],`)
  .join("\n");

const generated = `\
// generated — do not edit
// source:  utilities/facet-index/ucd/codegen-ucd.mjs
// data:    lib/ucd/{Scripts,ScriptExtensions,PropertyValueAliases,Blocks,DerivedAge}.txt
// unicode: ${pin.unicodeVersion}
//
// Slim per-codepoint script lookup for the facet-index script classifier
// (spec 036). Ranges are sorted by start and coalesced; binary-search accessors
// below. Common (Zyyy) / Inherited (Zinh) are returned as-is — the classifier
// treats them as neutral (never dilutes a distribution). See spec 036 research D2.

/** Pinned Unicode release this lookup was derived from. */
export const unicodeVersion = ${JSON.stringify(pin.unicodeVersion)};

/** Latin sub-profile a codepoint's block belongs to. */
export type LatinProfile = "plain" | "extended" | "ipa";

// [startCodepoint, endCodepoint, canonicalScriptShortCode] — Scripts.txt.
const scriptRanges: ReadonlyArray<readonly [number, number, string]> = [
${scriptRangeLines}
];

// [startCodepoint, endCodepoint, sortedScriptShortCodes] — ScriptExtensions.txt.
const scriptExtensionRanges: ReadonlyArray<readonly [number, number, readonly string[]]> = [
${scriptExtLines}
];

// [startCodepoint, endCodepoint, latinProfile] — Blocks.txt (Latin/IPA only).
const latinBlockRanges: ReadonlyArray<readonly [number, number, LatinProfile]> = [
${latinLines}
];

// canonicalScriptShortCode → [major, minor] first-assigned Unicode version
// (minimum age across the script's assigned codepoints — DerivedAge.txt ⋈ Scripts.txt).
const scriptFirstVersion: Readonly<Record<string, readonly [number, number]>> = {
${firstVersionLines}
};

/** Binary-search the value of the range covering \`cp\`, or undefined. */
function lookup<T>(ranges: ReadonlyArray<readonly [number, number, T]>, cp: number): T | undefined {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end, value] = ranges[mid]!;
    if (cp < start) hi = mid - 1;
    else if (cp > end) lo = mid + 1;
    else return value;
  }
  return undefined;
}

/**
 * Canonical ISO-15924 script short code for a codepoint. Codepoints with no
 * explicit Script value default to \`Zzzz\` (Unknown), matching the UCD @missing.
 */
export function scriptOf(cp: number): string {
  return lookup(scriptRanges, cp) ?? "Zzzz";
}

/**
 * Script_Extensions set for a codepoint (canonical short codes), or undefined
 * when the codepoint has no explicit extensions (its Script value stands alone).
 * Used to STRENGTHEN a distribution for shared characters, never to dilute it.
 */
export function scriptExtensionsOf(cp: number): readonly string[] | undefined {
  return lookup(scriptExtensionRanges, cp);
}

/** Latin sub-profile (plain/extended/ipa) for a codepoint, or undefined. */
export function latinProfileOf(cp: number): LatinProfile | undefined {
  return lookup(latinBlockRanges, cp);
}

/**
 * First-assigned Unicode version \`[major, minor]\` for an ISO-15924 script
 * short code (e.g. \`"Latn"\` → \`[1, 1]\`), or undefined for an unknown code.
 * The minimum age across the script's assigned codepoints — the block-age
 * signal the orth.display-difficulty facet reads (spec 041 P3).
 */
export function firstVersionOfScript(script: string): readonly [number, number] | undefined {
  return scriptFirstVersion[script];
}
`;

writeIfChanged(GENERATED_FILE, generated, GENERATED_DIR);

// ---------------------------------------------------------------------------
// Emit data/SOURCES.json (mirrors manifest.referencePins shape)
// ---------------------------------------------------------------------------

const sources = {
  unicodeVersion: pin.unicodeVersion,
  files: [...pin.files]
    .map((entry) => ({ file: entry.path, sha256: actuals.get(entry.path).sha256 }))
    .sort((a, b) => a.file.localeCompare(b.file)),
};
writeIfChanged(SOURCES_FILE, JSON.stringify(sources, null, 2) + "\n", dirname(SOURCES_FILE));

console.log(
  `[OK] ${scriptRanges.length} script ranges, ${scriptExtensionRanges.length} ext ranges, ` +
    `${latinBlockRanges.length} latin-block ranges`,
);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function writeIfChanged(path, content, dir) {
  let existing = "";
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    /* not yet present */
  }
  if (existing === content) {
    console.log(`[OK] unchanged ${rel(path)}`);
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, content, "utf8");
  console.log(`[OK] wrote ${rel(path)} (${Buffer.byteLength(content, "utf8")} bytes)`);
}

function rel(p) {
  return p.slice(REPO_ROOT.length + 1).replace(/\\/g, "/");
}

function fail(msg) {
  console.error(`[ERROR] ${msg}`);
  process.exit(1);
}

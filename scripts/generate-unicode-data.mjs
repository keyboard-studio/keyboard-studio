#!/usr/bin/env node
/**
 * Generates the pinned in-repo Unicode data table (spec 082, FR-021) from the
 * repo's SHA-256-pinned `lib/ucd/UnicodeData.txt` (Unicode 17.0.0 per
 * scripts/ucd-version.json).
 *
 * Unlike the sibling gitignored charnames JSON (scripts/codegen-charnames.mjs,
 * engine search-by-name only), this artifact is CHECKED IN so builds never
 * need network, covers the FULL codepoint range 0x0–0x10FFFF (not just BMP),
 * and carries General_Category + canonical combining class + character name —
 * the single authoritative Unicode table for engine, contracts, and studio.
 *
 * Ports the verify/--compute-sha idiom of scripts/codegen-charnames.mjs and
 * utilities/facet-index/ucd/codegen-ucd.mjs: the source file's SHA-256 is
 * verified against scripts/ucd-version.json BEFORE parsing; a placeholder or
 * mismatched hash fails loud and writes nothing partial. UnicodeData.txt
 * carries no in-file version stamp, so the SHA-256 pin IS the version
 * binding — the generator additionally asserts pin.unicodeVersion is present
 * and records it in the emitted header.
 *
 * Special name ranges (UnicodeData.html, "Name" field documentation):
 *   - `<CJK Ideograph[, Extension A-J], First>` … `<…, Last>` ranges expand to
 *     per-codepoint entries named "CJK UNIFIED IDEOGRAPH-" + uppercase hex.
 *   - `<Tangut Ideograph[, Supplement], First>` … `<…, Last>` similarly expand
 *     to "TANGUT IDEOGRAPH-" + hex (verified: U+18D00 is TANGUT IDEOGRAPH-18D00).
 *   - `<Hangul Syllable, First>` … `<Hangul Syllable, Last>` (U+AC00–U+D7A3)
 *     expand with the normative algorithmic names ("HANGUL SYLLABLE " +
 *     choseong + jungseong [+ jongseong] short names, Unicode Standard §3.12);
 *     the 11,172-syllable count is asserted against the range length.
 *   - Surrogate and private-use ranges expand for category/ccc coverage, but
 *     their `<…>` markers are not real names — getName returns undefined there.
 *   - `<control>` rows likewise have no real name — getName returns undefined
 *     (consistent with codegen-charnames.mjs skipping `<…>` names).
 *   Any range marker the generator does not recognise fails loud — a future
 *   Unicode version adding a new algorithmic range type must be handled
 *   deliberately, never silently mis-named.
 *
 * Encoding (range-encoded for size; ~1.5 MB for the full range):
 *   RUNS: maximal runs of identical (General_Category, ccc, nameKind) as
 *     [start, end, categoryIndex, ccc, nameKind, nameBase] tuples, sorted by
 *     start. Unassigned codepoints appear in NO run — lookups return undefined.
 *   NAME_DATA: every stored name joined with "\n" (names are ASCII; asserted).
 *   NAME_OFFSETS: byte offset of each stored name in NAME_DATA, in codepoint
 *     order; nameBase indexes into it. Algorithmic names (CJK/Tangut/Hangul)
 *     are computed at lookup time and stored nowhere.
 *
 * Usage:
 *   node scripts/generate-unicode-data.mjs              verify + generate
 *   node scripts/generate-unicode-data.mjs --compute-sha fill the pin's hash
 *   node scripts/generate-unicode-data.mjs --check      regenerate in memory
 *     and diff against the checked-in file (used by the determinism test);
 *     exits non-zero on drift, 0 when the checked-in module is current.
 *
 * Output (checked in):
 *   packages/contracts/src/unicode/unicodeData.generated.ts
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const SOURCE_FILE = join(ROOT, "lib", "ucd", "UnicodeData.txt");
const PIN_FILE = join(ROOT, "scripts", "ucd-version.json");
const OUT_FILE = join(
  ROOT,
  "packages",
  "contracts",
  "src",
  "unicode",
  "unicodeData.generated.ts",
);
const PIN_PATH = "lib/ucd/UnicodeData.txt";

const args = process.argv.slice(2);
const computeSha = args.includes("--compute-sha");
const checkMode = args.includes("--check");

// ---------------------------------------------------------------------------
// Pin verification (fail loud before parsing anything)
// ---------------------------------------------------------------------------

if (!existsSync(SOURCE_FILE)) fail(`source file not found: ${rel(SOURCE_FILE)}`);
if (!existsSync(PIN_FILE)) fail(`pin file not found: ${rel(PIN_FILE)}`);

const sourceBytes = readFileSync(SOURCE_FILE);
const actualSha256 = createHash("sha256").update(sourceBytes).digest("hex");

const pin = JSON.parse(readFileSync(PIN_FILE, "utf8"));
const pinEntry = (pin.files ?? []).find((f) => f.path === PIN_PATH);
if (!pinEntry) fail(`${rel(PIN_FILE)} does not list ${PIN_PATH}`);
if (!pin.unicodeVersion || typeof pin.unicodeVersion !== "string") {
  fail(`${rel(PIN_FILE)} is missing unicodeVersion — cannot record the pinned version.`);
}

if (computeSha) {
  pinEntry.sha256 = actualSha256;
  writeFileSync(PIN_FILE, JSON.stringify(pin, null, 2) + "\n", "utf8");
  console.log(`[OK] wrote ${PIN_PATH} SHA-256 into ${rel(PIN_FILE)}`);
  console.log(`     ${actualSha256}`);
  console.log("[OK] re-run without --compute-sha to generate the table.");
  process.exit(0);
}

const expectedSha256 = String(pinEntry.sha256 ?? "").toLowerCase();
if (!expectedSha256 || expectedSha256.startsWith("placeholder")) {
  fail(
    `${rel(PIN_FILE)} has a placeholder SHA-256 for ${PIN_PATH}.\n` +
      "        Run: node scripts/generate-unicode-data.mjs --compute-sha",
  );
}
if (actualSha256 !== expectedSha256) {
  fail(
    `SHA-256 mismatch for ${PIN_PATH} — file corrupt or tampered.\n` +
      `        Expected: ${expectedSha256}\n` +
      `        Got:      ${actualSha256}`,
  );
}
const UNICODE_VERSION = pin.unicodeVersion;
console.log(`[OK] verified ${PIN_PATH} @ Unicode ${UNICODE_VERSION}`);

// ---------------------------------------------------------------------------
// Parse + expand ranges
// ---------------------------------------------------------------------------

const RANGE_MARKER = /^<(.+), (First|Last)>$/;

// nameKind: 0 = no real name, 1 = stored, 2 = CJK UNIFIED IDEOGRAPH-, 3 = TANGUT IDEOGRAPH-, 4 = Hangul algorithmic
function nameKindForRange(base) {
  if (base === "Hangul Syllable") return 4;
  if (base === "CJK Ideograph" || /^CJK Ideograph Extension [A-Z]$/.test(base)) return 2;
  if (base === "Tangut Ideograph" || base === "Tangut Ideograph Supplement") return 3;
  if (/Surrogate$/.test(base)) return 0;
  if (base === "Private Use" || / Private Use$/.test(base)) return 0;
  fail(`unrecognised UnicodeData range marker <${base}, …> — add an explicit name rule.`);
}

const text = sourceBytes.toString("utf8");
// entries: {start,end,cat,ccc,nameKind,name?} — name only for kind 1
const entries = [];
let pendingFirst = null;
let rowCount = 0;

for (const line of text.split("\n")) {
  if (line === "") continue;
  rowCount++;
  const f = line.split(";");
  if (f.length < 4) fail(`malformed row ${rowCount}: ${line.slice(0, 60)}`);
  const cp = parseInt(f[0], 16);
  const name = f[1];
  const cat = f[2];
  const ccc = parseInt(f[3], 10);
  if (Number.isNaN(cp) || !/^[A-Za-z]{2}$/.test(cat) || Number.isNaN(ccc)) {
    fail(`malformed row ${rowCount}: ${line.slice(0, 60)}`);
  }
  const marker = RANGE_MARKER.exec(name);
  if (marker) {
    const [, base, which] = marker;
    if (which === "First") {
      if (pendingFirst) fail(`nested <…, First> at row ${rowCount}`);
      pendingFirst = { start: cp, base, cat, ccc };
    } else {
      if (!pendingFirst || pendingFirst.base !== base) {
        fail(`unpaired <${base}, Last> at row ${rowCount}`);
      }
      entries.push({
        start: pendingFirst.start,
        end: cp,
        cat: pendingFirst.cat,
        ccc: pendingFirst.ccc,
        nameKind: nameKindForRange(base),
        rangeBase: base,
      });
      pendingFirst = null;
    }
  } else {
    const nameKind = name === "<control>" || name === "" ? 0 : 1;
    entries.push({ start: cp, end: cp, cat, ccc, nameKind, name });
  }
}
if (pendingFirst) fail(`dangling <${pendingFirst.base}, First> at end of file`);
entries.sort((a, b) => a.start - b.start);

// ---------------------------------------------------------------------------
// Hangul algorithmic names (Unicode Standard §3.12 — normative, version-stable)
// ---------------------------------------------------------------------------

const HANGUL_L = ["G","GG","N","D","DD","R","M","B","BB","S","SS","","J","JJ","C","K","T","P","H"];
const HANGUL_V = ["A","AE","YA","YAE","EO","E","YEO","YE","O","WA","WAE","OE","YO","U","WEO","WE","WI","YU","EU","YI","I"];
const HANGUL_T = ["","G","GG","GS","N","NJ","NH","D","L","LG","LM","LB","LS","LT","LP","LH","M","B","BS","S","SS","NG","J","C","K","T","P","H"];
const HANGUL_START = 0xac00;
const HANGUL_COUNT = 11172; // 19 * 21 * 28

const hangulRange = entries.find((e) => e.nameKind === 4);
if (!hangulRange) fail("Hangul syllable range missing from UnicodeData.txt");
if (hangulRange.start !== HANGUL_START || hangulRange.end - hangulRange.start + 1 !== HANGUL_COUNT) {
  fail(
    `Hangul range is U+${hangulRange.start.toString(16).toUpperCase()}–` +
      `U+${hangulRange.end.toString(16).toUpperCase()}, expected U+AC00–U+D7A3 ` +
      `(11,172 syllables) — the algorithmic name table needs review.`,
  );
}
// Spot-check the algorithm against the standard's worked example (U+AC00 = GA).
if (hangulName(HANGUL_START) !== "HANGUL SYLLABLE GA") fail("Hangul name algorithm self-check failed");

function hangulName(cp) {
  const sIndex = cp - HANGUL_START;
  const l = HANGUL_L[Math.floor(sIndex / 588)];
  const v = HANGUL_V[Math.floor((sIndex % 588) / 28)];
  const t = HANGUL_T[sIndex % 28];
  return `HANGUL SYLLABLE ${l}${v}${t}`;
}

// ---------------------------------------------------------------------------
// Build runs + name tables
// ---------------------------------------------------------------------------

const categories = [...new Set(entries.map((e) => e.cat))].sort();
const catIndex = new Map(categories.map((c, i) => [c, i]));

const runs = []; // [start,end,catIdx,ccc,nameKind,nameBase]
const nameList = []; // stored names in codepoint order
let prevKey = null;
let prevRun = null;

for (const e of entries) {
  if (e.nameKind === 1 && /[^\x20-\x7e]/.test(e.name)) {
    fail(`non-ASCII name at U+${e.start.toString(16).toUpperCase()}: ${e.name}`);
  }
  const key = `${e.cat}|${e.ccc}|${e.nameKind}`;
  let nameBase = -1;
  if (e.nameKind === 1) {
    nameBase = nameList.length;
    nameList.push(e.name);
  }
  if (key === prevKey && prevRun && prevRun[1] + 1 === e.start) {
    prevRun[1] = e.end;
  } else {
    prevRun = [e.start, e.end, catIndex.get(e.cat), e.ccc, e.nameKind, nameBase];
    runs.push(prevRun);
    prevKey = key;
  }
}

const NAME_DATA = nameList.join("\n");
const NAME_OFFSETS = [];
{
  let off = 0;
  for (const n of nameList) {
    NAME_OFFSETS.push(off);
    off += n.length + 1; // +1 for the "\n" separator
  }
}

let assignedCount = 0;
for (const e of entries) assignedCount += e.end - e.start + 1;

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const LICENSE_NOTICE = [
  "UNICODE LICENSE V3 (https://www.unicode.org/license.txt)",
  "",
  "COPYRIGHT AND PERMISSION NOTICE",
  "",
  "Copyright © 1991-2026 Unicode, Inc.",
  "",
  'Permission is hereby granted, free of charge, to any person obtaining a copy of data files and any associated documentation (the "Data Files") or software and any associated documentation (the "Software") to deal in the Data Files or Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, and/or sell copies of the Data Files or Software, and to permit persons to whom the Data Files or Software are furnished to do so, provided that either (a) this copyright and permission notice appear with all copies of the Data Files or Software, or (b) this copyright and permission notice appear in associated Documentation.',
  "",
  'THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF THIRD PARTY RIGHTS.',
  "",
  "IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES, OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA FILES OR SOFTWARE.",
];

const header = `/**
 * GENERATED — do not edit by hand. Regenerate with:
 *   node scripts/generate-unicode-data.mjs
 *
 * Pinned in-repo Unicode data table (spec 082, FR-021): the single
 * authoritative source of Unicode General_Category, canonical combining
 * class, and character name for engine, contracts, and studio.
 *
 * Source: lib/ucd/UnicodeData.txt (Unicode ${UNICODE_VERSION}),
 * SHA-256 ${actualSha256} — verified against scripts/ucd-version.json before
 * parsing. UnicodeData.txt carries no in-file version stamp; the SHA-256 pin
 * is the version binding. Full range 0x0–0x10FFFF; unassigned codepoints
 * appear in no run (lookups return undefined, never "Cn").
 *
 * Range-encoded: maximal runs of identical (category, ccc, nameKind).
 * ${rowCount} source rows → ${entries.length} entries → ${runs.length} runs
 * covering ${assignedCount} assigned codepoints; ${nameList.length} stored names
 * (${Buffer.byteLength(NAME_DATA, "utf8")} bytes), the rest algorithmic
 * (CJK/Tangut/Hangul) or unnamed (surrogates, private use, <control>).
 *
 * Unicode data files are free under the Unicode Terms of Use. Required
 * notice, verbatim:
 *
${LICENSE_NOTICE.map((l) => ` * ${l}`.trimEnd()).join("\n")}
 */

/* eslint-disable */
// (generated data — exempt from lint; see eslint.config.mjs ignores for the
// sibling generated artifacts)

export const UNICODE_VERSION = "${UNICODE_VERSION}" as const;

export const UNICODE_DATA_SHA256 = "${actualSha256}" as const;

/** General_Category values present in the table, index-addressed by RUNS. */
export const CATEGORIES = ${JSON.stringify(categories)} as const;

/**
 * Name derivation per run:
 * 0 = no real name (surrogates, private use, <control>) → undefined;
 * 1 = stored in NAME_DATA at NAME_OFFSETS[nameBase + (cp - start)];
 * 2 = "CJK UNIFIED IDEOGRAPH-" + uppercase hex;
 * 3 = "TANGUT IDEOGRAPH-" + uppercase hex;
 * 4 = algorithmic Hangul syllable name ("HANGUL SYLLABLE " + L+V[+T]).
 */
export const NAME_KIND = { NONE: 0, STORED: 1, CJK: 2, TANGUT: 3, HANGUL: 4 } as const;

/**
 * Maximal runs of identical (category, ccc, nameKind):
 * [start, end, categoryIndex, ccc, nameKind, nameBase], sorted by start.
 */
export const RUNS: ReadonlyArray<
  readonly [number, number, number, number, number, number]
> = [
${runs.map((r) => `  [${r.join(", ")}],`).join("\n")}
];

/** Every stored name, joined with "\\n" (all names are printable ASCII). */
export const NAME_DATA: string = ${JSON.stringify(NAME_DATA)};

/** Byte offset of each stored name in NAME_DATA, in codepoint order. */
export const NAME_OFFSETS: ReadonlyArray<number> = [
${chunk(NAME_OFFSETS, 12).map((c) => `  ${c.join(", ")},`).join("\n")}
];
`;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

if (checkMode) {
  const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : null;
  if (current === header) {
    console.log(`[OK] ${rel(OUT_FILE)} is current (matches fresh regeneration).`);
  } else {
    console.error(
      `[DRIFT] ${rel(OUT_FILE)} does not match a fresh regeneration from ${rel(SOURCE_FILE)}.\n` +
        "        Run: node scripts/generate-unicode-data.mjs",
    );
    process.exit(1);
  }
} else {
  const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : null;
  if (current !== header) {
    mkdirSync(dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, header, "utf8");
    console.log(`[OK] wrote ${rel(OUT_FILE)}`);
  } else {
    console.log(`[OK] ${rel(OUT_FILE)} unchanged`);
  }
  console.log(
    `     ${runs.length} runs, ${assignedCount} assigned cps, ` +
      `${nameList.length} stored names, ${Buffer.byteLength(header, "utf8")} bytes`,
  );
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}

function fail(msg) {
  console.error(`[ERROR] ${msg}`);
  process.exit(1);
}

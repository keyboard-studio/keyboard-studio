#!/usr/bin/env node
/**
 * Derives the slim classification index from the vendored glottolog-cldf tables.
 *
 * Inputs:  packages/glottolog/data/glottolog/languages.csv  (name, level, ISO)
 *          packages/glottolog/data/glottolog/values.csv      (classification tree)
 * Output:  packages/glottolog/src/generated/index.ts
 *
 * Index derivation (spec 036, research.md D2/D11):
 *   languages.csv gives each languoid's Name, Level and ISO639P3code. This
 *   release's languages.csv carries no Parent_ID, so the tree comes from
 *   values.csv's `classification` parameter — the root-first slash-separated
 *   path of ancestor glottocodes (excluding the languoid itself; NULL for a
 *   top-level family/isolate). We derive:
 *     parentId = last element of the path  (undefined ⇒ top-level)
 *     familyId = first element of the path (undefined ⇒ self, resolved at load)
 *   byIso maps ISO 639-3 → all glottocodes carrying it (permissive, D4).
 *
 * Deterministic: object keys sorted, byIso arrays sorted, fixed record key
 * order, file rewritten only on content change → identical input yields
 * byte-identical output. Ported from scripts/codegen-langtags.mjs (D11).
 *
 * See research.md D2/D4/D11, data-model.md, contracts/glottolog-catalog-api.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DATA_DIR = join(ROOT, 'packages', 'glottolog', 'data', 'glottolog');
const LANGUAGES_FILE = join(DATA_DIR, 'languages.csv');
const VALUES_FILE = join(DATA_DIR, 'values.csv');
const OUT_DIR = join(ROOT, 'packages', 'glottolog', 'src', 'generated');
const OUT_FILE = join(OUT_DIR, 'index.ts');

for (const f of [LANGUAGES_FILE, VALUES_FILE]) {
  if (!existsSync(f)) {
    console.error(`[ERROR] ${f} not found.`);
    console.error('        Run: pnpm run fetch-glottolog');
    process.exit(1);
  }
}

const cfg = JSON.parse(readFileSync(join(__dirname, 'glottolog-version.json'), 'utf8'));

// ------------------------------------------------------- parse languages.csv --

const langRows = parseCsv(readFileSync(LANGUAGES_FILE, 'utf8'));
if (langRows.length < 2) {
  console.error('[ERROR] languages.csv: expected a header row and at least one data row.');
  process.exit(1);
}
const lHeader = langRows[0];
const lcol = (name) => requireCol(lHeader, name, 'languages.csv');

const iID = lcol('ID');
const iName = lcol('Name');
const iIso = lcol('ISO639P3code');
const iLevel = lcol('Level');

// glottocode -> { name, level, iso }
const meta = new Map();
for (let r = 1; r < langRows.length; r++) {
  const row = langRows[r];
  const id = (row[iID] ?? '').trim();
  if (!id) continue;
  meta.set(id, {
    name: (row[iName] ?? '').trim(),
    level: (row[iLevel] ?? '').trim().toLowerCase(),
    iso: (row[iIso] ?? '').trim().toLowerCase(),
  });
}

// ---------------------------------------------------------- parse values.csv --

const valRows = parseCsv(readFileSync(VALUES_FILE, 'utf8'));
if (valRows.length < 2) {
  console.error('[ERROR] values.csv: expected a header row and at least one data row.');
  process.exit(1);
}
const vHeader = valRows[0];
const vLangId = requireCol(vHeader, 'Language_ID', 'values.csv');
const vParam = requireCol(vHeader, 'Parameter_ID', 'values.csv');
const vValue = requireCol(vHeader, 'Value', 'values.csv');

// glottocode -> classification path (array of ancestor glottocodes, root-first)
const classification = new Map();
for (let r = 1; r < valRows.length; r++) {
  const row = valRows[r];
  if ((row[vParam] ?? '') !== 'classification') continue;
  const id = (row[vLangId] ?? '').trim();
  const value = (row[vValue] ?? '').trim();
  if (!id) continue;
  classification.set(id, value ? value.split('/') : []);
}

// ------------------------------------------------------------- build records --

const VALID_LEVELS = new Set(['family', 'language', 'dialect']);
let derivedLevels = 0;

// Count children so an absent Level column can be derived deterministically.
const childCount = new Map();
for (const path of classification.values()) {
  if (path.length > 0) {
    const parent = path[path.length - 1];
    childCount.set(parent, (childCount.get(parent) ?? 0) + 1);
  }
}

/** @type {Map<string, {name:string, level:string, iso639p3?:string, parentId?:string, familyId?:string}>} */
const records = new Map();
/** @type {Map<string, Set<string>>} */
const byIso = new Map();

for (const [id, m] of meta) {
  const path = classification.get(id) ?? [];
  const parentId = path.length > 0 ? path[path.length - 1] : undefined;
  const familyId = path.length > 0 ? path[0] : undefined;

  let level = m.level;
  if (!VALID_LEVELS.has(level)) {
    // Derivation fallback (research.md D2): a node with children is a group
    // (family); a childless node with an ISO code is a language; else a dialect.
    if ((childCount.get(id) ?? 0) > 0) {
      level = 'family';
    } else if (m.iso) {
      level = 'language';
    } else {
      level = 'dialect';
    }
    derivedLevels++;
  }

  const record = {
    name: m.name,
    level,
    ...(m.iso ? { iso639p3: m.iso } : {}),
    ...(parentId ? { parentId } : {}),
    ...(familyId ? { familyId } : {}),
  };
  records.set(id, record);

  if (m.iso) {
    const set = byIso.get(m.iso) ?? new Set();
    set.add(id);
    byIso.set(m.iso, set);
  }
}

// ------------------------------------------------------------------- emit ----

function serializeRecord(rec) {
  const keys = ['name', 'level', 'iso639p3', 'parentId', 'familyId'];
  const obj = {};
  for (const k of keys) {
    if (k in rec) obj[k] = rec[k];
  }
  return JSON.stringify(obj);
}

const sortedGlottocodes = [...records.keys()].sort((a, b) => a.localeCompare(b));
const languoidLines = sortedGlottocodes.map(
  (gc) => `  ${JSON.stringify(gc)}: ${serializeRecord(records.get(gc))},`
);

const sortedIso = [...byIso.keys()].sort((a, b) => a.localeCompare(b));
const byIsoLines = sortedIso.map((iso) => {
  const codes = [...byIso.get(iso)].sort((a, b) => a.localeCompare(b));
  return `  ${JSON.stringify(iso)}: ${JSON.stringify(codes)},`;
});

const header = `\
// generated — do not edit
// source:  scripts/codegen-glottolog.mjs
// data:    packages/glottolog/data/glottolog/{languages,values}.csv
// commit:  ${cfg.commit}
// fetched: ${cfg.source}
// counts:  ${records.size} languoids, ${byIso.size} ISO 639-3 keys
//
// LanguoidRecord is defined in ../types.ts.

import type { Glottocode, Iso639P3, LanguoidRecord } from "../types.js";

`;

// Record<…, LanguoidRecord> carries a declared value type, so tsc checks each
// value against LanguoidRecord rather than building a giant literal union — no
// TS2590 "union too complex" even at ~27k entries (mirrors codegen-langtags).
const languoidsBlock = `export const languoids: Readonly<Record<Glottocode, LanguoidRecord>> = {
${languoidLines.join('\n')}
};

`;

const byIsoBlock = `export const byIso: Readonly<Record<Iso639P3, readonly Glottocode[]>> = {
${byIsoLines.join('\n')}
};
`;

const content = header + languoidsBlock + byIsoBlock;

mkdirSync(OUT_DIR, { recursive: true });

let existing = '';
try {
  existing = readFileSync(OUT_FILE, 'utf8');
} catch {
  /* file does not exist yet */
}

console.log(`[OK] ${records.size} languoids, ${byIso.size} ISO 639-3 keys, ${classification.size} classified`);
if (derivedLevels > 0) {
  console.log(`[OK] ${derivedLevels} level(s) derived (absent Level column)`);
}

if (existing === content) {
  console.log(`[OK] Unchanged ${OUT_FILE}`);
} else {
  writeFileSync(OUT_FILE, content, 'utf8');
  console.log(`[OK] Generated ${OUT_FILE} (${Buffer.byteLength(content, 'utf8')} bytes)`);
}

// --- helpers ----------------------------------------------------------------

function requireCol(header, name, file) {
  const i = header.indexOf(name);
  if (i === -1) {
    console.error(`[ERROR] ${file} missing expected column "${name}".`);
    console.error(`        Columns present: ${header.join(', ')}`);
    process.exit(1);
  }
  return i;
}

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas,
 * escaped quotes (""), and CRLF/LF line endings. Returns an array of rows,
 * each an array of string cells.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

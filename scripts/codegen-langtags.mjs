#!/usr/bin/env node
/**
 * Derives a slim language-defaults index from the vendored langtags.json.
 *
 * Input:  packages/engine/data/langtags/langtags.json  (produced by fetch-langtags.mjs)
 * Output: packages/engine/src/langtags/generated/index.ts
 *
 * Index derivation (research.md D4):
 *   For each tagset whose `tag` is a bare language subtag (no script/region),
 *   derive LanguageDefaults from its `full` tag (split into lang-Script-Region).
 *   Index the record under BOTH the bare `tag` and `iso639_3`/`iso639_3extra`
 *   (all lowercased).  Also emit a flat `languages: LanguageSummary[]` (one per
 *   bare-subtag tagset, sorted by code for determinism).
 *
 * Deterministic: identical input → byte-identical output.
 *
 * See research.md D4, data-model.md, contracts/engine-langtags-api.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DATA_FILE = join(ROOT, 'packages', 'engine', 'data', 'langtags', 'langtags.json');
const OUT_DIR = join(ROOT, 'packages', 'engine', 'src', 'langtags', 'generated');

if (!existsSync(DATA_FILE)) {
  console.error('[ERROR] langtags.json not found at:');
  console.error(`        ${DATA_FILE}`);
  console.error('        Run: pnpm run fetch-langtags');
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(join(__dirname, 'langtags-version.json'), 'utf8'));

// ------------------------------------------------------------------ parse ---

let raw;
try {
  raw = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
} catch (err) {
  console.error(`[ERROR] Failed to parse langtags.json: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(raw)) {
  console.error('[ERROR] langtags.json: expected a top-level array.');
  process.exit(1);
}

// ------------------------------------------------------------------ derive --

/**
 * Split a `full` BCP47 tag into {script?, region?}.
 * full is typically "lang-Script-Region", "lang-Script", or just "lang".
 * Script subtag: 4 letters, Title-Case.
 * Region subtag: 2 uppercase letters or 3 digits.
 */
function parseFull(full) {
  const parts = full.split('-');
  let script;
  let region;
  for (const part of parts) {
    if (!script && part.length === 4 && /^[A-Z][a-z]{3}$/.test(part)) {
      script = part;
    } else if (!region && ((/^[A-Z]{2}$/.test(part)) || /^\d{3}$/.test(part))) {
      region = part;
    }
  }
  return { script, region };
}

// Map: lowercased subtag key -> LanguageDefaults object (plain JS, no TS yet)
const index = new Map();

// Collect one summary per bare-subtag tagset (keyed by tag for dedup)
const languagesByTag = new Map();

let skipped = 0;
let aliasCollisions = 0;

for (const entry of raw) {
  // Skip underscore-prefixed header records (_version, _globalvar, _phonvar, etc.)
  if (!entry.tag || entry.tag.startsWith('_')) {
    skipped++;
    continue;
  }

  // Only process bare language subtags (no '-' in tag).
  // Macrolanguages without a bare-subtag tagset (e.g. "zh") are intentionally
  // absent from the generated index — they are represented upstream only via
  // individual variety codes (e.g. "cmn", "yue"), never as a single bare entry.
  if (entry.tag.includes('-')) continue;

  const { full, iso639_3, iso639_3extra, localname, name, regions } = entry;

  let defaultScript;
  let defaultRegion;

  if (full) {
    const parsed = parseFull(full);
    defaultScript = parsed.script;
    defaultRegion = parsed.region;
  }

  const record = {
    code: entry.tag.toLowerCase(),
    ...(iso639_3 !== undefined ? { iso639_3: iso639_3.toLowerCase() } : {}),
    ...(defaultScript !== undefined ? { defaultScript } : {}),
    ...(defaultRegion !== undefined ? { defaultRegion } : {}),
    regions: Array.isArray(regions) ? [...regions].sort() : [],
    ...(localname !== undefined ? { autonym: localname } : {}),
    ...(name !== undefined ? { englishName: name } : {}),
  };

  const tagKey = entry.tag.toLowerCase();
  index.set(tagKey, record);

  // Also index under iso639_3 and each iso639_3extra (lowercased)
  if (iso639_3) {
    const k = iso639_3.toLowerCase();
    if (k !== tagKey) {
      if (index.has(k) && index.get(k).code !== record.code) {
        console.warn(`[WARN] alias collision: "${k}" already maps to "${index.get(k).code}", skipping alias for "${record.code}"`);
        aliasCollisions++;
      } else {
        index.set(k, record);
      }
    }
  }
  if (Array.isArray(iso639_3extra)) {
    for (const extra of iso639_3extra) {
      const k = extra.toLowerCase();
      if (k !== tagKey) {
        if (index.has(k) && index.get(k).code !== record.code) {
          console.warn(`[WARN] alias collision: "${k}" already maps to "${index.get(k).code}", skipping alias for "${record.code}"`);
          aliasCollisions++;
        } else {
          index.set(k, record);
        }
      }
    }
  }

  // Summary (one per bare-subtag tagset, deduped by tag)
  if (!languagesByTag.has(tagKey)) {
    languagesByTag.set(tagKey, {
      code: record.code,
      englishName: record.englishName ?? '',
      ...(record.autonym !== undefined ? { autonym: record.autonym } : {}),
      ...(record.defaultScript !== undefined ? { defaultScript: record.defaultScript } : {}),
    });
  }
}

// Sort index keys for deterministic output
const sortedIndexEntries = [...index.entries()].sort(([a], [b]) => a.localeCompare(b));

// Sort languages by code for determinism
const languages = [...languagesByTag.values()].sort((a, b) => a.code.localeCompare(b.code));

const languageCount = languagesByTag.size;
const indexKeyCount = sortedIndexEntries.length;

console.log(`[OK] ${languageCount} bare-subtag languages, ${indexKeyCount} index keys`);
if (aliasCollisions === 0) {
  console.log('[OK] 0 alias collisions');
} else {
  console.log(`[WARN] ${aliasCollisions} alias collision(s) detected (see above)`);
}

// ------------------------------------------------------------------ emit ----

mkdirSync(OUT_DIR, { recursive: true });

// Deterministic JSON serializer (stable key order within each record)
function serializeRecord(r) {
  const keys = ['code', 'iso639_3', 'defaultScript', 'defaultRegion', 'regions', 'autonym', 'englishName'];
  const obj = {};
  for (const k of keys) {
    if (k in r) obj[k] = r[k];
  }
  return JSON.stringify(obj);
}

function serializeSummary(s) {
  const keys = ['code', 'englishName', 'autonym', 'defaultScript'];
  const obj = {};
  for (const k of keys) {
    if (k in s) obj[k] = s[k];
  }
  return JSON.stringify(obj);
}

const indexLines = sortedIndexEntries.map(([k, v]) =>
  `  ${JSON.stringify(k)}: ${serializeRecord(v)},`
);

const languageLines = languages.map(s =>
  `  ${serializeSummary(s)},`
);

const header = `\
// generated — do not edit
// source:  scripts/codegen-langtags.mjs
// data:    packages/engine/data/langtags/langtags.json
// commit:  ${cfg.commit}
// fetched: ${cfg.source}
// keys:    ${indexKeyCount} (${languageCount} bare-subtag languages)
//
// LanguageDefaults and LanguageSummary are defined in @keyboard-studio/contracts.

import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";

`;

const indexBlock = `export const defaultsIndex: Readonly<Record<string, LanguageDefaults>> = {
${indexLines.join('\n')}
};

`;

const languagesBlock = `export const languages: readonly LanguageSummary[] = [
${languageLines.join('\n')}
];
`;

const content = header + indexBlock + languagesBlock;

const OUT_FILE = join(OUT_DIR, 'index.ts');

// Only write when content differs to avoid spurious git diffs
let existing = '';
try { existing = readFileSync(OUT_FILE, 'utf8'); } catch { /* file does not exist yet */ }

if (existing === content) {
  console.log(`[OK] Unchanged ${OUT_FILE}`);
} else {
  writeFileSync(OUT_FILE, content, 'utf8');
  const bytes = Buffer.byteLength(content, 'utf8');
  console.log(`[OK] Generated ${OUT_FILE} (${bytes} bytes)`);
}

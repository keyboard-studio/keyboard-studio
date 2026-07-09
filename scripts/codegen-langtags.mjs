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

/**
 * De-duplicate a list of names preserving order, dropping empty/undefined.
 * Used to merge the singular primary name with its array of alternates so the
 * primary stays first (spec 030: englishNames / localNames).
 *
 * Names are compared AND emitted as NFC. The upstream langtags source mixes
 * canonically-equivalent-but-byte-distinct forms of the same own-script name
 * (e.g. `vi`'s `localname` vs `localnames[0]` for "Tiếng Việt"), which a raw
 * string compare treats as two distinct entries — surfacing two identical-looking
 * choices in the survey picker. Normalizing to NFC before the compare collapses
 * them, and emitting the normalized form keeps output byte-stable regardless of
 * which source field appeared first (Unicode TR15).
 */
function dedupeNames(list) {
  const seen = new Set();
  const out = [];
  for (const n of list) {
    if (typeof n !== 'string') continue;
    const v = n.trim().normalize('NFC');
    if (v === '' || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * NFC-normalize a name so a singular convenience field (autonym/englishName)
 * shares the canonical form dedupeNames() emits for its array counterpart.
 * Returns undefined for a non-string input.
 */
function toNFC(s) {
  return typeof s === 'string' ? s.normalize('NFC') : undefined;
}

// Map: lowercased subtag key -> LanguageDefaults object (plain JS, no TS yet)
const index = new Map();

// Collect one summary per bare-subtag tagset (keyed by tag for dedup)
const languagesByTag = new Map();

let skipped = 0;
let aliasCollisions = 0;

// Gather region variants per bare subtag from ALL tagsets (bare + non-bare).
// A language used across regions has separate tagsets (e.g. ab, ab-Cyrl-TR);
// distinct regions become regionVariants[]. >1 distinct region ⇒ the region
// disambiguation step fires (spec 030 US3 / FR-014). Region-specific local names
// come from each tagset's own localname/localnames. Sorted by region code for
// deterministic output.
const regionVariantsByBare = new Map();
for (const entry of raw) {
  if (!entry.tag || entry.tag.startsWith('_') || !entry.region) continue;
  const bare = entry.tag.split('-')[0].toLowerCase();
  const arr = regionVariantsByBare.get(bare) ?? [];
  const vScript = entry.full ? parseFull(entry.full).script : undefined;
  const entryAutonym = toNFC(entry.localname);
  const entryLocalNames = dedupeNames([entry.localname, ...(Array.isArray(entry.localnames) ? entry.localnames : [])]);
  // Region, not script, keys the disambiguation question (FR-014: script
  // differences are handled by the separate script step). So keep ONE variant
  // per region — but when a second same-region tagset appears (a co-located
  // multi-script community, e.g. az/IR's Brai + Arab), aggregate its recorded
  // own-script names into the kept variant's localNames choice list rather than
  // dropping them (dropping lost real localnames for ~39 subtags).
  //
  // The (defaultScript, autonym) PRIMARY pair MUST stay internally consistent —
  // a script tag paired with a name in a different script is a data defect. So
  // the pair is adopted from a SINGLE tagset, and we PREFER a tagset that carries
  // a name: a nameless specialty tagset (e.g. Braille) must not win the primary
  // slot over a co-located tagset that holds the real orthography. Extra
  // different-script names still survive as choices in localNames.
  const existing = arr.find((v) => v.region === entry.region);
  if (existing !== undefined) {
    if (existing.regionName === undefined && entry.regionname !== undefined) existing.regionName = entry.regionname;
    if (existing.autonym === undefined && entryAutonym !== undefined) {
      // First same-region tagset to supply a name: adopt its script+name pair,
      // overriding a script-only primary carried from an earlier nameless tagset.
      // If the naming tagset has no resolvable script of its own, drop the
      // carried-over script rather than pairing the name with a stale, mismatched
      // one — the pair degrades to (no script, name), never (wrong script, name).
      existing.autonym = entryAutonym;
      if (vScript !== undefined) existing.defaultScript = vScript;
      else delete existing.defaultScript;
    } else if (existing.defaultScript === undefined && vScript !== undefined) {
      existing.defaultScript = vScript;
    }
    // Primary autonym first (matching the top-level localNames[0] === autonym
    // contract), then every other recorded same-region name as a choice.
    existing.localNames = dedupeNames([existing.autonym, ...existing.localNames, ...entryLocalNames]);
    regionVariantsByBare.set(bare, arr);
    continue;
  }
  arr.push({
    region: entry.region,
    ...(entry.regionname !== undefined ? { regionName: entry.regionname } : {}),
    ...(vScript !== undefined ? { defaultScript: vScript } : {}),
    ...(entryAutonym !== undefined ? { autonym: entryAutonym } : {}),
    localNames: entryLocalNames,
  });
  regionVariantsByBare.set(bare, arr);
}
for (const arr of regionVariantsByBare.values()) {
  arr.sort((a, b) => a.region.localeCompare(b.region));
}

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

  const { full, iso639_3, iso639_3extra, localname, name, regions, names, localnames, regionname } = entry;

  let defaultScript;
  let defaultRegion;

  if (full) {
    const parsed = parseFull(full);
    defaultScript = parsed.script;
    defaultRegion = parsed.region;
  }

  // Merge the singular primary with its alternates array, primary first
  // (spec 030 FR-001/FR-004). Only ~40% of subtags carry any local name, so
  // localNames is frequently empty — that is expected, not a defect.
  const englishNames = dedupeNames([name, ...(Array.isArray(names) ? names : [])]);
  const localNames = dedupeNames([localname, ...(Array.isArray(localnames) ? localnames : [])]);

  // NFC-normalize the singular primary fields to the SAME form dedupeNames emits
  // for the arrays, so autonym === localNames[0] byte-for-byte (and any consumer
  // comparing them agrees). Without this a raw-NFD source value would leave the
  // singular field in a different form than its array counterpart.
  const autonym = toNFC(localname);
  const englishName = toNFC(name);

  // Attach region variants only when the subtag is region-ambiguous (>1 distinct
  // region) — that is the region-disambiguation trigger (spec 030 US3 / FR-014).
  const variants = regionVariantsByBare.get(entry.tag.toLowerCase()) ?? [];
  const isRegionAmbiguous = variants.length > 1;

  const record = {
    code: entry.tag.toLowerCase(),
    ...(iso639_3 !== undefined ? { iso639_3: iso639_3.toLowerCase() } : {}),
    ...(defaultScript !== undefined ? { defaultScript } : {}),
    ...(defaultRegion !== undefined ? { defaultRegion } : {}),
    regions: Array.isArray(regions) ? [...regions].sort() : [],
    ...(autonym !== undefined ? { autonym } : {}),
    ...(englishName !== undefined ? { englishName } : {}),
    ...(englishNames.length ? { englishNames } : {}),
    ...(localNames.length ? { localNames } : {}),
    ...(isRegionAmbiguous ? { regionVariants: variants } : {}),
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
      // regionName distinguishes homonym languages in the picker (spec 030 T008:
      // ~98 English names map to >1 distinct language).
      ...(regionname !== undefined ? { regionName: regionname } : {}),
      // hasRegionVariants tells the survey a region-disambiguation step follows
      // (spec 030 US3 / FR-014).
      ...(isRegionAmbiguous ? { hasRegionVariants: true } : {}),
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

// Canonical key order for a regionVariant — applied before serialization so a
// variant that was built incrementally (fields backfilled during a same-region
// merge) emits the same key order as one built in a single pass.
function canonicalVariant(v) {
  const keys = ['region', 'regionName', 'defaultScript', 'autonym', 'localNames'];
  const obj = {};
  for (const k of keys) {
    if (k in v) obj[k] = v[k];
  }
  return obj;
}

// Deterministic JSON serializer (stable key order within each record)
function serializeRecord(r) {
  const keys = ['code', 'iso639_3', 'defaultScript', 'defaultRegion', 'regions', 'autonym', 'englishName', 'englishNames', 'localNames', 'regionVariants'];
  const obj = {};
  for (const k of keys) {
    if (k === 'regionVariants' && Array.isArray(r[k])) obj[k] = r[k].map(canonicalVariant);
    else if (k in r) obj[k] = r[k];
  }
  return JSON.stringify(obj);
}

function serializeSummary(s) {
  const keys = ['code', 'englishName', 'autonym', 'defaultScript', 'regionName', 'hasRegionVariants'];
  const obj = {};
  for (const k of keys) {
    if (k in s) obj[k] = s[k];
  }
  return JSON.stringify(obj);
}

const indexLines = sortedIndexEntries.map(([k, v]) =>
  `  ${JSON.stringify(k)}: ${serializeRecord(v)},`
);

// Per-element `as LanguageSummary` keeps the array's element type uniform so
// tsc does not build a literal-shape union over ~8k elements (TS2590 "union
// too complex"). defaultsIndex avoids this via its Record<string, …> index
// signature; the array literal needs the cast.
const languageLines = languages.map(s =>
  `  ${serializeSummary(s)} as LanguageSummary,`
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

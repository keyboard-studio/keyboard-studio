#!/usr/bin/env node
// facet-index-lint — validates the committed per-keyboard facet index
// (docs/keyboard-facet-index.json) against the content-owned facet definitions
// (content/keyboard-facets/*.yaml) and the pinned reference data (spec 036 T032).
//
// This is the SECOND gate: the build tool (utilities/facet-index) validates every
// record at production; this re-checks the committed artifact so a hand-edit or a
// stale commit is caught in `pnpm lint` (FR-008; contract facet-index.schema.md /
// facet-definition.schema.md).
//
// Definition checks (content/keyboard-facets/*.yaml):
//   C1  id == filename stem
//   C2  unique ids across the dir
//   C3  limits agree with valueType (enum/set/histogram => values; scalar => domain)
//   C4  every feedsSessionFacets entry resolves to a real content/facets/** id
//   C5  self-check — the definition validator rejects a known-bad + accepts a good one
//   (plus JSON-Schema shape: required fields, types, id pattern)
//
// Artifact checks (docs/keyboard-facet-index.json):
//   X1  value + every distribution key within the facet's limits (closed set;
//       `open: true` skips membership, keeps shape) — THE key check (FR-008)
//   X2  distribution (+ residue when present) sums to ~1
//   X3  every keyboard has a record for every manifest.facetId (SC-001)
//   X4  analysisOutcome 'fallback-only' => provenanceTier != 'content-derived'
//   X5  keyboardCount === |keyboards|; facetCoverage tier counts sum to keyboardCount
//       per facet; manifest.unicodeVersion matches scripts/ucd-version.json
//   X6  determinism markers — keyboards/facets/distribution keys sorted; no
//       timestamp field in the payload
//   X7  self-check — the record validator rejects a synthetic out-of-limits
//       record + accepts a good one (prove it isn't a no-op)
//
// Run: `node utilities/facet-index-lint/index.js`  (wired into `pnpm lint` after
// facet-lint). Must stay GREEN. CommonJS, plain `node`; only dep is `yaml`
// (a root devDependency).

const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FACET_DEFS_DIR = path.join(REPO_ROOT, "content", "keyboard-facets");
const SESSION_FACETS_DIR = path.join(REPO_ROOT, "content", "facets");
const INDEX_PATH = path.join(REPO_ROOT, "docs", "keyboard-facet-index.json");
const UCD_PIN_PATH = path.join(REPO_ROOT, "scripts", "ucd-version.json");

const SUM_EPSILON = 1e-6;
const CLOSED_SET_TYPES = ["enum", "set", "histogram"];
const VALUE_TYPES = ["enum", "set", "scalar", "histogram"];
const ARCHETYPES = ["character-content", "rule-structure", "declared-metadata"];
const ID_RE = /^[a-z][a-z0-9-]*$/;

const rel = (abs) => path.relative(REPO_ROOT, abs).replace(/\\/g, "/");

// ---------------------------------------------------------------------------
// Definition validation (mirrors utilities/facet-index/load-defs.ts shape + C3)
// Returns an array of problem strings; empty == valid.
// ---------------------------------------------------------------------------

function validateDefinition(rec) {
  const problems = [];
  const need = (field, ok, why) => {
    if (!ok) problems.push(`${field}: ${why}`);
  };
  if (rec === null || typeof rec !== "object" || Array.isArray(rec)) {
    return ["definition is not a YAML mapping"];
  }

  need("id", typeof rec.id === "string" && ID_RE.test(rec.id), "must match ^[a-z][a-z0-9-]*$");
  need("title", typeof rec.title === "string" && rec.title.trim().length > 0, "required non-empty string");
  need("description", typeof rec.description === "string" && rec.description.trim().length > 0, "required non-empty string");
  need("valueType", VALUE_TYPES.includes(rec.valueType), `must be one of ${VALUE_TYPES.join("|")}`);

  const l = rec.limits;
  if (l === null || typeof l !== "object" || Array.isArray(l)) {
    need("limits", false, "required mapping");
  } else {
    if (l.values !== undefined) {
      need("limits.values", Array.isArray(l.values) && l.values.length >= 1 && l.values.every((v) => typeof v === "string"), "must be a non-empty array of strings");
    }
    if (l.domain !== undefined) {
      need("limits.domain", Array.isArray(l.domain) && l.domain.length === 2 && l.domain.every((v) => typeof v === "number"), "must be a [min, max] number pair");
    }
    if (l.open !== undefined) need("limits.open", typeof l.open === "boolean", "must be a boolean");
    // C3
    if (CLOSED_SET_TYPES.includes(rec.valueType)) {
      need("limits.values", Array.isArray(l.values) && l.values.length >= 1, `is required (non-empty) when valueType is ${rec.valueType} (C3)`);
    } else if (rec.valueType === "scalar") {
      need("limits.domain", Array.isArray(l.domain) && l.domain.length === 2, "is required when valueType is scalar (C3)");
    }
  }

  need("likelihoodSemantics", typeof rec.likelihoodSemantics === "string" && rec.likelihoodSemantics.trim().length > 0, "required non-empty string");

  const d = rec.derivation;
  if (d === null || typeof d !== "object" || Array.isArray(d)) {
    need("derivation", false, "required mapping");
  } else {
    need("derivation.archetype", ARCHETYPES.includes(d.archetype), `must be one of ${ARCHETYPES.join("|")}`);
    need("derivation.classifierId", typeof d.classifierId === "string" && d.classifierId.trim().length > 0, "required non-empty string");
    need("derivation.fallbackChain", Array.isArray(d.fallbackChain) && d.fallbackChain.length >= 1 && d.fallbackChain.every((v) => typeof v === "string"), "must be a non-empty array of strings");
  }

  need("feedsSessionFacets", Array.isArray(rec.feedsSessionFacets) && rec.feedsSessionFacets.every((v) => typeof v === "string"), "must be an array of strings");
  need("schemaVersion", Number.isInteger(rec.schemaVersion) && rec.schemaVersion >= 1, "must be an integer >= 1");

  return problems;
}

// ---------------------------------------------------------------------------
// Record validation (mirrors utilities/facet-index/validate.ts — X1/X2/X4)
// ---------------------------------------------------------------------------

function validateRecord(def, cat) {
  const problems = [];
  const closedSet = CLOSED_SET_TYPES.includes(def.valueType) && def.limits.open !== true && Array.isArray(def.limits.values);
  const allowed = new Set(closedSet ? def.limits.values : []);

  // X1
  if (closedSet) {
    const values = typeof cat.value === "string" ? [cat.value] : Array.isArray(cat.value) ? cat.value.filter((v) => typeof v === "string") : [];
    for (const v of values) if (!allowed.has(v)) problems.push(`X1: value "${v}" outside limits.values`);
    if (cat.distribution && typeof cat.distribution === "object") {
      for (const k of Object.keys(cat.distribution)) if (!allowed.has(k)) problems.push(`X1: distribution key "${k}" outside limits.values`);
    }
  } else if (def.valueType === "scalar" && Array.isArray(def.limits.domain)) {
    const [min, max] = def.limits.domain;
    if (typeof cat.value === "number" && (cat.value < min || cat.value > max)) problems.push(`X1: value ${cat.value} outside limits.domain [${min}, ${max}]`);
  }

  // X2
  if (cat.distribution && typeof cat.distribution === "object") {
    let sum = 0;
    for (const v of Object.values(cat.distribution)) sum += v;
    if (cat.residue !== undefined) sum += cat.residue;
    if (Math.abs(sum - 1) > SUM_EPSILON) problems.push(`X2: distribution${cat.residue !== undefined ? " (+ residue)" : ""} sums to ${sum}, expected 1`);
  }

  // X4
  if (cat.analysisOutcome === "fallback-only" && cat.provenanceTier === "content-derived") {
    problems.push("X4: 'fallback-only' outcome inconsistent with 'content-derived' tier");
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Self-checks (C5 + X7) — the validators must not be no-ops
// ---------------------------------------------------------------------------

function selfChecks() {
  const failures = [];

  // C5: definition validator.
  const goodDef = {
    id: "demo", title: "t", description: "d", valueType: "histogram",
    limits: { values: ["Arab"], open: false }, likelihoodSemantics: "s",
    derivation: { archetype: "character-content", classifierId: "c", fallbackChain: ["content-derived"] },
    feedsSessionFacets: [], schemaVersion: 1,
  };
  const badDef = { id: "BAD ID", valueType: "nonsense", limits: {} };
  if (validateDefinition(goodDef).length !== 0) failures.push(`C5: definition validator rejected a known-good def: ${validateDefinition(goodDef).join("; ")}`);
  if (validateDefinition(badDef).length === 0) failures.push("C5: definition validator accepted a known-bad def (no-op)");

  // X7: record validator.
  const goodCat = { value: "Arab", distribution: { Arab: 1 }, confidence: null, confidenceClass: "confident", provenanceTier: "content-derived", evidenceSize: 1, analyzedCoverage: 1, analysisOutcome: "fully" };
  const badCat = { value: "Zzzz", distribution: { Zzzz: 1 }, confidence: null, confidenceClass: "confident", provenanceTier: "content-derived", evidenceSize: 1, analyzedCoverage: 1, analysisOutcome: "fully" };
  if (validateRecord(goodDef, goodCat).length !== 0) failures.push(`X7: record validator rejected a known-good record: ${validateRecord(goodDef, goodCat).join("; ")}`);
  if (validateRecord(goodDef, badCat).length === 0) failures.push("X7: record validator accepted a known-bad (out-of-limits) record (no-op)");

  return failures;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walk(dir, ext) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...walk(abs, ext));
    else if (abs.endsWith(ext)) out.push(abs);
  }
  return out;
}

function collectSessionFacetIds() {
  const ids = new Set();
  for (const file of walk(SESSION_FACETS_DIR, ".yaml")) {
    try {
      const rec = YAML.parse(readFileSync(file, "utf8"));
      if (rec && typeof rec.id === "string") ids.add(rec.id);
    } catch {
      /* facet-lint owns reporting content/facets parse errors */
    }
  }
  return ids;
}

function isSorted(keys) {
  for (let i = 1; i < keys.length; i++) if (keys[i - 1] > keys[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const failures = []; // { file, text }
  const fail = (file, text) => failures.push({ file, text });

  for (const f of selfChecks()) fail("utilities/facet-index-lint/index.js", f);

  // ---- Load + validate definitions (C1-C5) ----
  const sessionFacetIds = collectSessionFacetIds();
  const defs = new Map(); // id -> def
  const seen = new Map(); // id -> file
  const defFiles = walk(FACET_DEFS_DIR, ".yaml");
  if (defFiles.length === 0) fail(rel(FACET_DEFS_DIR), "no facet definitions found");

  for (const file of defFiles) {
    const frel = rel(file);
    let rec;
    try {
      rec = YAML.parse(readFileSync(file, "utf8"));
    } catch (e) {
      fail(frel, `YAML parse error: ${e.message}`);
      continue;
    }

    for (const p of validateDefinition(rec)) fail(frel, `definition: ${p}`);
    if (!rec || typeof rec.id !== "string") continue;

    const stem = path.basename(file, ".yaml");
    if (rec.id !== stem) fail(frel, `C1: id '${rec.id}' does not match filename stem '${stem}'`);
    if (seen.has(rec.id)) fail(frel, `C2: duplicate id '${rec.id}' (also in ${seen.get(rec.id)})`);
    else seen.set(rec.id, frel);

    // C4 feedsSessionFacets resolve to real content/facets ids.
    for (const sf of Array.isArray(rec.feedsSessionFacets) ? rec.feedsSessionFacets : []) {
      if (!sessionFacetIds.has(sf)) fail(frel, `C4: feedsSessionFacets '${sf}' is not a real content/facets id`);
    }

    defs.set(rec.id, rec);
  }

  // ---- Load + validate the artifact (X1-X7) ----
  if (!existsSync(INDEX_PATH)) {
    fail(rel(INDEX_PATH), "committed index not found — run `npx tsx utilities/facet-index/cli.ts`");
    return report(failures, 0, 0);
  }

  const raw = readFileSync(INDEX_PATH, "utf8");
  let index;
  try {
    index = JSON.parse(raw);
  } catch (e) {
    fail(rel(INDEX_PATH), `JSON parse error: ${e.message}`);
    return report(failures, 0, 0);
  }

  const irel = rel(INDEX_PATH);
  const manifest = index.manifest || {};
  const keyboards = index.keyboards || {};
  const facetIds = Array.isArray(manifest.facetIds) ? manifest.facetIds : [];
  const keyboardIds = Object.keys(keyboards);

  // X6 determinism markers.
  if (!isSorted(keyboardIds)) fail(irel, "X6: keyboards are not sorted by id");
  if (/"(builtAt|generatedAt|timestamp|date)"\s*:/.test(raw)) fail(irel, "X6: a timestamp field is present in the hashed payload");

  // X5 manifest agreement (structure).
  if (manifest.keyboardCount !== keyboardIds.length) {
    fail(irel, `X5: manifest.keyboardCount ${manifest.keyboardCount} != |keyboards| ${keyboardIds.length}`);
  }
  if (existsSync(UCD_PIN_PATH)) {
    try {
      const pin = JSON.parse(readFileSync(UCD_PIN_PATH, "utf8"));
      if (pin.unicodeVersion !== manifest.unicodeVersion) {
        fail(irel, `X5: manifest.unicodeVersion '${manifest.unicodeVersion}' != pin '${pin.unicodeVersion}'`);
      }
    } catch {
      /* pin unreadable — its own tooling owns that failure */
    }
  }

  // Per-facet tier tallies for X5.
  const tierTally = {};
  for (const id of facetIds) tierTally[id] = { content: 0, declared: 0, fallback: 0, undetermined: 0 };

  for (const kbId of keyboardIds) {
    const record = keyboards[kbId] || {};
    const facets = record.facets || {};
    if (!isSorted(Object.keys(facets))) fail(irel, `X6: keyboard '${kbId}' facets not sorted by id`);

    for (const facetId of facetIds) {
      const cat = facets[facetId];
      if (!cat) {
        fail(irel, `X3: keyboard '${kbId}' has no record for facet '${facetId}'`);
        continue;
      }
      if (cat.distribution && !isSorted(Object.keys(cat.distribution))) {
        fail(irel, `X6: keyboard '${kbId}' facet '${facetId}' distribution keys not sorted`);
      }
      const def = defs.get(facetId);
      if (!def) {
        fail(irel, `X1: facet '${facetId}' in the index has no definition in ${rel(FACET_DEFS_DIR)}`);
        continue;
      }
      for (const p of validateRecord(def, cat)) fail(irel, `keyboard '${kbId}' facet '${facetId}': ${p}`);

      // Tally for X5 (mirror build-index bumpTierCounts).
      const t = tierTally[facetId];
      if (t) {
        if (cat.value === "undetermined") t.undetermined += 1;
        else if (cat.provenanceTier === "content-derived") t.content += 1;
        else if (cat.provenanceTier === "declared-metadata") t.declared += 1;
        else t.fallback += 1;
      }
    }
  }

  // X6 facetIds sorted; X5 facetCoverage sums.
  if (!isSorted(facetIds)) fail(irel, "X6: manifest.facetIds not sorted");
  const coverage = manifest.facetCoverage || {};
  for (const facetId of facetIds) {
    const c = coverage[facetId];
    if (!c) {
      fail(irel, `X5: manifest.facetCoverage missing facet '${facetId}'`);
      continue;
    }
    const total = (c.content || 0) + (c.declared || 0) + (c.fallback || 0) + (c.undetermined || 0);
    if (total !== manifest.keyboardCount) {
      fail(irel, `X5: facetCoverage['${facetId}'] tier counts sum to ${total}, expected keyboardCount ${manifest.keyboardCount}`);
    }
    const t = tierTally[facetId];
    if (t && (t.content !== c.content || t.declared !== c.declared || t.fallback !== c.fallback || t.undetermined !== c.undetermined)) {
      fail(irel, `X5: facetCoverage['${facetId}'] disagrees with the actual record tiers (manifest=${JSON.stringify(c)} actual=${JSON.stringify(t)})`);
    }
  }

  return report(failures, defFiles.length, keyboardIds.length);
}

function report(failures, defCount, kbCount) {
  console.log(`facet-index-lint: ${defCount} facet definitions, ${kbCount} keyboards in the index`);
  if (failures.length === 0) {
    console.log("[OK] facet-index-lint: all checks GREEN");
  } else {
    console.error(`facet-index-lint: ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  [ERROR] ${f.file}: ${f.text}`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

main();

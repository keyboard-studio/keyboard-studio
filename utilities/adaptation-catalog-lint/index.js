#!/usr/bin/env node
// adaptation-catalog-lint — validates the adaptation-question catalog
// (content/adaptation-questions/**) for spec 038-adaptation-questions.
//
// The catalog is content-owned data (see content/adaptation-questions/README.md).
// Each record carries the firing condition, prefill source, provenance chip,
// consumers, no-evidence degradation, and scope that a FlowQuestion has no home
// for. This lint keeps those declarations honest against the real keyboard-facet
// definitions, the session-facet catalog, and the survey:
//
//   C1  schema        — every record parses and matches the record schema
//   C2  id/path       — id == filename stem; ids unique across the catalog
//   C3  no-always     — firingCondition non-empty and != "always" (Decision 4)
//   C4  policy fields  — noEvidenceDegradation and scope present and in-enum
//   C5  real prefills — prefill.facets are real keyboard-facets; prefill.sessionFacet
//                       (when present) is a real content/facets id whose own
//                       consumers name this question (FR-008 cross-check)
//   C6  renders↔module — renders:true ⇒ id resolves to a real survey question id
//   C7  family floor  — every family that has any records has >= 3 (FR-002/SC-001);
//                       an empty catalog is allowed (green mid-migration)
//   C8  consumers form — every consumers entry is "namespace:slug" or a real
//                        survey question id
//   C9  self-check    — the schema validator MUST reject a known-bad record and
//                       MUST accept a known-good one (prove it isn't a no-op)
//
// Run: `pnpm adaptation-catalog-lint` (== `node utilities/adaptation-catalog-lint/index.js`)
// Wired into `pnpm lint` after facet-lint. Must stay GREEN.
//
// CommonJS, plain `node`. Only dependency is `yaml`, already a root
// devDependency, resolvable from the repo-root node_modules.

const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const REPO_ROOT = path.resolve(__dirname, "../..");
const CATALOG_DIR = path.join(REPO_ROOT, "content", "adaptation-questions");
const KEYBOARD_FACETS_DIR = path.join(REPO_ROOT, "content", "keyboard-facets");
const FACETS_DIR = path.join(REPO_ROOT, "content", "facets");
const QUESTIONS_DIR = path.join(REPO_ROOT, "packages", "studio", "src", "survey", "questions");

const FAMILIES = ["script-alignment", "inheritance-posture", "trust-policy"];
const NO_EVIDENCE = ["ask-plainly", "record-no-default"];
const SCOPES = ["session", "workflow"];
const STATUSES = ["candidate", "validated", "active", "retired"];
const FAMILY_FLOOR = 3;

const rel = (abs) => path.relative(REPO_ROOT, abs).replace(/\\/g, "/");

// ---------------------------------------------------------------------------
// Ground-truth id collectors
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

/** keyboard-facet ids — the filename stem of every content/keyboard-facets/*.yaml. */
function collectKeyboardFacetIds() {
  const ids = new Set();
  for (const file of walk(KEYBOARD_FACETS_DIR, ".yaml")) {
    ids.add(path.basename(file, ".yaml"));
  }
  return ids;
}

/**
 * session-facet ids → the union of that facet's consumers (prefills + proposes),
 * for the C5 FR-008 cross-check. facet-lint owns reporting content/facets parse
 * errors, so we swallow them here.
 */
function collectSessionFacets() {
  const map = new Map(); // id -> Set(consumer strings)
  for (const file of walk(FACETS_DIR, ".yaml")) {
    let rec;
    try {
      rec = YAML.parse(readFileSync(file, "utf8"));
    } catch {
      /* facet-lint owns reporting content/facets parse errors */
      continue;
    }
    if (!rec || typeof rec.id !== "string") continue;
    const consumers = new Set();
    const c = rec.consumers;
    if (c && typeof c === "object") {
      for (const q of Array.isArray(c.prefills) ? c.prefills : []) consumers.add(q);
      for (const p of Array.isArray(c.proposes) ? c.proposes : []) consumers.add(p);
    }
    map.set(rec.id, consumers);
  }
  return map;
}

/** survey question ids — same extraction facet-lint uses (raw-text regex). */
function collectQuestionIds() {
  const ids = new Set();
  for (const file of walk(QUESTIONS_DIR, ".ts")) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bid:\s*"([a-z0-9_]+)"/g)) ids.add(m[1]);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Record schema validation (C1) — hand-rolled, mirrors README.
// Returns an array of problem strings (empty == valid).
// ---------------------------------------------------------------------------

function validateRecord(rec) {
  const problems = [];
  const need = (field, ok, why) => {
    if (!ok) problems.push(`${field}: ${why}`);
  };
  if (rec === null || typeof rec !== "object" || Array.isArray(rec)) {
    return ["record is not a YAML mapping"];
  }

  need("id", typeof rec.id === "string" && /^[a-z0-9_]+$/.test(rec.id), "must be snake_case (a-z0-9_)");
  need("family", FAMILIES.includes(rec.family), `must be one of ${FAMILIES.join("|")}`);
  need("elicits", typeof rec.elicits === "string" && rec.elicits.trim().length > 0, "required non-empty string");
  need("firingCondition", typeof rec.firingCondition === "string" && rec.firingCondition.trim().length > 0, "required non-empty string");

  const p = rec.prefill;
  need("prefill", p !== null && typeof p === "object" && !Array.isArray(p), "required mapping with facets[]");
  if (p && typeof p === "object") {
    need("prefill.facets", Array.isArray(p.facets), "required array (may be empty)");
    if (p.sessionFacet !== undefined) {
      need("prefill.sessionFacet", typeof p.sessionFacet === "string" && p.sessionFacet.length > 0, "must be a non-empty string when present");
    }
  }

  need("provenanceLabel", typeof rec.provenanceLabel === "string" && rec.provenanceLabel.trim().length > 0, "required non-empty string");
  need("consumers", Array.isArray(rec.consumers) && rec.consumers.length >= 1, "required non-empty array");
  need("noEvidenceDegradation", NO_EVIDENCE.includes(rec.noEvidenceDegradation), `must be one of ${NO_EVIDENCE.join("|")}`);
  need("scope", SCOPES.includes(rec.scope), `must be one of ${SCOPES.join("|")}`);
  need("renders", typeof rec.renders === "boolean", "required boolean");
  need("status", STATUSES.includes(rec.status), `must be one of ${STATUSES.join("|")}`);
  return problems;
}

// ---------------------------------------------------------------------------
// C9 — self-verification: the validator must not be a no-op
// ---------------------------------------------------------------------------

function selfCheck() {
  const good = {
    id: "q_self_check",
    family: "script-alignment",
    elicits: "e",
    firingCondition: "some-condition > 1",
    prefill: { facets: ["script"] },
    provenanceLabel: "p",
    consumers: ["axis:A5"],
    noEvidenceDegradation: "ask-plainly",
    scope: "session",
    renders: false,
    status: "candidate",
  };
  const bad = { id: "WRONG-ID", family: "nonsense", prefill: "not-a-mapping" };
  const failures = [];
  if (validateRecord(good).length !== 0) {
    failures.push(`self-check: validator rejected a known-good record: ${validateRecord(good).join("; ")}`);
  }
  if (validateRecord(bad).length === 0) {
    failures.push("self-check: validator accepted a known-bad record (detector is a no-op)");
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const failures = []; // { file, text }
  const fail = (file, text) => failures.push({ file, text });

  const keyboardFacetIds = collectKeyboardFacetIds();
  const sessionFacets = collectSessionFacets();
  const questionIds = collectQuestionIds();
  if (questionIds.size === 0) {
    fail(rel(QUESTIONS_DIR), "no survey question ids found — extraction broken or directory moved");
  }
  if (keyboardFacetIds.size === 0) {
    fail(rel(KEYBOARD_FACETS_DIR), "no keyboard-facet ids found — directory moved?");
  }

  for (const f of selfCheck()) fail("utilities/adaptation-catalog-lint/index.js", f);

  const files = walk(CATALOG_DIR, ".yaml");
  const seenIds = new Map(); // id -> file
  const familyCounts = new Map(); // family -> count

  for (const file of files) {
    const frel = rel(file);
    let rec;
    try {
      rec = YAML.parse(readFileSync(file, "utf8"));
    } catch (e) {
      fail(frel, `YAML parse error: ${e.message}`);
      continue;
    }

    // C1 schema
    for (const problem of validateRecord(rec)) fail(frel, `schema: ${problem}`);
    if (!rec || typeof rec.id !== "string") continue;

    // C2 id/path
    const stem = path.basename(file, ".yaml");
    if (rec.id !== stem) fail(frel, `id/path: id '${rec.id}' but filename stem is '${stem}'`);
    if (seenIds.has(rec.id)) fail(frel, `id/path: duplicate id '${rec.id}' (also in ${seenIds.get(rec.id)})`);
    else seenIds.set(rec.id, frel);

    // C3 no-always
    if (typeof rec.firingCondition === "string" && rec.firingCondition.trim().toLowerCase() === "always") {
      fail(frel, "no-always: firingCondition must not be 'always' (Decision 4 — non-interruption is the bar)");
    }

    // C5 real prefills + FR-008 cross-check
    const p = rec.prefill && typeof rec.prefill === "object" ? rec.prefill : {};
    for (const f of Array.isArray(p.facets) ? p.facets : []) {
      if (!keyboardFacetIds.has(f)) fail(frel, `prefills: '${f}' is not a real keyboard-facet id`);
    }
    if (typeof p.sessionFacet === "string" && p.sessionFacet.length > 0) {
      if (!sessionFacets.has(p.sessionFacet)) {
        fail(frel, `prefills: sessionFacet '${p.sessionFacet}' is not a real content/facets id`);
      } else if (!sessionFacets.get(p.sessionFacet).has(rec.id)) {
        fail(
          frel,
          `prefills: sessionFacet '${p.sessionFacet}' does not name this question in its consumers (FR-008 cross-check)`,
        );
      }
    }

    // C6 renders <-> module
    if (rec.renders === true && !questionIds.has(rec.id)) {
      fail(frel, `renders: '${rec.id}' has renders:true but no survey question module declares that id`);
    }

    // C8 consumers form
    for (const consumer of Array.isArray(rec.consumers) ? rec.consumers : []) {
      const isNamespaceSlug = typeof consumer === "string" && /^[a-z0-9-]+:[a-z0-9:-]+$/i.test(consumer);
      const isQuestionId = typeof consumer === "string" && questionIds.has(consumer);
      if (!isNamespaceSlug && !isQuestionId) {
        fail(frel, `consumers: '${consumer}' is neither 'namespace:slug' nor a real survey question id`);
      }
    }

    // tally for C7
    if (FAMILIES.includes(rec.family)) {
      familyCounts.set(rec.family, (familyCounts.get(rec.family) || 0) + 1);
    }
  }

  // C7 family floor — every family that HAS records needs >= FAMILY_FLOOR.
  // An empty family (0 records) is allowed so the lint stays green against an
  // empty/partial catalog mid-migration.
  for (const [family, count] of familyCounts) {
    if (count < FAMILY_FLOOR) {
      fail(rel(CATALOG_DIR), `family floor: family '${family}' has ${count} record(s), needs >= ${FAMILY_FLOOR} (FR-002/SC-001)`);
    }
  }

  // ---- report ----
  console.log(`adaptation-catalog-lint: ${files.length} catalog record(s), ${keyboardFacetIds.size} keyboard-facets, ${questionIds.size} survey questions known`);
  if (failures.length === 0) {
    console.log("adaptation-catalog-lint: all checks GREEN");
  } else {
    console.error(`adaptation-catalog-lint: ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  [ERROR] ${f.file}: ${f.text}`);
  }

  process.exit(failures.length === 0 ? 0 : 1);
}

main();

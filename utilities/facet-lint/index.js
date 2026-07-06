#!/usr/bin/env node
// facet-lint — validates the facet catalog (content/facets/**) and reports
// §3c defaults-debt coverage.
//
// The facet catalog is content-owned data (see content/facets/README.md).
// Each record declares what it FEEDS (consumers.prefills / consumers.proposes);
// this lint keeps those declarations honest against the real survey:
//
//   F1  schema        — every record parses and matches the record schema
//   F2  id/path       — id == "<family>.<slug>" and matches its directory + filename
//   F3  unique ids    — no duplicate facet ids across the catalog
//   F4  real prefills — every consumers.prefills entry is a real survey question id
//   F5  proposes form — every consumers.proposes entry is "namespace:slug"
//   F6  honest source — kind asked/confirmed with sourceStatus available and a
//                       "question:" source must reference a real question id
//   F7  self-check    — the schema validator MUST reject a known-bad record and
//                       MUST accept a known-good one (prove it isn't a no-op)
//
// Plus an INFORMATIONAL coverage report: survey questions no facet claims to
// prefill — the studio's §3c defaults debt. Reported, never failed on; the
// number's job is to go down.
//
// Run: `pnpm facet-lint`  (== `node utilities/facet-lint/index.js`)
// Wired into `pnpm lint` after crew-lint. Must stay GREEN.
//
// CommonJS, plain `node`. Only dependency is `yaml`, already a root
// devDependency, resolvable from the repo-root node_modules.

const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const REPO_ROOT = path.resolve(__dirname, "../..");
const FACETS_DIR = path.join(REPO_ROOT, "content", "facets");
const QUESTIONS_DIR = path.join(REPO_ROOT, "packages", "studio", "src", "survey", "questions");

const FAMILIES = ["env", "author", "community", "orth", "lineage", "dest"];
const VALUE_TYPES = ["enum", "boolean", "scalar", "vector", "set"];
const MODALITIES = ["physical", "touch", "both"];
const DERIVATION_KINDS = ["computed", "corpus", "confirmed", "asked"];
const SOURCE_STATUSES = ["available", "planned"];
const STATUSES = ["candidate", "validated", "active", "retired"];
const ELICITATION_COSTS = ["computed", "corpus", "confirmed", "asked"];
const SOURCE_PREFIXES = ["engine:", "corpus:", "question:", "oauth:", "session:", "planned:"];

const rel = (abs) => path.relative(REPO_ROOT, abs);

// ---------------------------------------------------------------------------
// Survey question ids (ground truth for F4/F6 and the coverage report)
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

function collectQuestionIds() {
  const ids = new Set();
  for (const file of walk(QUESTIONS_DIR, ".ts")) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bid:\s*"([a-z0-9_]+)"/g)) ids.add(m[1]);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Record schema validation (F1) — hand-rolled, mirrors content/facets/README.md
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

  need("id", typeof rec.id === "string" && /^[a-z]+\.[a-z0-9-]+$/.test(rec.id), "must be '<family>.<slug>' in kebab-case");
  need("family", FAMILIES.includes(rec.family), `must be one of ${FAMILIES.join("|")}`);
  if (typeof rec.id === "string" && FAMILIES.includes(rec.family)) {
    need("id", rec.id.startsWith(rec.family + "."), `must start with '${rec.family}.'`);
  }
  need("title", typeof rec.title === "string" && rec.title.trim().length > 0, "required non-empty string");
  need("description", typeof rec.description === "string" && rec.description.trim().length > 0, "required non-empty string");
  need("valueType", VALUE_TYPES.includes(rec.valueType), `must be one of ${VALUE_TYPES.join("|")}`);
  if (rec.valueType === "enum") {
    need("values", Array.isArray(rec.values) && rec.values.length >= 2, "required (>=2 entries) when valueType is enum");
  }
  need("modality", MODALITIES.includes(rec.modality), `must be one of ${MODALITIES.join("|")}`);

  need("derivations", Array.isArray(rec.derivations) && rec.derivations.length >= 1, "required non-empty array");
  if (Array.isArray(rec.derivations)) {
    rec.derivations.forEach((d, i) => {
      const at = `derivations[${i}]`;
      if (d === null || typeof d !== "object") {
        problems.push(`${at}: not a mapping`);
        return;
      }
      need(`${at}.kind`, DERIVATION_KINDS.includes(d.kind), `must be one of ${DERIVATION_KINDS.join("|")}`);
      need(
        `${at}.source`,
        typeof d.source === "string" && SOURCE_PREFIXES.some((p) => d.source.startsWith(p)),
        `must start with one of ${SOURCE_PREFIXES.join(" ")}`,
      );
      need(`${at}.sourceStatus`, SOURCE_STATUSES.includes(d.sourceStatus), `must be one of ${SOURCE_STATUSES.join("|")}`);
    });
  }

  const c = rec.consumers;
  need("consumers", c !== null && typeof c === "object" && !Array.isArray(c), "required mapping with prefills + proposes");
  if (c && typeof c === "object") {
    need("consumers.prefills", Array.isArray(c.prefills), "required array (may be empty)");
    need("consumers.proposes", Array.isArray(c.proposes), "required array (may be empty)");
  }

  need("provenanceLabel", typeof rec.provenanceLabel === "string" && rec.provenanceLabel.trim().length > 0, "required non-empty string");
  need("status", STATUSES.includes(rec.status), `must be one of ${STATUSES.join("|")}`);

  const m = rec.metrics;
  need("metrics", m !== null && typeof m === "object" && !Array.isArray(m), "required mapping");
  if (m && typeof m === "object") {
    need("metrics.predictiveLift", m.predictiveLift === null || typeof m.predictiveLift === "number", "must be number or null");
    need("metrics.discrimination", m.discrimination === null || typeof m.discrimination === "number", "must be number or null");
    need("metrics.elicitationCost", ELICITATION_COSTS.includes(m.elicitationCost), `must be one of ${ELICITATION_COSTS.join("|")}`);
  }

  if (rec.relatedAxes !== undefined) {
    need(
      "relatedAxes",
      Array.isArray(rec.relatedAxes) && rec.relatedAxes.every((a) => /^A[1-7]a?$/.test(a)),
      "must be an array of axis ids (A1..A7, A3a, A7a)",
    );
  }
  return problems;
}

// ---------------------------------------------------------------------------
// F7 — self-verification: the validator must not be a no-op
// ---------------------------------------------------------------------------

function selfCheck() {
  const good = {
    id: "env.self-check",
    family: "env",
    title: "t",
    description: "d",
    valueType: "boolean",
    modality: "both",
    derivations: [{ kind: "computed", source: "engine:x", sourceStatus: "available" }],
    consumers: { prefills: [], proposes: [] },
    provenanceLabel: "p",
    status: "candidate",
    metrics: { predictiveLift: null, discrimination: null, elicitationCost: "computed" },
  };
  const bad = { id: "WRONG FORMAT", family: "nonsense", derivations: "not-an-array" };
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

  const questionIds = collectQuestionIds();
  if (questionIds.size === 0) {
    fail(rel(QUESTIONS_DIR), "no survey question ids found — extraction broken or directory moved");
  }

  for (const f of selfCheck()) fail("utilities/facet-lint/index.js", f);

  const files = walk(FACETS_DIR, ".yaml");
  if (files.length === 0) fail(rel(FACETS_DIR), "no facet records found");

  const seenIds = new Map(); // id -> file
  const prefilledQuestions = new Set();

  for (const file of files) {
    const frel = rel(file);
    let rec;
    try {
      rec = YAML.parse(readFileSync(file, "utf8"));
    } catch (e) {
      fail(frel, `YAML parse error: ${e.message}`);
      continue;
    }

    // F1 schema
    for (const p of validateRecord(rec)) fail(frel, `schema: ${p}`);
    if (!rec || typeof rec.id !== "string") continue;

    // F2 id/path
    const dirFamily = path.basename(path.dirname(file));
    const slug = path.basename(file, ".yaml");
    const expected = `${dirFamily}.${slug}`;
    if (rec.id !== expected) fail(frel, `id/path: id '${rec.id}' but path implies '${expected}'`);

    // F3 unique ids
    if (seenIds.has(rec.id)) fail(frel, `duplicate id '${rec.id}' (also in ${seenIds.get(rec.id)})`);
    else seenIds.set(rec.id, frel);

    // F4 real prefills
    const prefills = rec.consumers && Array.isArray(rec.consumers.prefills) ? rec.consumers.prefills : [];
    for (const q of prefills) {
      if (!questionIds.has(q)) fail(frel, `prefills: '${q}' is not a known survey question id`);
      else prefilledQuestions.add(q);
    }

    // F5 proposes form
    const proposes = rec.consumers && Array.isArray(rec.consumers.proposes) ? rec.consumers.proposes : [];
    for (const p of proposes) {
      if (typeof p !== "string" || !/^[a-z0-9-]+:[a-z0-9:-]+$/i.test(p)) {
        fail(frel, `proposes: '${p}' is not 'namespace:slug' form`);
      }
    }

    // F6 honest sources
    for (const d of Array.isArray(rec.derivations) ? rec.derivations : []) {
      if (
        d &&
        typeof d.source === "string" &&
        d.source.startsWith("question:") &&
        d.sourceStatus === "available"
      ) {
        const q = d.source.slice("question:".length);
        if (!questionIds.has(q)) fail(frel, `derivation source '${d.source}' marked available but question does not exist`);
      }
    }
  }

  // ---- report ----
  const uncovered = [...questionIds].filter((q) => !prefilledQuestions.has(q)).sort();

  console.log(`facet-lint: ${files.length} facet records, ${questionIds.size} survey questions known`);
  if (failures.length === 0) {
    console.log("facet-lint: all checks GREEN");
  } else {
    console.error(`facet-lint: ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  [FAIL] ${f.file}: ${f.text}`);
  }

  console.log(
    `facet-lint: coverage — ${prefilledQuestions.size}/${questionIds.size} questions claimed by a facet prefill; ` +
      `${uncovered.length} uncovered (the §3c defaults debt)`,
  );
  if (process.argv.includes("--coverage")) {
    for (const q of uncovered) console.log(`  [UNCOVERED] ${q}`);
  } else if (uncovered.length > 0) {
    console.log("facet-lint: run with --coverage to list uncovered question ids");
  }

  process.exit(failures.length === 0 ? 0 : 1);
}

main();

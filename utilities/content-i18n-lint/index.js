#!/usr/bin/env node
// content-i18n-lint — the Tier B content-i18n drift gate (spec 046 T031).
//
// Tier B's counterpart to utilities/i18n-catalog-lint (Tier A): fails if the
// committed content/i18n/en/*.json sidecar catalogs are out of sync with the
// content records they were extracted from (content/patterns/**/*.yaml,
// content/adaptation-questions/*.yaml, packages/contracts/data/criteria.json)
// — i.e. someone edited a pattern's/criterion's prose but did not re-run the
// extractor. Also checks that every non-English locale directory under
// content/i18n/ has, for each file it has started translating, the same KEY
// SET as the English source (values legitimately differ — those are
// translations).
//
// Read-only: never writes to content/i18n/**.
//
// Reimplements utilities/i18n-content-extract/extract.ts's field-walk in
// plain JS (fs + the `yaml` root devDependency only) rather than importing
// that tool or @keyboard-studio/contracts directly:
//   - i18n-content-extract is TS/tsx-run with no build step (see its own
//     package.json) — not requireable from plain `node`.
//   - @keyboard-studio/contracts DOES have a build step, but its dist/ is
//     emitted for `moduleResolution: "Bundler"` consumers (Vite/Vitest) —
//     relative imports between dist files omit the `.js` extension
//     (`import { makePattern } from "./pattern"`), which plain Node's ESM
//     resolver rejects (ERR_MODULE_NOT_FOUND). Confirmed empirically; not a
//     viable path without adding a bundler-aware loader.
// So this checker is a hand-kept mirror of extract.ts's logic, same trade-off
// utilities/facet-index-lint/index.js already documents and accepts for the
// same reason. `packages/contracts/data/criteria.json` is read directly
// (plain JSON, no schema step needed for the two fields this cares about).
// Keep this in sync with extract.ts if either changes (research.md D8/D9).
//
// Run: `node utilities/content-i18n-lint/index.js` (wired into `pnpm lint`
// after i18n-catalog-lint).

const { readFileSync, readdirSync, existsSync } = require("node:fs");
const path = require("node:path");
const { parse: parseYaml } = require("yaml");
const { checkEnglishCollapse } = require("../i18n-collapse-guard/index.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONTENT_I18N_DIR = path.join(REPO_ROOT, "content", "i18n");
const PATTERNS_DIR = path.join(REPO_ROOT, "content", "patterns");
const ADAPTATION_QUESTIONS_DIR = path.join(REPO_ROOT, "content", "adaptation-questions");
const CRITERIA_DATA_PATH = path.join(REPO_ROOT, "packages", "contracts", "data", "criteria.json");
const SOURCE_LOCALE = "en";
const CATALOG_FILES = ["patterns.json", "adaptationQuestions.json", "criteria.json"];
// Parity-only catalogs (spec 050 T014): their English source is TS
// question-definition modules (packages/studio/src/survey/questions/**), which
// this plain-JS tool cannot re-extract the way it re-derives the other three
// from YAML / criteria.json (research.md D7). So we do NOT freshness-check them
// here — that is delegated to the extractor CLI's `--check` mode, wired into
// `pnpm lint` as its own step. We only verify each target locale's key set
// matches the COMMITTED en/flowQuestions.json (whose freshness that CLI step
// separately guarantees).
const PARITY_ONLY_FILES = ["flowQuestions.json"];

// Per-key optional parity (spec 055 research.md D8 / contracts/catalog-audit-label.contract.md
// §3): a target locale MAY omit a key matching this pattern without being
// reported missing — an extra key still fails, and every other key stays
// strictly parity-checked. Keyed by catalog file name; only flowQuestions.json
// has an optional field today.
const OPTIONAL_KEY_PATTERNS = {
  "flowQuestions.json": /^content\.flowQuestion\.[^.]+\.audit_label$/,
};

// D8 id derivation (research.md): a record id may itself contain literal
// dots (e.g. a criterion id like "4.3-copyright-holder-is-authorized") —
// replace them with `_` when forming a catalog-key segment only. Duplicated
// here (and in packages/studio/src/lib/contentI18n.ts, and
// utilities/i18n-content-extract/extract.ts) rather than shared, same
// rationale as contentI18n.ts's copy: each lives in a different module
// boundary with no shared build step reaching all three.
function slugifyIdSegment(id) {
  return id.replace(/\./g, "_");
}

function collectYamlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectYamlFiles(full));
    } else if (path.extname(entry.name) === ".yaml") {
      out.push(full);
    }
  }
  return out;
}

function readCatalog(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function canonical(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return JSON.stringify(out);
}

function keySet(obj) {
  return Object.keys(obj).sort();
}

/**
 * Pattern prose: title, description, questions[].prompt,
 * questions[].options[].label — same allowlist as extract.ts's
 * extractPatternStrings (research.md D8). No RawPatternSchema/toPattern step
 * here (see file header) — title/description/questions/options pass straight
 * through both, so a direct read of the parsed YAML is equivalent for this
 * checker's purpose. Records missing a required string field are skipped,
 * same graceful-skip behavior as the real extractor and the engine loader.
 */
function extractPatternStrings() {
  const out = {};
  const seen = new Set();
  for (const file of collectYamlFiles(PATTERNS_DIR)) {
    let raw;
    try {
      raw = parseYaml(readFileSync(file, "utf8"));
    } catch {
      continue; // a content author's YAML typo is a content-lint concern, not this gate's
    }
    if (raw === null || typeof raw !== "object") continue;
    const { id, title, description, questions } = raw;
    if (typeof id !== "string" || typeof title !== "string" || typeof description !== "string") continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const base = slugifyIdSegment(id);
    out[`content.pattern.${base}.title`] = title;
    out[`content.pattern.${base}.description`] = description;
    for (const question of Array.isArray(questions) ? questions : []) {
      if (typeof question?.id !== "string" || typeof question?.prompt !== "string") continue;
      const questionId = slugifyIdSegment(question.id);
      out[`content.pattern.${base}.question.${questionId}.prompt`] = question.prompt;
      for (const option of Array.isArray(question.options) ? question.options : []) {
        if (typeof option?.value !== "string" || typeof option?.label !== "string") continue;
        const optionId = slugifyIdSegment(option.value);
        out[`content.pattern.${base}.question.${questionId}.option.${optionId}.label`] = option.label;
      }
    }
  }
  return out;
}

/** Adaptation-question metadata prose: provenanceLabel only (D8). */
function extractAdaptationQuestionStrings() {
  const out = {};
  const seen = new Set();
  if (!existsSync(ADAPTATION_QUESTIONS_DIR)) return out;
  for (const entry of readdirSync(ADAPTATION_QUESTIONS_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() || path.extname(entry.name) !== ".yaml") continue;
    const file = path.join(ADAPTATION_QUESTIONS_DIR, entry.name);
    let raw;
    try {
      raw = parseYaml(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (raw === null || typeof raw !== "object") continue;
    const { id, provenanceLabel } = raw;
    if (typeof id !== "string" || typeof provenanceLabel !== "string") continue;
    if (provenanceLabel.trim().length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out[`content.adaptationQuestion.${slugifyIdSegment(id)}.provenanceLabel`] = provenanceLabel;
  }
  return out;
}

/** Criteria prose: description (all bands), checklistText (red-checklist only). */
function extractCriteriaStrings() {
  const out = {};
  const criteria = JSON.parse(readFileSync(CRITERIA_DATA_PATH, "utf8"));
  for (const criterion of criteria) {
    const base = slugifyIdSegment(criterion.id);
    out[`content.criteria.${base}.description`] = criterion.description;
    if (criterion.band === "red-checklist") {
      out[`content.criteria.${base}.checklistText`] = criterion.preSubmitChecklistText;
    }
  }
  return out;
}

function checkFreshness(problems, warnings, englishDir, name, fresh) {
  const committed = readCatalog(path.join(englishDir, name));
  if (committed === null) {
    problems.push(`[en/${name}] committed catalog is missing entirely — run the extractor.`);
    return;
  }
  if (canonical(fresh) === canonical(committed)) return;

  const added = keySet(fresh).filter((k) => !(k in committed));
  const removed = keySet(committed).filter((k) => !(k in fresh));
  const changed = keySet(fresh).filter((k) => k in committed && committed[k] !== fresh[k]);

  if (added.length || removed.length) {
    problems.push(
      `[en/${name}] catalog out of date` +
        (added.length ? ` — added: ${added.join(", ")}` : "") +
        (removed.length ? ` — removed: ${removed.join(", ")}` : ""),
    );
  }
  if (changed.length) {
    warnings.push(
      `[en/${name}] source prose changed (translations may now be stale, not blocking): ${changed.join(", ")}`,
    );
  }
}

function checkTargetLocaleParity(problems, contentI18nDir, name, freshEnglish) {
  if (!existsSync(contentI18nDir)) return;
  const locales = readdirSync(contentI18nDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== SOURCE_LOCALE)
    .map((d) => d.name);
  const optionalKeyPattern = OPTIONAL_KEY_PATTERNS[name];

  for (const locale of locales) {
    const file = path.join(contentI18nDir, locale, name);
    if (!existsSync(file)) continue; // hasn't started translating this catalog yet — not a gap
    const target = readCatalog(file);
    const missing = keySet(freshEnglish).filter(
      (k) => !(k in target) && !(optionalKeyPattern && optionalKeyPattern.test(k)),
    );
    const extra = keySet(target).filter((k) => !(k in freshEnglish));
    if (missing.length || extra.length) {
      problems.push(
        `[${locale}/${name}] key set out of sync with en/${name}` +
          (missing.length ? ` — missing: ${missing.join(", ")}` : "") +
          (extra.length ? ` — stale/extra: ${extra.join(", ")}` : ""),
      );
    }

    // Parity above is blind to a catalog that kept every key but lost every
    // translation — a Crowdin export of an untranslated project returns the
    // English source text under each original key. See i18n-collapse-guard.
    const collapse = checkEnglishCollapse({
      en: freshEnglish,
      target,
      locale,
      catalog: name,
    });
    if (collapse) problems.push(collapse);
  }
}

/**
 * Pure check core, parameterized so it can run against a temp content/i18n
 * tree in tests instead of the real repo (spec 050 T013). Returns the
 * accumulated problems/warnings rather than exiting, so callers decide how to
 * report. `freshCatalogs` supplies the freshly-extracted English maps for the
 * freshness-checked `CATALOG_FILES`; `parityOnlyFiles` are key-set-checked
 * against their committed en/*.json (see PARITY_ONLY_FILES).
 */
function lint({ contentI18nDir, freshCatalogs, parityOnlyFiles }) {
  const problems = [];
  const warnings = [];
  const englishDir = path.join(contentI18nDir, SOURCE_LOCALE);

  for (const name of CATALOG_FILES) {
    checkFreshness(problems, warnings, englishDir, name, freshCatalogs[name]);
    checkTargetLocaleParity(problems, contentI18nDir, name, freshCatalogs[name]);
  }

  for (const name of parityOnlyFiles) {
    const committedEnglish = readCatalog(path.join(englishDir, name));
    if (committedEnglish === null) {
      problems.push(`[en/${name}] committed catalog is missing entirely — run the extractor.`);
      continue;
    }
    checkTargetLocaleParity(problems, contentI18nDir, name, committedEnglish);
  }

  return { problems, warnings };
}

function main() {
  const freshCatalogs = {
    "patterns.json": extractPatternStrings(),
    "adaptationQuestions.json": extractAdaptationQuestionStrings(),
    "criteria.json": extractCriteriaStrings(),
  };

  const { problems, warnings } = lint({
    contentI18nDir: CONTENT_I18N_DIR,
    freshCatalogs,
    parityOnlyFiles: PARITY_ONLY_FILES,
  });

  if (warnings.length > 0) {
    console.warn("[WARN] content-i18n-lint: English source prose changed under existing ids.");
    for (const w of warnings) console.warn("  - " + w);
    console.warn(
      "\nRun npx tsx utilities/i18n-content-extract/cli.ts to pick these up (not required to pass).",
    );
  }

  if (problems.length > 0) {
    console.error("[ERROR] content-i18n-lint: Tier B content catalogs are out of sync.");
    for (const p of problems) console.error("  - " + p);
    console.error(
      "\nFix: npx tsx utilities/i18n-content-extract/cli.ts, then commit the updated catalog(s)\n" +
        "(or translate the missing/stale keys in the target-locale file for a key-set-parity failure).",
    );
    process.exit(1);
  }

  console.log("[OK] content-i18n-lint: Tier B content catalogs are in sync.");
}

module.exports = { lint, slugifyIdSegment, CATALOG_FILES, PARITY_ONLY_FILES };

// Only run when invoked directly (`node index.js`), not when index.test.js
// imports `lint` for testing.
if (require.main === module) main();

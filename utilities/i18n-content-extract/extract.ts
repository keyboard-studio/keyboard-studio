// Tier B content-i18n extraction (spec 046 T027). Walks a fixed,
// render-verified allowlist of prose fields — decided in
// specs/046-i18n-localization/research.md D8 — out of content records into
// flat `content.<type>.<id>.<field>` maps. Deliberately does NOT extract
// every string value (that would leak control fields to translators, the
// D4-rejected raw-mapping approach); each record type below only reads the
// specific fields D8 confirmed actually render to an end user today.

import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { ALL_CRITERIA, RawPatternSchema, toPattern } from "@keyboard-studio/contracts";
import type { Pattern } from "@keyboard-studio/contracts";

export type ContentCatalog = Record<string, string>;

export interface ContentCatalogs {
  patterns: ContentCatalog;
  adaptationQuestions: ContentCatalog;
  criteria: ContentCatalog;
}

/**
 * A record id (e.g. a criterion id like "4.3-copyright-holder-is-authorized")
 * may itself contain literal dots. D8: replace them with `_` when forming a
 * catalog-key segment so the flat key never contains an internally-ambiguous
 * dot run against the project's `area ("." segment)+` id grammar. The
 * record's own `id` field is untouched — this only affects the generated key.
 */
export function slugifyIdSegment(id: string): string {
  return id.replace(/\./g, "_");
}

function collectYamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectYamlFiles(full));
    } else if (extname(entry.name) === ".yaml") {
      out.push(full);
    }
  }
  return out;
}

/**
 * Pattern prose: `title`, `description`, `questions[].prompt`,
 * `questions[].options[].label`. Everything else on `Pattern` (id,
 * strategyId, kmnFragment, etc.) is control and never walked. The nine
 * YAML-only extended-metadata fields (notes, skeleton.*, provenance[].note,
 * demo.*, frequency_in_corpus) are excluded per D8 — none currently reach a
 * render site, several are silently dropped by `toPattern()` itself.
 */
export function extractPatternStrings(patternsDir: string): ContentCatalog {
  const out: ContentCatalog = {};
  const seenPatternIds = new Set<string>();
  for (const file of collectYamlFiles(patternsDir)) {
    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(file, "utf8"));
    } catch (e) {
      // Mirrors the engine loader's own graceful-skip behavior
      // (packages/engine/src/pattern-library/loader.ts) — one content
      // author's YAML typo must not take down extraction for every other
      // pattern.
      console.warn(`[i18n-content-extract] skipping ${file}: YAML parse error: ${String(e)}`);
      continue;
    }
    const parsed = RawPatternSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[i18n-content-extract] skipping ${file}: schema-invalid`);
      continue;
    }
    const pattern: Pattern = toPattern(parsed.data);
    if (seenPatternIds.has(pattern.id)) {
      console.warn(`[i18n-content-extract] skipping ${file}: duplicate pattern id "${pattern.id}" (first occurrence kept)`);
      continue;
    }
    seenPatternIds.add(pattern.id);

    const base = slugifyIdSegment(pattern.id);
    out[`content.pattern.${base}.title`] = pattern.title;
    out[`content.pattern.${base}.description`] = pattern.description;
    for (const question of pattern.questions) {
      const questionId = slugifyIdSegment(question.id);
      out[`content.pattern.${base}.question.${questionId}.prompt`] = question.prompt;
      for (const option of question.options ?? []) {
        const optionId = slugifyIdSegment(option.value);
        out[`content.pattern.${base}.question.${questionId}.option.${optionId}.label`] = option.label;
      }
    }
  }
  return out;
}

/**
 * Adaptation-question metadata prose: `provenanceLabel` only. `elicits` is
 * excluded per D8 — it's a dev-facing gloss consumed only by tests today, not
 * end-user copy. There is no shared contracts schema for this record type
 * (it's studio-only, see `packages/studio/src/adaptation/catalog.ts`), so
 * this reads the two fields directly rather than depending on studio's
 * internal `QuestionRecord` type.
 */
export function extractAdaptationQuestionStrings(dir: string): ContentCatalog {
  const out: ContentCatalog = {};
  const seenIds = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || extname(entry.name) !== ".yaml") continue;
    const file = join(dir, entry.name);
    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(file, "utf8"));
    } catch (e) {
      console.warn(`[i18n-content-extract] skipping ${file}: YAML parse error: ${String(e)}`);
      continue;
    }
    if (raw === null || typeof raw !== "object") continue;
    const { id, provenanceLabel } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof provenanceLabel !== "string") continue;
    // An empty string has nothing for a translator to act on.
    if (provenanceLabel.trim().length === 0) continue;
    if (seenIds.has(id)) {
      console.warn(`[i18n-content-extract] skipping ${file}: duplicate adaptation-question id "${id}" (first occurrence kept)`);
      continue;
    }
    seenIds.add(id);
    out[`content.adaptationQuestion.${slugifyIdSegment(id)}.provenanceLabel`] = provenanceLabel;
  }
  return out;
}

/**
 * Criteria prose: `description` (all bands) and `preSubmitChecklistText`
 * (red-checklist band only). `section` is deliberately excluded — D8 flags
 * it as a candidate pending a confirmed render site, not yet in scope.
 */
export function extractCriteriaStrings(): ContentCatalog {
  const out: ContentCatalog = {};
  for (const criterion of ALL_CRITERIA) {
    const base = slugifyIdSegment(criterion.id);
    out[`content.criteria.${base}.description`] = criterion.description;
    if (criterion.band === "red-checklist") {
      out[`content.criteria.${base}.checklistText`] = criterion.preSubmitChecklistText;
    }
  }
  return out;
}

export interface ContentRoots {
  patternsDir: string;
  adaptationQuestionsDir: string;
}

export function extractContentCatalogs(roots: ContentRoots): ContentCatalogs {
  return {
    patterns: extractPatternStrings(roots.patternsDir),
    adaptationQuestions: extractAdaptationQuestionStrings(roots.adaptationQuestionsDir),
    criteria: extractCriteriaStrings(),
  };
}

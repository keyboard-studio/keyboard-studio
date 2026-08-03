// i18n-collapse-guard — shared "target catalog collapsed to English" detector.
//
// WHY THIS EXISTS
// ---------------
// Both catalog gates (i18n-catalog-lint for Tier A, content-i18n-lint for
// Tier B) check target locales for KEY-SET parity only, deliberately: values
// legitimately differ between locales, because that is what a translation is.
//
// That leaves one shape of corruption invisible to both. A Crowdin export of a
// project with no translations returns the SOURCE TEXT for every untranslated
// string -- not an empty value, and not a missing key. The resulting catalog
// has a byte-identical key set and passes every existing check, while having
// silently replaced every translation with English.
//
// This is not hypothetical: the scheduled download workflow produced exactly
// that catalog, and only a GitHub permissions error stopped it from opening a
// PR that reverted 1076 French strings. See the Crowdin round-trip issue.
//
// WHY A RATIO, NOT AN EXACT MATCH
// -------------------------------
// Some target values SHOULD equal English -- proper nouns, "OK", punctuation-
// only strings, symbols. Measured against the committed catalogs, real French
// sits at 0.0-1.2% identical. A collapsed export is ~100%. The gap is wide
// enough that any threshold in between is safe; COLLAPSE_THRESHOLD is set at
// the midpoint rather than near either edge.
//
// EMPTY VALUES ARE NOT COLLAPSE
// -----------------------------
// An empty target value is the intended representation of "not translated yet"
// (the loader falls back to the English source via the explicit id). Empties
// are therefore excluded from the ratio rather than counted as matches -- so
// bootstrapping a new locale as all-empty passes, while committing that same
// locale as all-English fails. That asymmetry is the point: it steers a new
// locale toward the representation the runtime actually expects.

"use strict";

/** Fraction of non-empty target values that may equal English before we treat
 *  the catalog as a collapsed export rather than a translation. */
const COLLAPSE_THRESHOLD = 0.5;

/** Below this many comparable keys the ratio is too noisy to be meaningful. */
const MIN_KEYS = 20;

/**
 * Detect a target catalog that has collapsed into its English source.
 *
 * @param {object} en      source-locale catalog, { id: text }
 * @param {object} target  target-locale catalog, { id: text }
 * @returns {{collapsed: boolean, comparable: number, identical: number,
 *            empty: number, ratio: number, skipped: boolean}}
 */
function measureCollapse(en, target) {
  let comparable = 0;
  let identical = 0;
  let empty = 0;

  for (const key of Object.keys(en)) {
    if (!(key in target)) continue;
    const value = target[key];
    if (typeof value !== "string" || value === "") {
      empty++;
      continue;
    }
    comparable++;
    if (value === en[key]) identical++;
  }

  const skipped = comparable < MIN_KEYS;
  const ratio = comparable === 0 ? 0 : identical / comparable;

  return {
    collapsed: !skipped && ratio > COLLAPSE_THRESHOLD,
    comparable,
    identical,
    empty,
    ratio,
    skipped,
  };
}

/**
 * Problem string for a collapsed catalog, or null when it is healthy.
 *
 * @param {object}  args
 * @param {object}  args.en       source-locale catalog
 * @param {object}  args.target   target-locale catalog
 * @param {string}  args.locale   e.g. "fr"
 * @param {string}  args.catalog  display name, e.g. "messages.json"
 * @returns {string|null}
 */
function checkEnglishCollapse({ en, target, locale, catalog }) {
  const m = measureCollapse(en, target);
  if (!m.collapsed) return null;

  const pct = (m.ratio * 100).toFixed(1);
  return (
    `[${locale}] ${catalog} has collapsed into the English source — ` +
    `${m.identical}/${m.comparable} non-empty values (${pct}%) are byte-identical to en. ` +
    `This is what a Crowdin export looks like when the project holds no translations ` +
    `for this locale: untranslated strings come back as SOURCE TEXT, so the key set ` +
    `still matches and only the values are lost. Do not commit this — it would revert ` +
    `real translations. Verify the Crowdin project actually has translations for ` +
    `'${locale}' (and that the download read the same branch the translations live on) ` +
    `before regenerating. To bootstrap a genuinely new locale, commit EMPTY values, ` +
    `not English ones.`
  );
}

module.exports = {
  COLLAPSE_THRESHOLD,
  MIN_KEYS,
  measureCollapse,
  checkEnglishCollapse,
};

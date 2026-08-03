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
// TWO RULES, BECAUSE ONE THRESHOLD CANNOT COVER BOTH SIZES
// --------------------------------------------------------
// Some target values SHOULD equal English -- proper nouns, "OK", punctuation-
// only strings, symbols. Measured against the committed catalogs, real French
// sits at 0.0-1.2% identical. A collapsed export is ~100%. So a ratio test with
// a threshold anywhere in that gap separates them cleanly...
//
// ...but only once there are enough values for a ratio to mean anything. With 4
// comparable values, one legitimately-identical proper noun is already 25%, and
// with 2 it is 50%. That is why the ratio rule has a MIN_KEYS floor.
//
// The floor was originally the whole story, and it left a hole: a catalog below
// it was not checked at all. `content/i18n/en/adaptationQuestions.json` has 9
// keys, so a Crowdin export could replace all 9 French values with English and
// pass the gate -- verified against the real wiped artifact, which the guard
// caught in four catalogs and waved through in that one.
//
// The fix is a second rule rather than a lower threshold. The noise argument
// above is about *ratios*; it does not apply to an EXACT 100%. A genuine
// translation of even a handful of strings essentially never comes back
// byte-identical on every single one, whereas byte-identical-on-everything is
// precisely the signature of a source-text export. So:
//
//   ratio rule  -- comparable >= MIN_KEYS       and ratio > COLLAPSE_THRESHOLD
//   exact rule  -- comparable >= MIN_KEYS_EXACT and identical === comparable
//
// Between MIN_KEYS_EXACT and MIN_KEYS a catalog is covered by the exact rule
// only: a 5-key catalog at 4/5 identical still passes, because that genuinely
// is the noise zone. Total collapse is the shape worth catching there, and it
// is the shape a broken export actually produces.
//
// The exact rule accepts one false positive by design: a small catalog whose
// values legitimately all equal English (all brand names, all symbols). The
// MIN_KEYS_EXACT floor keeps that from firing on 1-2 value catalogs, and the
// message says what to do about it -- commit empty values, which is what the
// runtime wants anyway.
//
// EMPTY VALUES ARE NOT COLLAPSE
// -----------------------------
// An empty target value is the intended representation of "not translated yet"
// (the loader falls back to the English source via the explicit id). Empties
// are therefore excluded from the ratio rather than counted as matches -- so
// bootstrapping a new locale as all-empty passes, while committing that same
// locale as all-English fails. That asymmetry is the point: it steers a new
// locale toward the representation the runtime actually expects.
//
// A SKIP IS REPORTED, NEVER SILENT
// --------------------------------
// Below MIN_KEYS_EXACT neither rule can say anything, so the catalog really is
// unchecked. That returns a WARNING naming the catalog and its comparable
// count, because a gate that silently declines to check something reads exactly
// like a gate that checked it and found nothing -- which is the failure mode
// this whole module exists to close, one level up.

"use strict";

/** Fraction of non-empty target values that may equal English before we treat
 *  the catalog as a collapsed export rather than a translation. Ratio rule. */
const COLLAPSE_THRESHOLD = 0.5;

/** Ratio-rule floor: below this many comparable keys a ratio is too noisy. */
const MIN_KEYS = 20;

/** Exact-rule floor: below this many comparable keys even "all of them are
 *  English" is plausible noise, so nothing is claimed. */
const MIN_KEYS_EXACT = 3;

/**
 * Measure how far a target catalog has collapsed toward its English source.
 *
 * @param {object} en      source-locale catalog, { id: text }
 * @param {object} target  target-locale catalog, { id: text }
 * @returns {{collapsed: boolean, rule: "ratio"|"exact"|null, comparable: number,
 *            identical: number, empty: number, ratio: number, skipped: boolean}}
 *   `rule` names which rule fired (null when none did). `skipped` is true only
 *   when there were too few comparable values for EITHER rule to apply.
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

  const ratio = comparable === 0 ? 0 : identical / comparable;
  const ratioRule = comparable >= MIN_KEYS && ratio > COLLAPSE_THRESHOLD;
  const exactRule = comparable >= MIN_KEYS_EXACT && identical === comparable;

  return {
    collapsed: ratioRule || exactRule,
    // Report the ratio rule when both fire: it is the stronger statement, and a
    // 100%-identical large catalog satisfies both.
    rule: ratioRule ? "ratio" : exactRule ? "exact" : null,
    comparable,
    identical,
    empty,
    ratio,
    skipped: comparable < MIN_KEYS_EXACT,
  };
}

/**
 * Check one target catalog for collapse into English.
 *
 * @param {object}  args
 * @param {object}  args.en       source-locale catalog
 * @param {object}  args.target   target-locale catalog
 * @param {string}  args.locale   e.g. "fr"
 * @param {string}  args.catalog  display name, e.g. "messages.json"
 * @returns {{problem: string|null, note: string|null}}
 *   `problem` is a hard failure (the catalog collapsed). `note` is a
 *   non-blocking advisory that the catalog was too small to check at all. At
 *   most one of the two is ever non-null.
 *
 *   `note`, not `warning`, on purpose: the callers keep those in separate
 *   channels. Their `warnings` array means "stale — re-run the extractor", and
 *   it prints that remediation. A note has no remediation, because nothing is
 *   wrong and there is nothing to run. Feeding one into the other's channel
 *   prints an instruction that does not apply.
 */
function checkEnglishCollapse({ en, target, locale, catalog }) {
  const m = measureCollapse(en, target);

  if (m.collapsed) {
    const pct = (m.ratio * 100).toFixed(1);
    const basis =
      m.rule === "exact"
        ? `every one of its ${m.comparable} non-empty values is byte-identical to en`
        : `${m.identical}/${m.comparable} non-empty values (${pct}%) are byte-identical to en`;
    return {
      problem:
        `[${locale}] ${catalog} has collapsed into the English source — ${basis}. ` +
        `This is what a Crowdin export looks like when the project holds no translations ` +
        `for this locale: untranslated strings come back as SOURCE TEXT, so the key set ` +
        `still matches and only the values are lost. Do not commit this — it would revert ` +
        `real translations. Verify the Crowdin project actually has translations for ` +
        `'${locale}' (and that the download read the same branch the translations live on) ` +
        `before regenerating. To bootstrap a genuinely new locale, commit EMPTY values, ` +
        `not English ones.`,
      note: null,
    };
  }

  // Too small for either rule. Not a failure, but say so rather than passing in
  // silence. An all-empty target (comparable === 0) is the intended "not
  // translated yet" shape, and a target with no overlapping keys at all is
  // already reported by the key-set parity check — neither needs a note.
  if (m.skipped && m.comparable > 0) {
    return {
      problem: null,
      note:
        `[${locale}] ${catalog} has only ${m.comparable} non-empty value(s) — below the ` +
        `English-collapse floor of ${MIN_KEYS_EXACT}, so it was NOT checked for collapse. ` +
        `Too few values for "all of them are English" to mean anything. If this catalog ` +
        `grows, the guard starts covering it automatically. No action needed.`,
    };
  }

  return { problem: null, note: null };
}

module.exports = {
  COLLAPSE_THRESHOLD,
  MIN_KEYS,
  MIN_KEYS_EXACT,
  measureCollapse,
  checkEnglishCollapse,
};

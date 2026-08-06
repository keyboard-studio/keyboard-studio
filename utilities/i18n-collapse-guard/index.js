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

// ---------------------------------------------------------------------------
// BASELINE REGRESSION GUARD
// ---------------------------------------------------------------------------
// checkEnglishCollapse above compares a target locale against English, in the
// SAME commit. That is blind to a different corruption shape: a target catalog
// that goes from translated to EMPTY. Emptying isn't collapse-into-English (the
// exclude-empties rule above says so on purpose, to let a new locale bootstrap
// as all-empty) -- it needs a comparison en can never provide, against what
// this same locale/catalog looked like BEFORE.
//
// This stopped being hypothetical the moment the Crowdin download workflow's
// `skip_untranslated_strings` setting flipped to `true`: a download from a
// project holding no translations for a locale now returns EMPTY values
// instead of English source text, which is exactly the shape
// checkEnglishCollapse is designed to let through.
//
// Same two-rule shape as the English-collapse guard, for the same reason: a
// ratio threshold needs enough keys to mean anything (MIN_KEYS_REGRESSION), and
// below that only a total wipe (the exact rule) is a safe signal.

/** Fraction of previously-non-empty baseline values that may go empty in the
 *  current target before we call it a regression. Ratio rule. */
const REGRESSION_THRESHOLD = 0.5;

/** Ratio-rule floor: below this many comparable keys a ratio is too noisy. */
const MIN_KEYS_REGRESSION = 20;

/** Exact-rule floor: below this many comparable keys even "all of them went
 *  empty" is plausible noise (a deliberate revert of one bad translation). */
const MIN_KEYS_REGRESSION_EXACT = 3;

/**
 * Measure how far a target catalog has regressed from a prior baseline of the
 * SAME locale/catalog (not English).
 *
 * A key only counts as `comparable` when the baseline held a real (non-empty)
 * value for it AND the key still exists in the current target. A key the
 * target dropped entirely is not this check's concern -- that is either a
 * legitimate removal (the id no longer exists upstream, and dropping it is the
 * correct move) or is already caught by the callers' key-set-parity checks.
 * Only "kept the key, lost the value" is the shape this catches.
 *
 * @param {object} baseline  the same locale/catalog as it existed previously, { id: text }
 * @param {object} target    the same locale/catalog now, { id: text }
 * @returns {{regressed: boolean, rule: "ratio"|"exact"|null, comparable: number,
 *            emptied: number, ratio: number, skipped: boolean}}
 */
function measureRegression(baseline, target) {
  let comparable = 0;
  let emptied = 0;

  for (const key of Object.keys(baseline)) {
    const baseValue = baseline[key];
    if (typeof baseValue !== "string" || baseValue === "") continue;
    if (!(key in target)) continue;

    comparable++;
    const value = target[key];
    if (typeof value !== "string" || value === "") emptied++;
  }

  const ratio = comparable === 0 ? 0 : emptied / comparable;
  const ratioRule = comparable >= MIN_KEYS_REGRESSION && ratio > REGRESSION_THRESHOLD;
  const exactRule = comparable >= MIN_KEYS_REGRESSION_EXACT && emptied === comparable;

  return {
    regressed: ratioRule || exactRule,
    rule: ratioRule ? "ratio" : exactRule ? "exact" : null,
    comparable,
    emptied,
    ratio,
    skipped: comparable < MIN_KEYS_REGRESSION_EXACT,
  };
}

/**
 * Check one target catalog for regression against a prior baseline of itself.
 *
 * @param {object}  args
 * @param {object}  args.baseline      the same locale/catalog previously (e.g. at origin/main)
 * @param {object}  args.target        the same locale/catalog now
 * @param {string}  args.locale        e.g. "fr"
 * @param {string}  args.catalog       display name, e.g. "messages.json"
 * @param {string}  args.baselineLabel what to call the baseline in the message, e.g. "origin/main"
 * @returns {{problem: string|null, note: string|null}}
 */
function checkBaselineRegression({ baseline, target, locale, catalog, baselineLabel }) {
  const m = measureRegression(baseline, target);

  if (m.regressed) {
    const pct = (m.ratio * 100).toFixed(1);
    const basis =
      m.rule === "exact"
        ? `every one of its ${m.comparable} previously-translated values is now empty`
        : `${m.emptied}/${m.comparable} previously-translated values (${pct}%) are now empty`;
    return {
      problem:
        `[${locale}] ${catalog} lost translations compared to ${baselineLabel} — ${basis}. ` +
        `Key-set parity and the English-collapse guard both miss this shape: the keys are ` +
        `still there and the values don't equal English, they are just gone. This is what a ` +
        `Crowdin download produces when the project holds no '${locale}' translations for ` +
        `these ids and untranslated strings export as empty rather than source text. Do not ` +
        `commit this — it would revert real translations. Verify the Crowdin project actually ` +
        `holds '${locale}' translations for these ids before regenerating. To retire a locale ` +
        `on purpose, stop generating/committing a catalog for it (delete the Tier B directory; ` +
        `for Tier A also drop it from lingui.config's locales list) rather than emptying values ` +
        `in place — a catalog this guard no longer sees is not checked.`,
      note: null,
    };
  }

  if (m.skipped && m.comparable > 0) {
    return {
      problem: null,
      note:
        `[${locale}] ${catalog} has only ${m.comparable} previously-translated value(s) to ` +
        `compare against ${baselineLabel} — below the regression floor of ` +
        `${MIN_KEYS_REGRESSION_EXACT}, so it was NOT checked for lost translations. No action needed.`,
    };
  }

  return { problem: null, note: null };
}

// ---------------------------------------------------------------------------
// PER-KEY ENGLISH-REVERSION GUARD
// ---------------------------------------------------------------------------
// Both guards above are statistical: measureCollapse needs a large FRACTION
// of the catalog to equal English, measureRegression needs a large fraction
// to go empty. Neither can see a Crowdin sync that reverts a HANDFUL of
// individual keys while leaving the rest of a large catalog translated —
// this happened for real: a sync reverted 3 keys out of 1214 in a French
// catalog (a 0.2% ratio, nowhere near either guard's floor) and merged clean.
//
// Unlike the two guards above, this one is not a ratio at all — it is a
// per-key exact check, so catalog size never matters. A key counts as
// reverted only when ALL of these hold:
//   - it had a real translation before (non-empty, and not already
//     legitimately identical to English -- excluding that avoids flagging a
//     proper noun/"OK"/symbol that was ALREADY the same on both sides)
//   - the ENGLISH SOURCE TEXT for this key is unchanged between baseline and
//     now -- if English itself moved, a target that hasn't caught up yet is
//     the ALREADY-EXPECTED "translations may now be stale" event both lint
//     scripts already track separately (their non-blocking `warnings`
//     channel), not a Crowdin-style reversion. Skipping this avoids a false
//     positive that has nothing to do with what this guard exists to catch.
//   - it still exists now (a key the target dropped entirely is key-set
//     parity's concern, not this one's)
//   - it now equals the CURRENT English value (reverted, not just edited)
//
// TRADE-OFF, STATED PLAINLY: a translator who deliberately, on purpose,
// corrects a mistranslation to intentionally match English will trip this.
// That is a real but rare cost of catching the shape that matters — a
// threshold could not both tolerate that case AND catch a 3-of-1214 sync
// revert, because the two are statistically indistinguishable at that scale.
// This guard exists because the real incident it is modeled on had zero
// false positives when checked this way; if that changes, revisit the
// design, but don't pre-emptively add an escape hatch for a problem that
// has not actually occurred (a genuine correction is rare enough that a
// human looking at one failure and confirming it on purpose is proportionate).

/**
 * Find individual keys that reverted from a genuine prior translation back to
 * English. Compares the SAME locale/catalog against its own baseline (like
 * measureRegression) AND against English at both points in time (like
 * measureCollapse) — the combination neither existing guard makes alone.
 *
 * @param {object} baselineTarget  this locale's catalog previously
 * @param {object} currentTarget   this locale's catalog now
 * @param {object} baselineEn      the English catalog at the SAME baseline ref
 * @param {object} currentEn       the English catalog now
 * @returns {string[]} keys that were a real, distinct translation before and
 *   now equal the current English value
 *
 * KNOWN BLIND SPOT (accepted, same spirit as the trade-off above): the
 * English-moved exclusion is all-or-nothing per key. If a key's English text
 * changes for ANY reason in the same window a genuine reversion also hits
 * that exact key, this function skips it entirely -- the moved-English check
 * short-circuits before the target-vs-English comparison ever runs. This
 * narrows false positives at the cost of a rare false negative, which fits
 * this module's stated preference throughout; it is not further narrowed
 * (e.g. by also checking whether currentTarget[key] equals the OLD English)
 * because that would reintroduce a different false-positive shape for no
 * proven benefit -- revisit only if this coincidence is ever observed for real.
 */
function measureKeyReversions(baselineTarget, currentTarget, baselineEn, currentEn) {
  const reverted = [];
  for (const key of Object.keys(baselineTarget)) {
    const baseValue = baselineTarget[key];
    if (typeof baseValue !== "string" || baseValue === "") continue;
    if (baseValue === baselineEn[key]) continue; // already legitimately identical -- not a reversion
    if (baselineEn[key] !== currentEn[key]) continue; // English itself moved -- not this guard's shape
    if (!(key in currentTarget)) continue; // dropped entirely -- key-set parity's concern, not this one's
    if (currentTarget[key] === currentEn[key]) reverted.push(key);
  }
  return reverted;
}

/** Cap on how many reverted key names the message spells out. A handful of
 *  keys is exactly this guard's target shape; a huge list means the catalog
 *  also collapsed wholesale (checkEnglishCollapse's shape, reported
 *  separately by the caller) and repeating hundreds of ids here would just
 *  be noise the other two guards already show as a count/percentage. */
const KEY_REVERSION_LIST_CAP = 20;

/**
 * Check one target catalog for individual keys that reverted to English.
 *
 * Returns `{problem}` only, unlike checkEnglishCollapse/checkBaselineRegression
 * which also return a `note` for "too small to check" — that concept is
 * ratio-specific (a floor below which a fraction is meaningless). This is a
 * per-key exact check with no floor, so there is nothing to skip and nothing
 * to note; a caller should never read `.note` off this return value.
 *
 * @param {object}  args
 * @param {object}  args.baselineTarget  this locale's catalog previously
 * @param {object}  args.currentTarget   this locale's catalog now
 * @param {object}  args.baselineEn      English catalog at the same baseline ref
 * @param {object}  args.currentEn       English catalog now
 * @param {string}  args.locale          e.g. "fr"
 * @param {string}  args.catalog         display name, e.g. "messages.json"
 * @param {string}  args.baselineLabel   what to call the baseline in the message
 * @returns {{problem: string|null}}
 */
function checkKeyReversions({
  baselineTarget,
  currentTarget,
  baselineEn,
  currentEn,
  locale,
  catalog,
  baselineLabel,
}) {
  const reverted = measureKeyReversions(baselineTarget, currentTarget, baselineEn, currentEn);
  if (reverted.length === 0) return { problem: null };

  const shown = reverted.slice(0, KEY_REVERSION_LIST_CAP);
  const keyList =
    reverted.length > shown.length
      ? `${shown.join(", ")}, and ${reverted.length - shown.length} more`
      : shown.join(", ");

  return {
    problem:
      `[${locale}] ${catalog} has ${reverted.length} key(s) that reverted from a real ` +
      `translation back to English, compared to ${baselineLabel}: ${keyList}. ` +
      `This is invisible to both the English-collapse guard (needs a large fraction of the ` +
      `catalog, not a handful of keys) and the baseline-regression guard (only catches values ` +
      `going empty, not values matching English) — exactly the shape that slipped through both ` +
      `once already. If Crowdin genuinely has no '${locale}' translation for these ids, seed ` +
      `them there rather than committing the English fallback. If this is a deliberate ` +
      `correction to intentionally match English, that is a legitimate but rare case this ` +
      `guard cannot distinguish automatically — confirm it's intentional before proceeding.`,
  };
}

module.exports = {
  COLLAPSE_THRESHOLD,
  MIN_KEYS,
  MIN_KEYS_EXACT,
  measureCollapse,
  checkEnglishCollapse,
  REGRESSION_THRESHOLD,
  MIN_KEYS_REGRESSION,
  MIN_KEYS_REGRESSION_EXACT,
  measureRegression,
  checkBaselineRegression,
  measureKeyReversions,
  checkKeyReversions,
  KEY_REVERSION_LIST_CAP,
};

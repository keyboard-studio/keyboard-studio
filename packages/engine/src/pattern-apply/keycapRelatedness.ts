/**
 * keycapRelatedness — what a key should be LABELLED, and whether an existing
 * label still matches what the key types (spec 061 US5; FR-033, FR-034, FR-036).
 *
 * Two exports, deliberately paired in one module because they are two halves of
 * one judgement:
 *
 *   - {@link proposeKeycap} — the label to pre-fill for a given output.
 *   - {@link isKeycapRelated} — whether an author's existing label is still
 *     defensibly "the same thing" as the output, gating the
 *     `TOUCH_KEY_KEYCAP_MISMATCH` hint.
 *
 * ## NFKD lives here and nowhere else
 *
 * **This module is the only place compatibility decomposition (NFKD) is used**,
 * and that is a deliberate, bounded exception. The house rule everywhere else —
 * character *identity* is canonical (NFC/NFD) — is unchanged: NFKD folds
 * distinctions that matter for identity (`ﬁ` → `fi`, `²` → `2`), so an identity
 * comparison must never use it. What this module asks is a **display**
 * question: "would a reader looking at this keycap understand it to stand for
 * that output?" For that question compatibility equivalence is exactly right,
 * because it is what "looks like the same character" means (research D8).
 *
 * Nothing here feeds a rule, an id, or a coverage decision — only a hint's
 * severity. Keep it that way.
 */

/** The dotted-circle carrier a combining mark is shown on. */
const DOTTED_CIRCLE = "◌";

/** Which rule produced a proposed keycap. */
export type KeycapForm = "character" | "dotted-circle-carrier";

/** What choosing a non-default keycap form costs the author. */
export type KeycapConsequence = { readonly kind: "renders-without-carrier" };

/** A keycap proposal: a recommendation, not a mutation (mirrors `KeyIdMintingProposal`). */
export interface KeycapProposal {
  /** The default, pre-selected form. */
  readonly keycap: string;
  /** Which rule produced it. */
  readonly form: KeycapForm;
  /** Present only for a combining mark: the standalone form, offered explicitly. */
  readonly alternative?: {
    readonly keycap: string;
    readonly consequence: KeycapConsequence;
  };
}

/** Options for {@link isKeycapRelated}. */
export interface KeycapRelatednessOptions {
  /** BCP47 tag for locale-sensitive case folding (Turkish dotted/dotless i). */
  readonly bcp47?: string;
}

/**
 * Spacing forms of combining marks that carry NO compatibility decomposition,
 * so NFKD cannot relate them on its own.
 *
 * Verified against the runtime rather than assumed: NFKD DOES decompose U+00B4,
 * U+00A8, U+00AF and U+02DC to `space + combining`, so those need no entry —
 * test 3 already relates them. The entries below are the ones it leaves alone,
 * which is most of the ASCII set an author actually types.
 */
const SPACING_ACCENT_STAND_INS: ReadonlyMap<string, string> = new Map([
  ["`", "̀"], // ` grave
  ["^", "̂"], // ^ circumflex
  ["~", "̃"], // ~ tilde
  ["ˆ", "̂"], // modifier circumflex
  ["ˋ", "̀"], // modifier grave
  ["ˊ", "́"], // modifier acute
  ["ˇ", "̌"], // caron
  ["˘", "̆"], // breve
  ["˙", "̇"], // dot above
  ["˚", "̊"], // ring above
  ["˛", "̨"], // ogonek
  ["˝", "̋"], // double acute
]);

/** True when `s` is a single combining mark. */
export function isCombiningMark(s: string): boolean {
  const chars = [...s];
  return chars.length === 1 && /\p{M}/u.test(chars[0] as string);
}

/**
 * Propose the keycap for an output (FR-033, FR-034).
 *
 * A combining mark is shown on a dotted-circle carrier by default, because a
 * bare mark has nothing to attach to and renders as a stray diacritic over
 * whatever precedes it in the UI. The standalone form is still offered — some
 * scripts genuinely want it — but as an explicit `alternative` carrying its
 * consequence, never as the silent default.
 */
export function proposeKeycap(output: string): KeycapProposal {
  if (isCombiningMark(output)) {
    return {
      keycap: `${DOTTED_CIRCLE}${output}`,
      form: "dotted-circle-carrier",
      alternative: {
        keycap: output,
        consequence: { kind: "renders-without-carrier" },
      },
    };
  }
  return { keycap: output, form: "character" };
}

/**
 * The decimal value of a single `Nd` character, or `undefined`.
 *
 * Needed because NFKD does **not** relate `1` to `١` (U+0661 ARABIC-INDIC DIGIT
 * ONE has no compatibility decomposition — verified, not assumed; NFKD only
 * covers the *fullwidth* and superscript families). Without this, SC-008's
 * "a localized number row must raise no mismatch" would fail for exactly the
 * scripts it was written for.
 *
 * Unicode lays decimal digits out as aligned runs of ten, so walking back to
 * the run's start gives the value. The walk is capped at nine steps, so a
 * malformed run can never produce a value above 9.
 */
function decimalDigitValue(ch: string): number | undefined {
  if (!/^\p{Nd}$/u.test(ch)) return undefined;
  const cp = ch.codePointAt(0);
  if (cp === undefined) return undefined;
  let start = cp;
  while (start > 0 && cp - start < 9) {
    const prev = String.fromCodePoint(start - 1);
    if (!/^\p{Nd}$/u.test(prev)) break;
    start -= 1;
  }
  return cp - start;
}

/**
 * NFKD, with a leading space removed.
 *
 * The space is not cosmetic. NFKD decomposes a spacing accent to
 * `space + combining` — U+00B4 becomes `U+0020 U+0301` — so comparing raw NFKD
 * forms would rate `´` UNRELATED to U+0301, which is precisely the pair test 5
 * exists to relate. Stripping the carrier space is what makes the compatibility
 * arm agree with the stand-in arm instead of contradicting it.
 */
function nfkdKey(s: string): string {
  return s.normalize("NFKD").replace(/^ +/u, "");
}

/** Strip dotted-circle carriers, so a carrier-wrapped keycap compares as its mark. */
function stripCarrier(s: string): string {
  const stripped = s.split(DOTTED_CIRCLE).join("");
  return stripped.length > 0 ? stripped : s;
}

/** Map a spacing accent stand-in to its combining form, or return the input. */
function toCombiningStandIn(s: string): string {
  return SPACING_ACCENT_STAND_INS.get(s) ?? s;
}

/**
 * Is `keycap` still a defensible label for `output`? (FR-036)
 *
 * Five tests, any one of which is enough. They are ordered cheapest-first, but
 * the order carries no meaning beyond that — relatedness is a disjunction.
 *
 *   1. **Identity after NFC** — the ordinary case, and the reason a decomposed
 *      keycap never disagrees with its composed output.
 *   2. **Case variants under BCP47** — a keycap of `E` over an output of `e` is
 *      not a mismatch. Locale-sensitive, so Turkish `I`/`ı` folds correctly.
 *   3. **Normalization variants** — NFKD equality (fullwidth, superscript,
 *      ligature forms) plus decimal-digit value, which is what actually relates
 *      a Western digit keycap to an Arabic-Indic output.
 *   4. **Dotted-circle carrier stripping** — `◌́` labels an output of U+0301.
 *   5. **Spacing-accent stand-ins** — a `` ` `` keycap over a U+0300 output.
 *
 * Returns `true` when related. The caller emits its hint only on `false`, so
 * every uncertainty here must resolve toward `true`: a false "related" costs a
 * hint nobody needed, a false "mismatch" nags an author who was right.
 */
export function isKeycapRelated(
  keycap: string,
  output: string,
  opts?: KeycapRelatednessOptions,
): boolean {
  if (keycap === output) return true;

  const locale = opts?.bcp47;

  // 1 — identity after NFC.
  const kNfc = keycap.normalize("NFC");
  const oNfc = output.normalize("NFC");
  if (kNfc === oNfc) return true;

  // 2 — case variants, locale-sensitive.
  const kLower = locale === undefined ? kNfc.toLowerCase() : kNfc.toLocaleLowerCase(locale);
  const oLower = locale === undefined ? oNfc.toLowerCase() : oNfc.toLocaleLowerCase(locale);
  if (kLower === oLower) return true;

  // 3 — normalization variants (the one NFKD site), then digit value.
  if (nfkdKey(keycap) === nfkdKey(output)) return true;
  const kDigit = decimalDigitValue(kNfc);
  const oDigit = decimalDigitValue(oNfc);
  if (kDigit !== undefined && oDigit !== undefined && kDigit === oDigit) return true;

  // 4 — carrier stripping. Re-runs the cheap tests on the stripped form rather
  //     than recursing, so the fixed five stay five.
  const kStripped = stripCarrier(keycap);
  if (kStripped !== keycap) {
    const sNfc = kStripped.normalize("NFC");
    if (sNfc === oNfc) return true;
    if (nfkdKey(kStripped) === nfkdKey(output)) return true;
    if (toCombiningStandIn(sNfc) === oNfc) return true;
  }

  // 5 — spacing-accent stand-ins, in either direction.
  if (toCombiningStandIn(kNfc) === oNfc) return true;
  if (kNfc === toCombiningStandIn(oNfc)) return true;

  return false;
}

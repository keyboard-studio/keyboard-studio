/**
 * touch-key-ids — leaf utilities for touch key identity: the `sp` key-class
 * predicates, U_ id decoding, and the dotted-circle keycap strip.
 *
 * Extracted from touch-coverage.ts (spec 104 integration fix): the
 * production resolver (touchProduction.ts) needs decodeUnicodeKeyId and
 * isSpacerKeyClass, and coverage needs the resolver — keeping these
 * utilities in touch-coverage.ts made that a dependency cycle
 * (dependency-cruiser no-circular). This module imports nothing from
 * contracts' touch modules, so both may depend on it. touch-coverage.ts
 * re-exports every symbol here; existing import paths are unchanged.
 */

/**
 * Key classes from .keyman-touch-layout `sp` that are non-interactive: sp:9
 * (blank) and sp:10 (spacer).
 *
 * CORRECTED from `{8, 10}` (spec 063 FR-012). The upstream `TouchLayoutKeySp`
 * enum's tail is `deadkey = 8, blank = 9, spacer = 10` — 8 is a deadkey-STYLED
 * key, which is interactive and can produce output. The old set therefore
 * mishandled both ends of the blank/spacer idiom at once: it treated genuinely
 * interactive deadkey-styled keys as inert, while crediting blank keys as
 * producing their keycap text (Cameroon's `T_BLANK` sites carry `" "`, so a
 * space was spuriously credited as covered).
 */
const NON_INTERACTIVE_SP_VALUES = new Set([9, 10]);

/** The deadkey-STYLED key class from .keyman-touch-layout `sp` (upstream `deadkey = 8`). */
const DEADKEY_SP_VALUE = 8;

/**
 * True when a touch key's `sp` (key class) marks it as non-interactive — sp:9
 * (blank) or sp:10 (spacer). Such keys occupy horizontal space but are neither
 * char producers nor interactive, so both touch-coverage and the keys-per-row
 * crowding check must exclude them. Canonical predicate — do not re-derive the
 * literal set elsewhere.
 *
 * The name is kept (rather than renamed to `isNonInteractiveKeyClass`) because
 * it is the established predicate across three packages and the rename would
 * churn every call site for no behavioural gain; the SET is what was wrong.
 */
export function isSpacerKeyClass(sp: number | undefined): boolean {
  return sp !== undefined && NON_INTERACTIVE_SP_VALUES.has(sp);
}

/**
 * True when a touch key's `sp` marks it as deadkey-STYLED (sp:8).
 *
 * This is a *presentation* class, not a behavioural one: it tells the renderer
 * to style the key like a deadkey. The key remains interactive and may produce
 * output, so it must NOT be excluded from coverage or from the keys-per-row
 * count. The predicate exists so callers that need to reason about the class
 * (e.g. the dead-`T_`-key check, which runs only on `sp ∈ {absent, 0, 8}`) can
 * name it instead of writing the literal `8`.
 */
export function isDeadkeyStyledKeyClass(sp: number | undefined): boolean {
  return sp === DEADKEY_SP_VALUE;
}

/**
 * The two `sp` classes that mark a FRAME key: `1` (upstream `special`, drawn
 * inactive) and `2` (upstream `specialActive`, drawn engaged on the layer it
 * switches to).
 */
const FRAME_SP_VALUES = new Set([1, 2]);

/**
 * True when a touch key's `sp` marks it as a FRAME key — sp:1 (inactive) or
 * sp:2 (active). Canonical predicate for that pair; do not re-derive the
 * literal set elsewhere (same convention {@link isSpacerKeyClass} states).
 *
 * The frame classes are the keyboard's *chrome*: layer switches, `K_BKSP`,
 * `K_ENTER`, the globe key. Two consequences depend on naming them, and both
 * are about a family of modifier layers rather than about one key:
 *
 * - Alternation *between* 1 and 2 across a family is correct design, not drift
 *   (`layerFamilies.ts`'s FR-068 property split), so a frame key must be
 *   correlated across siblings by something other than the properties that
 *   legitimately vary.
 * - Crossing INTO or OUT OF the pair is a different kind of edit from moving
 *   around inside the ordinary classes: it changes which correlation namespace
 *   the key belongs to at all, which is why it is the one `sp` change that
 *   still counts as a family-parallelism concern
 *   (`keyEditAffectsFamilyParallelism`).
 *
 * Note this is a claim about `sp` ALONE. A key carrying a `nextlayer` is also a
 * layer switch whatever its `sp` says; callers needing that wider question ask
 * it themselves (see `layerFamilies.ts`'s `isFrameOrLayerSwitchKey`).
 */
export function isFrameKeyClass(sp: number | undefined): boolean {
  return sp !== undefined && FRAME_SP_VALUES.has(sp);
}

/** A single `U_<HEX>` hex group: 4-6 hex digits. */
const HEX_GROUP_RE = /^[0-9A-Fa-f]{4,6}$/;

/**
 * Decode a `U_<HEX>[_<HEX>]*` touch key id into the character(s) it encodes
 * (inverse of `charToUnicodeKeyId` in `engine/src/shared/touch-ids.ts` for the
 * single-codepoint case; the encoder stays single-codepoint-only). Accepts
 * one or more underscore-separated hex groups (Keyman 15+ multi-codepoint
 * ids, e.g. base+combining sequences) — each group must be 4-6 hex digits and
 * a valid Unicode scalar value. Returns `undefined` for any id that is not a
 * conforming `U_` id (including a malformed group anywhere in the sequence).
 */
export function decodeUnicodeKeyId(id: string): string | undefined {
  if (!id.startsWith("U_")) return undefined;
  const groups = id.slice(2).split("_");
  if (groups.length === 0 || groups.some((g) => g.length === 0)) return undefined;

  let decoded = "";
  for (const hex of groups) {
    if (!HEX_GROUP_RE.test(hex)) return undefined;
    const codePoint = parseInt(hex, 16);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      return undefined;
    }
    // Surrogate code points (0xD800-0xDFFF) are not valid Unicode scalar
    // values; String.fromCodePoint would otherwise emit an ill-formed
    // UTF-16 unit.
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return undefined;
    decoded += String.fromCodePoint(codePoint);
  }
  return decoded;
}

/**
 * U+25CC DOTTED CIRCLE — the conventional combining-mark placeholder on a keycap.
 *
 * Exported because engine's `keycapRelatedness.ts` needs the same literal for a
 * different question (does a keycap still stand for what the key types?). The
 * two pieces of logic stay separate — they encode different invariants — but the
 * character does not get a second spelling.
 */
export const DOTTED_CIRCLE = "◌";

/** Every char is a combining mark: Mn (nonspacing), Mc (spacing), or Me (enclosing). */
const ALL_COMBINING_RE = /^[\p{Mn}\p{Mc}\p{Me}]+$/u;

/**
 * The U+25CC-stripped form of a keycap label, or `undefined` when the strip does
 * not apply (spec 063 FR-006).
 *
 * Strips only when, after removing EVERY U+25CC, the remainder is **non-empty**
 * and consists **solely** of combining marks. Each condition is load-bearing:
 *
 *   - `"◌̀"` → `"̀"`, so a mark key labelled with the conventional placeholder
 *     credits U+0300 even before the rule index is threaded — a useful
 *     independent safety net.
 *   - A bare `"◌"` is **NOT** stripped to empty. This matters concretely:
 *     `sil_cameroon_qwerty`'s `store(letter)` ends in a literal `◌`, making
 *     U+25CC a real inventory character on that keyboard. Stripping it to nothing
 *     would make a genuinely covered character read as uncovered.
 *   - `"a◌b"` is untouched, because the remainder is not all-combining. A keycap
 *     mixing letters and a placeholder is not a mark keycap.
 *
 * The caller credits this IN ADDITION to the original text, never instead of it.
 * That is what bounds the false-positive risk to nil: the only way crediting
 * U+0300 for a `◌̀` key could be wrong is if the key emits U+25CC+U+0300 as a
 * literal unit — in which case its `output` or id already credits that literal
 * and nothing is lost.
 */
export function stripDottedCircle(text: string): string | undefined {
  if (!text.includes(DOTTED_CIRCLE)) return undefined;
  const remainder = text.split(DOTTED_CIRCLE).join("");
  if (remainder.length === 0) return undefined;
  if (!ALL_COMBINING_RE.test(remainder)) return undefined;
  return remainder;
}

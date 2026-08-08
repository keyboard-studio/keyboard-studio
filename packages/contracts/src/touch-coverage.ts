/**
 * touch-coverage — canonical touch-surface coverage traversal (FR-008/SC-003,
 * spec 035), extracted here so the engine (`touchCoverage`, consumed by the
 * touch gallery) and the `@keymanapp/keyboard-lint` `KM_LINT_TOUCH_UNCOVERED`
 * check share ONE implementation. Both packages depend on
 * @keyboard-studio/contracts; keyboard-lint cannot import engine
 * (dependency-cruiser's `lint-not-to-engine` rule, spec §10) — the same
 * precedent as {@link buildProducedSet} for the §18.6 desktop check.
 *
 * Walks a TouchLayoutIR the same way TouchGallery's `detectedChars` memo does
 * (text/output/sk/multitap/flick, skipping "*"-labels), but additionally
 * restricts the walk to *reachable* layers (the "default" layer plus any
 * layer reachable via a chain of `nextlayer` references from it) and decodes
 * `U_<HEX>[_<HEX>]*` key ids into the character(s) they encode.
 *
 * Multi-codepoint U_ ids (Keyman 15+): a touch key id may carry more than one
 * underscore-separated hex group (e.g. `U_0061_0303`, base + combining mark).
 * Each group is validated and decoded independently, then concatenated — the
 * caller's own NFC-normalization (both consumers already normalize on
 * insertion/comparison) folds the result to its precomposed form.
 *
 * @see specs/035-mobile-touch-derivation/contracts/simplification.md
 */

import type { TouchLayoutIR, TouchKeyIR } from "./keyboard-ir.js";
import { toUPlusNotation } from "./utils/charUtils.js";
import { producedByKeyId } from "./touch-key-rule-join.js";
import type { TouchKeyRuleIndex } from "./touch-key-rule-join.js";

export interface TouchCoverageResult {
  /** Inventory chars with zero reachable touch mechanism. Empty means SC-003 is satisfied. */
  uncovered: readonly string[];
}

/**
 * Options for {@link computeTouchCoverage} (spec 058 FR-005/FR-006).
 *
 * Passed as an optional THIRD POSITIONAL argument rather than replacing the
 * signature: this function is public from contracts with four call sites plus its
 * own suite, and an additive optional argument keeps every existing test green as
 * a regression lock while making each call site's migration visible in review.
 * Absent the argument, behaviour is byte-identical to before this feature.
 */
export interface TouchCoverageOptions {
  /**
   * From `buildTouchKeyRuleIndex(ir)`.
   *
   * With it, a key is additionally credited with what its PRODUCING rules emit —
   * which is the whole fix: a `T_0300` key labelled `◌̀`, whose output lives
   * entirely in a `.kmn` rule, previously read as covering nothing.
   *
   * Absent ⇒ today's semantics, byte-identical.
   */
  readonly ruleIndex?: TouchKeyRuleIndex;
  /**
   * Additively credit a U+25CC-stripped form of a keycap's `text`. Default true.
   *
   * See {@link stripDottedCircle} for why this is narrow and purely additive.
   */
  readonly stripDottedCircle?: boolean;
}

/**
 * Key classes from .keyman-touch-layout `sp` that are non-interactive: sp:9
 * (blank) and sp:10 (spacer).
 *
 * CORRECTED from `{8, 10}` (spec 058 FR-012). The upstream `TouchLayoutKeySp`
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

/** U+25CC DOTTED CIRCLE — the conventional combining-mark placeholder on a keycap. */
const DOTTED_CIRCLE = "◌";

/** Every char is a combining mark: Mn (nonspacing), Mc (spacing), or Me (enclosing). */
const ALL_COMBINING_RE = /^[\p{Mn}\p{Mc}\p{Me}]+$/u;

/**
 * The U+25CC-stripped form of a keycap label, or `undefined` when the strip does
 * not apply (spec 058 FR-006).
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

/** Recursively collect `nextlayer` references from a key and its sk/multitap/flick sub-keys. */
function collectKeyNextLayers(key: TouchKeyIR, out: Set<string>): void {
  if (key.nextlayer) out.add(key.nextlayer);
  for (const sub of key.sk ?? []) collectKeyNextLayers(sub, out);
  for (const sub of key.multitap ?? []) collectKeyNextLayers(sub, out);
  if (key.flick) {
    for (const sub of Object.values(key.flick)) {
      if (sub) collectKeyNextLayers(sub, out);
    }
  }
}

/**
 * Recursively add every char produced by a key and its sk/multitap/flick
 * sub-keys. It builds the full covered set once per layout, then tests every
 * inventory char against it (see `computeTouchCoverage` below); inverting
 * that into "for each inventory char, ask every key" would trade one O(keys)
 * pass for an O(inventory * keys) one for no behavioral gain. Per-key match
 * semantics: a non-empty, non-`*`-prefixed `text`/`output`, or a decoded
 * `U_<HEX>[_<HEX>]*` id, all NFC-normalized.
 */
function collectKeyChars(
  key: TouchKeyIR,
  covered: Set<string>,
  options: TouchCoverageOptions,
): void {
  // Blank (sp:9) and spacer (sp:10) keys are never char producers. Note that
  // sp:8 is deadkey-STYLED, not a spacer, and IS credited — see
  // isSpacerKeyClass's doc for the corrected enum.
  if (isSpacerKeyClass(key.sp)) return;

  const push = (text?: string) => {
    if (text !== undefined && text.length > 0 && !text.startsWith("*")) {
      covered.add(text.normalize("NFC"));
    }
  };
  push(key.text);
  push(key.output);
  const decoded = decodeUnicodeKeyId(key.id);
  if (decoded !== undefined) covered.add(decoded.normalize("NFC"));

  // ADDITIVE (FR-006): the dotted-circle-stripped form of the keycap, credited
  // alongside the unstripped text above, never in place of it. Skipped for a
  // `*`-prefixed frame label, same as `push`.
  if (
    options.stripDottedCircle !== false &&
    key.text !== undefined &&
    !key.text.startsWith("*")
  ) {
    const stripped = stripDottedCircle(key.text);
    if (stripped !== undefined) covered.add(stripped.normalize("NFC"));
  }

  // ADDITIVE (FR-005): what this key's PRODUCING rules emit. Guard, suppresses,
  // transitions, and opaque bindings contribute nothing by construction, so a
  // guard rule's re-emitted context can never be miscredited as production.
  if (options.ruleIndex !== undefined && key.id.length > 0) {
    for (const ch of producedByKeyId(options.ruleIndex, key.id)) {
      covered.add(ch.normalize("NFC"));
    }
  }

  // The index is passed DOWN into every sub-key collection, so an `sk` /
  // `multitap` / `flick` entry joins identically to a main key. A `U_` longpress
  // usually self-outputs, but a `T_`-id sub-key does not, and omitting the index
  // here would under-credit exactly those.
  for (const sub of key.sk ?? []) collectKeyChars(sub, covered, options);
  for (const sub of key.multitap ?? []) collectKeyChars(sub, covered, options);
  if (key.flick) {
    for (const sub of Object.values(key.flick)) {
      if (sub) collectKeyChars(sub, covered, options);
    }
  }
}

/**
 * Format the FR-008/18.6 "uncovered character" message — the ratified spec
 * 035 T008 format `U+XXXX <char> has no touch mechanism` (no trailing
 * punctuation; callers append their own sentence-level punctuation). Shared
 * between the `KM_LINT_TOUCH_UNCOVERED` lint check
 * (check-18-6-touch-coverage.ts) and the studio TouchGallery FR-008
 * completion-gate message so the two phrasings of "no reachable touch
 * mechanism" cannot drift.
 */
export function formatUncoveredTouchMessage(char: string): string {
  return `${toUPlusNotation(char)} ${char} has no touch mechanism`;
}

/**
 * Compute inventory characters with no reachable touch-layout producer.
 *
 * Pure: no mutation of `layout`/`inventory`, no I/O.
 *
 * @param options - Optional and ADDITIVE (spec 058 FR-005). Omitted, the result is
 *   byte-identical to the pre-058 two-argument behaviour — that equivalence is
 *   pinned by a regression test, and it is what allowed the four call sites to be
 *   migrated one visible line at a time. All four DID migrate in the same change:
 *   leaving any one on the unjoined path defeats the fix.
 */
export function computeTouchCoverage(
  layout: TouchLayoutIR,
  inventory: readonly string[],
  options: TouchCoverageOptions = {},
): TouchCoverageResult {
  const covered = new Set<string>();

  for (const platform of layout.platforms) {
    const layerById = new Map(platform.layers.map((layer) => [layer.id, layer] as const));

    // Reachable layers = "default" plus anything reachable via a nextlayer
    // chain starting from it. Guard against cycles with the reachable set
    // itself doubling as the visited set.
    const reachableIds = new Set<string>();
    const queue: string[] = [];
    if (layerById.has("default")) {
      reachableIds.add("default");
      queue.push("default");
    }
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === undefined) continue;
      const layer = layerById.get(currentId);
      if (!layer) continue;
      const nextIds = new Set<string>();
      for (const row of layer.rows) {
        for (const key of row.keys) {
          collectKeyNextLayers(key, nextIds);
        }
      }
      for (const nextId of nextIds) {
        if (!reachableIds.has(nextId) && layerById.has(nextId)) {
          reachableIds.add(nextId);
          queue.push(nextId);
        }
      }
    }

    for (const layerId of reachableIds) {
      const layer = layerById.get(layerId);
      if (!layer) continue;
      for (const row of layer.rows) {
        for (const key of row.keys) {
          collectKeyChars(key, covered, options);
        }
      }
    }
  }

  const uncovered: string[] = [];
  for (const char of inventory) {
    if (!covered.has(char.normalize("NFC"))) {
      uncovered.push(char);
    }
  }

  return { uncovered };
}

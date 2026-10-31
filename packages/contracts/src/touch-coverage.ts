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
 * Spec 104 (T025): when a rule index is supplied, id-derived and rule-derived
 * crediting no longer happens here at all — production comes from the one
 * resolver (`touchProduction.ts`, FR-003), per key occurrence and layer
 * state. The text/output credits above are keycap heuristics, not
 * production, and are unchanged in both paths.
 *
 * Multi-codepoint U_ ids (Keyman 15+): a touch key id may carry more than one
 * underscore-separated hex group (e.g. `U_0061_0303`, base + combining mark).
 * Each group is validated and decoded independently, then concatenated — the
 * caller's own NFC-normalization (both consumers already normalize on
 * insertion/comparison) folds the result to its precomposed form.
 *
 * @see specs/035-mobile-touch-derivation/contracts/simplification.md
 */

import type { KeyboardIR, TouchLayoutIR, TouchKeyIR } from "./keyboard-ir.js";
import { toUPlusNotation } from "./utils/charUtils.js";
import type { TouchKeyRuleIndex } from "./touch-key-rule-join.js";
import { resolveTouchProduction, touchKeyStateFromLayerId } from "./touchProduction.js";

export interface TouchCoverageResult {
  /** Inventory chars with zero reachable touch mechanism. Empty means SC-003 is satisfied. */
  uncovered: readonly string[];
}

/**
 * Options for {@link computeTouchCoverage} (spec 063 FR-005/FR-006).
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
   * With it AND {@link TouchCoverageOptions.ir}, a key's PRODUCTION is taken
   * from spec 104's production resolver (`resolveTouchProduction`, FR-003)
   * instead of this module's own id-decoding + rule-join crediting — which
   * is the whole fix, twice over: a `T_0300` key labelled `◌̀`, whose output
   * lives entirely in a `.kmn` rule, previously read as covering nothing;
   * and coverage must not keep a second production model standing beside
   * the resolver (T025). The keycap-text credits below (text / output /
   * dotted-circle strip) are NOT production and stay coverage's own
   * additive heuristics.
   *
   * Absent ⇒ the pre-104 semantics, byte-identical: no resolver is called
   * and the legacy text/output/U_-decode crediting runs exactly as before.
   * A `ruleIndex` passed WITHOUT `ir` also takes the legacy path: the
   * resolver requires the IR (it reads rule outputs and deadkey names
   * through it), so an index-only caller gets defined legacy behaviour
   * rather than a crash. Call sites that build the index from an IR
   * should pass both.
   */
  readonly ruleIndex?: TouchKeyRuleIndex;
  /**
   * The IR the rule index was built from (`buildTouchKeyRuleIndex(ir)`).
   * Required alongside {@link TouchCoverageOptions.ruleIndex} for the
   * resolver path; see that field's doc for the index-only fallback.
   */
  readonly ir?: KeyboardIR;
  /**
   * Additively credit a U+25CC-stripped form of a keycap's `text`. Default true.
   *
   * See {@link stripDottedCircle} for why this is narrow and purely additive.
   */
  readonly stripDottedCircle?: boolean;
}

import { decodeUnicodeKeyId, isSpacerKeyClass, stripDottedCircle } from "./touch-key-ids.js";

export {
  DOTTED_CIRCLE,
  decodeUnicodeKeyId,
  isDeadkeyStyledKeyClass,
  isFrameKeyClass,
  isSpacerKeyClass,
  stripDottedCircle,
} from "./touch-key-ids.js";

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

/** Where a key sits — the occurrence context the production resolver is keyed on (FR-001). Sub-keys inherit their parent's platform/layer. */
interface KeyOccurrenceContext {
  readonly platformId: string;
  readonly layerId: string;
}

/**
 * Recursively add every char produced by a key and its sk/multitap/flick
 * sub-keys. It builds the full covered set once per layout, then tests every
 * inventory char against it (see `computeTouchCoverage` below); inverting
 * that into "for each inventory char, ask every key" would trade one O(keys)
 * pass for an O(inventory * keys) one for no behavioral gain. Per-key match
 * semantics: a non-empty, non-`*`-prefixed `text`/`output`, or the key's
 * production (below), all NFC-normalized.
 */
function collectKeyChars(
  key: TouchKeyIR,
  covered: Set<string>,
  options: TouchCoverageOptions,
  occurrence: KeyOccurrenceContext,
): void {
  // Blank (sp:9) and spacer (sp:10) classes: their KEYCAP is never a credit
  // — a blank key's text is layout dressing, not production (Cameroon's
  // T_BLANK sites carry " ", which spec 063 FR-012 stopped crediting as a
  // produced space), so the text/output pushes and the dotted-circle strip
  // below are suppressed for this class in both paths. Note that sp:8 is
  // deadkey-STYLED, not a spacer, and IS credited — see isSpacerKeyClass's
  // doc for the corrected enum.
  //
  // PRODUCTION is a separate question, and on the resolver path it is the
  // resolver's alone (spec 104 FR-003): contracts §1 defines rule /
  // u-decode / k-fallback production by id family, bindings, and state —
  // with no sp-class condition — and the resolver's own arm order already
  // yields `none` for a spacer-class key with no rule and no applicable
  // fallback, so taking its verdict cannot resurrect a blank key.
  // Preempting it here instead kept a second production model standing
  // beside the resolver, and the corpus caught it (T021 arm 2): ruled
  // sp:9 K_ keys emitting bidi controls, sp:9/10 K_ keys on the fallback,
  // and sp:10 U_ keys on the decode were all resolver-produced yet
  // uncredited. The LEGACY path has no resolver to defer to, so there the
  // class still ends the walk outright, byte-identical to before.
  const spacerClass = isSpacerKeyClass(key.sp);
  const resolverPath = options.ruleIndex !== undefined && options.ir !== undefined;
  if (spacerClass && !resolverPath) return;

  const push = (text?: string) => {
    if (text !== undefined && text.length > 0 && !text.startsWith("*")) {
      covered.add(text.normalize("NFC"));
    }
  };
  if (!spacerClass) {
    push(key.text);
    push(key.output);
  }

  if (!resolverPath) {
    // LEGACY (no rule index, or an index without its IR): the pre-104
    // crediting, byte-identical. A decoded `U_<HEX>[_<HEX>]*` id is the
    // only id-derived credit, and no rule production is visible at all.
    const decoded = decodeUnicodeKeyId(key.id);
    if (decoded !== undefined) covered.add(decoded.normalize("NFC"));
  } else if (key.id.length > 0) {
    // PRODUCTION (spec 104, FR-003/T025): the resolver is the one production
    // model. Every production in the record is credited — the set is never
    // collapsed (contracts §1) — so a context-guarded mark credits its mark
    // (some context produces it). Crediting SHAPE follows the entry,
    // preserving the two pre-104 precedents:
    //   - rule entries: per codepoint — the join's `produced` set was
    //     per-char, so a rule emitting "FCFA" covers F, C, F, A but not
    //     the string.
    //   - a marked decode entry (`viaFallback`, a ruled `U_` key's
    //     no-rule-matches fall-through): the whole output as a unit, like
    //     the `u-decode` source below — one mechanism, whose NFC form is
    //     the covered char. Pre-104 parity: the joined path credited both
    //     a ruled `U_` key's rule output AND its decode.
    //   - `u-decode` / `k-fallback` sources: the whole output as a unit —
    //     the U_-decode precedent (a multi-codepoint id is one mechanism,
    //     whose NFC form is the covered char). `k-fallback` crediting is
    //     NEW in 104: an unruled `K_` key on a state-0/SHIFT layer produces
    //     its US base char whether or not its keycap says so. (Named as a
    //     verdict change in the T025 tests.)
    // Guard / suppresses / transitions-only records carry no text
    // production, so a guard rule's re-emitted context can never be
    // miscredited — the FR-005 property, now the resolver's by construction.
    // Deadkey and layer-switch productions are not characters and credit
    // nothing; `unknown` credits nothing either. (Caps-state K_ keys are
    // NOT unknown since the T022 probe settled contracts §5: they return
    // their base-char text production and credit it like any k-fallback
    // key — the tap evidence is that they do produce it.)
    const record = resolveTouchProduction(
      { ir: options.ir, ruleIndex: options.ruleIndex },
      key,
      touchKeyStateFromLayerId(occurrence.layerId),
    );
    for (const production of record.productions) {
      if (production.output.kind !== "text") continue;
      if (production.viaFallback === true) {
        // A ruled `U_` key's decode fall-through: one mechanism, credited
        // as a whole unit — never split per codepoint like a rule entry.
        covered.add(production.output.text.normalize("NFC"));
      } else if (record.source === "rule") {
        for (const ch of production.output.text) {
          covered.add(ch.normalize("NFC"));
        }
      } else {
        covered.add(production.output.text.normalize("NFC"));
      }
    }
  }

  // ADDITIVE (FR-006): the dotted-circle-stripped form of the keycap, credited
  // alongside the unstripped text above, never in place of it. Skipped for a
  // `*`-prefixed frame label, same as `push`, and for the spacer/blank class,
  // whose keycap is never a credit (see the head of this function).
  if (
    !spacerClass &&
    options.stripDottedCircle !== false &&
    key.text !== undefined &&
    !key.text.startsWith("*")
  ) {
    const stripped = stripDottedCircle(key.text);
    if (stripped !== undefined) covered.add(stripped.normalize("NFC"));
  }

  // The occurrence context is passed DOWN into every sub-key collection, so
  // an `sk` / `multitap` / `flick` entry resolves identically to a main key.
  // A `U_` longpress usually self-outputs, but a `T_`-id sub-key does not,
  // and omitting the resolver here would under-credit exactly those.
  for (const sub of key.sk ?? []) collectKeyChars(sub, covered, options, occurrence);
  for (const sub of key.multitap ?? []) collectKeyChars(sub, covered, options, occurrence);
  if (key.flick) {
    for (const sub of Object.values(key.flick)) {
      if (sub) collectKeyChars(sub, covered, options, occurrence);
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
 * @param options - Optional and ADDITIVE (spec 063 FR-005). Omitted, the result is
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
          collectKeyChars(key, covered, options, {
            platformId: platform.id,
            layerId,
          });
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

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

export interface TouchCoverageResult {
  /** Inventory chars with zero reachable touch mechanism. Empty means SC-003 is satisfied. */
  uncovered: readonly string[];
}

/** Key classes from .keyman-touch-layout `sp` that are spacers, never char producers. */
const SPACER_SP_VALUES = new Set([8, 10]);

/**
 * True when a touch key's `sp` (key class) marks it as a spacer — sp:8 (spacer)
 * or sp:10 (padding). Spacer keys occupy horizontal space but are neither char
 * producers nor interactive keys, so both touch-coverage and the keys-per-row
 * crowding check must exclude them. Canonical predicate — do not re-derive the
 * literal set elsewhere.
 */
export function isSpacerKeyClass(sp: number | undefined): boolean {
  return sp !== undefined && SPACER_SP_VALUES.has(sp);
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

/** Recursively add every char produced by a key and its sk/multitap/flick sub-keys. */
function collectKeyChars(key: TouchKeyIR, covered: Set<string>): void {
  // Spacer keys (sp:8/sp:10) are never char producers.
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

  for (const sub of key.sk ?? []) collectKeyChars(sub, covered);
  for (const sub of key.multitap ?? []) collectKeyChars(sub, covered);
  if (key.flick) {
    for (const sub of Object.values(key.flick)) {
      if (sub) collectKeyChars(sub, covered);
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
 */
export function computeTouchCoverage(
  layout: TouchLayoutIR,
  inventory: readonly string[],
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
          collectKeyChars(key, covered);
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

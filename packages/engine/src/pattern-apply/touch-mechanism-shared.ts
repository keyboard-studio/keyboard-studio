/**
 * touch-mechanism-shared — predicates shared by the IR and raw-JSON touch
 * appliers so their deduplication logic cannot drift.
 *
 * @see applyTouchAssignments.ts       — IR-based applier (Case A)
 * @see applyTouchAssignmentsToRawJson.ts — raw-JSON applier (Case B)
 * @see applyDesktopModifications.ts       — IR-based desktop-modification replay
 * @see applyDesktopModificationsToRawJson.ts — raw-JSON desktop-modification replay
 */

import type {
  ResolveTouchProductionInputs,
  TouchKeyIR,
  TouchKeyProduction,
} from "@keyboard-studio/contracts";
import {
  resolveTouchProduction,
  touchKeyStateFromLayerId,
} from "@keyboard-studio/contracts";
import { unicodeKeyIdToChar } from "../shared/touch-ids.js";

/**
 * What an EMPTIED touch key is written as — the key a carve leaves behind once
 * its production is gone.
 *
 * `T_BLANK` + `sp` 10, which is the corpus's own spelling rather than a choice
 * made here. Measured across ../keyboards: `T_BLANK` occurs 117 times and
 * carries `sp` 10 on every one of them; `T_SPACER` another 106 times, likewise
 * always 10. `T_BLANK` with `sp` 9 does not occur at all. Sixty-six of those
 * `T_BLANK`s are in `sil_cameroon_azerty`, so a keyboard adapted from it ends
 * up with emptied keys written exactly the way its own shipped blanks are.
 *
 * `sp` is the load-bearing half. A key whose production is cleared but whose
 * `sp` still says "character" is a dead key that draws as a live one — the
 * mirror of the half-done suppression FR-029c forbids, and what an author sees
 * as a full-size keycap that silently emits nothing. Spacer rather than blank
 * because the key only survives the carve to hold its row's width stable (R9),
 * and a spacer holds width without drawing a keycap.
 *
 * Stated here, once, so the IR applier and its raw-JSON twin cannot disagree
 * about what an emptied key looks like — the same reason every other predicate
 * in this module is shared rather than duplicated.
 *
 * NOT taken from `proposeSuppressFields`, whose `keycap-hole` shape pairs
 * `T_BLANK` with `sp` 9 (key-id-policy.md §2). That combination appears nowhere
 * in the corpus. The discrepancy is flagged, not silently reconciled: changing
 * what a `suppress` operation writes is a separate, spec-owned decision.
 */
export const BLANK_KEY_ID = "T_BLANK";

/** @see {@link BLANK_KEY_ID} — the `sp` class that pairs with it. */
export const BLANK_KEY_SP = 10;

/**
 * Return `true` when an existing sub-key (sk[] or multitap[] entry) already
 * represents `char` — either by its displayed text/output value OR by a
 * `U_<HEX>` id that maps to the same code point.
 *
 * Real shipped layouts sometimes carry id-only entries (e.g. `{ id: "U_00E2" }`
 * with no `text` or `output`); the text/output-only test misses those, causing
 * a duplicate to be appended on the next apply.  This predicate covers both.
 *
 * @param existing  An sk[] or multitap[] element from a parsed touch layout.
 * @param char      The character being applied (e.g. "â").
 */
export function isTouchSubKeyDuplicate(
  existing: { text?: string; output?: string; id?: string },
  char: string,
): boolean {
  const target = char.normalize("NFC");
  const existingText = existing.text ?? existing.output;
  if (existingText !== undefined && existingText.normalize("NFC") === target) {
    return true;
  }
  const decodedId =
    existing.id !== undefined ? unicodeKeyIdToChar(existing.id) : undefined;
  return decodedId !== undefined && decodedId.normalize("NFC") === target;
}

/**
 * Return `true` when a host key's OWN primary production is already `char`, so
 * a placement targeting that key is a no-op rather than a longpress alternate.
 *
 * Without this, a key can be handed itself as its own `sk[]` alternate. That
 * became easy to hit once placements started targeting the case-derived layer:
 * a shift-layer seed key routinely already carries the uppercase form as its
 * primary production, so re-placing that same character would append a
 * self-referential popup entry.
 *
 * Deliberately narrower than {@link isTouchSubKeyDuplicate}: this is the
 * main-key path, which compares `text`/`output` only and does NOT decode a
 * `U_<HEX>` id — same split as `applyCarveKeycapRemovalsToVfs`'s
 * `mainKeyValueMatches` vs. its sub-key predicate.
 *
 * @param key   The host key from a parsed touch layout (IR or raw JSON).
 * @param char  The character being placed (e.g. "Á").
 */
export function isTouchKeyPrimaryProduction(
  key: { text?: string; output?: string },
  char: string,
): boolean {
  const target = char.normalize("NFC");
  return key.text?.normalize("NFC") === target || key.output?.normalize("NFC") === target;
}

/**
 * Build the canonical (NFC) removal-membership set from a Phase D carve
 * `removals` list, shared by both `applyDesktopModifications` variants so
 * neither builds its own normalization pass (spec 035 contracts/seed-derivation.md
 * clause 2 — "matching is canonical").
 */
export function buildRemovalSet(removals: readonly string[]): Set<string> {
  return new Set(removals.map((c) => c.normalize("NFC")));
}

/**
 * Production context for resolver-backed removal matching (spec 104 T007):
 * the resolver inputs (the keyboard IR + its rule-join index) and the id of
 * the layer the candidate sits on — the layer name IS the key's state on
 * touch (FR-001), so one context serves every key on that layer, main keys
 * and sub-keys alike.
 */
export interface RemovalProductionContext {
  readonly production: ResolveTouchProductionInputs;
  readonly layerId: string;
}

/**
 * True when a resolver production record produces any character in
 * `removalSet` (NFC). Shared by {@link keyMatchesRemovalSet} and the carve
 * operation (carveTouchProducers.ts) so the two cannot drift on what
 * "produces a removed character" means:
 *
 *   - a text production whose whole NFC form is in the set matches;
 *   - a RULE production additionally matches per codepoint — the rule-join's
 *     `produced` set was per-char, and coverage's resolver crediting (T025)
 *     follows the same split, so a rule emitting a string containing a
 *     removed character counts as producing it;
 *   - a marked decode fall-through entry (`viaFallback`, a ruled `U_` key's
 *     no-rule-matches decode) matches whole-unit only, never per codepoint:
 *     it is one decode mechanism, credited as a unit by the same precedent.
 *
 * Deadkey, layer-switch, `none`, and `unknown` productions are not
 * characters and never match: no verdict may be premised on them
 * (contracts §1/§5).
 */
export function productionMatchesRemovalSet(
  record: TouchKeyProduction,
  removalSet: ReadonlySet<string>,
): boolean {
  for (const entry of record.productions) {
    if (entry.output.kind !== "text") continue;
    const text = entry.output.text;
    if (removalSet.has(text.normalize("NFC"))) return true;
    if (entry.viaFallback !== true && record.source === "rule") {
      for (const ch of text) {
        if (removalSet.has(ch.normalize("NFC"))) return true;
      }
    }
  }
  return false;
}

/**
 * Resolve one candidate's production in its layer's state and test it
 * against `removalSet` — the resolver half of {@link keyMatchesRemovalSet},
 * exported for the carve operation, which needs the same verdict per
 * occurrence without re-deriving the state plumbing.
 */
export function candidateMatchesViaProduction(
  candidate: { id?: string; sp?: number; nextlayer?: string },
  removalSet: ReadonlySet<string>,
  ctx: RemovalProductionContext,
): boolean {
  const key: TouchKeyIR = {
    nodeId: "",
    id: candidate.id ?? "",
    ...(candidate.sp !== undefined ? { sp: candidate.sp } : {}),
    ...(candidate.nextlayer !== undefined ? { nextlayer: candidate.nextlayer } : {}),
  };
  const record = resolveTouchProduction(
    ctx.production,
    key,
    touchKeyStateFromLayerId(ctx.layerId),
  );
  return productionMatchesRemovalSet(record, removalSet);
}

/**
 * Return `true` when a key/sub-key candidate produces a character in
 * `removalSet`.
 *
 * Two modes, by whether `productionCtx` is supplied (spec 104 T007,
 * following the Wave 1 resolver-migration precedent in coverage):
 *
 *   - WITH a production context, matching is PRODUCTION ONLY: the
 *     candidate matches iff any of its per-state productions (from the
 *     FR-003 resolver) is in the set. This is the fix for audit gap 1 — a
 *     ruled `T_` key whose keycap shows a dotted-circle label (`T_0300`,
 *     text `"◌̀"`) produces U+0300 entirely through its `.kmn` rules, and
 *     the text/output/U_-decode test below cannot see it; conversely a
 *     `T_BLANK` spacer whose text happens to be `" "` produces nothing
 *     and must not spuriously match.
 *   - WITHOUT one (callers holding only a layout — the raw-JSON replay),
 *     the legacy test runs byte-identically: `text`, `output`, or a
 *     `U_<HEX>`-decoded `id` in the set.
 *
 * Matching is canonical in both modes: every candidate string is
 * NFC-normalized before comparison against `removalSet` (which is itself
 * NFC — see {@link buildRemovalSet}), so an NFD-stored occurrence of a
 * carved char (base + combining mark) is still matched even though
 * `removalSet` entries are precomposed (spec 035
 * contracts/seed-derivation.md clause 2).
 *
 * @param candidate       A TouchKeyIR (or raw-JSON key/sub-key) shape.
 * @param removalSet      NFC-normalized removal set from {@link buildRemovalSet}.
 * @param productionCtx   Optional resolver context (spec 104).
 */
export function keyMatchesRemovalSet(
  candidate: { text?: string; output?: string; id?: string; sp?: number; nextlayer?: string },
  removalSet: ReadonlySet<string>,
  productionCtx?: RemovalProductionContext,
): boolean {
  if (productionCtx !== undefined) {
    return candidateMatchesViaProduction(candidate, removalSet, productionCtx);
  }
  if (candidate.text !== undefined && removalSet.has(candidate.text.normalize("NFC"))) {
    return true;
  }
  if (candidate.output !== undefined && removalSet.has(candidate.output.normalize("NFC"))) {
    return true;
  }
  const decoded = candidate.id !== undefined ? unicodeKeyIdToChar(candidate.id) : undefined;
  return decoded !== undefined && removalSet.has(decoded.normalize("NFC"));
}

/**
 * Resolve the index of the mobile platform ("phone" or "tablet") that Phase C
 * placement replay ({@link applyDesktopModifications.ts}'s `applyPlacements`)
 * and Phase E touch-assignment application (`applyTouchAssignments.ts`)
 * target. "phone" wins when both are present — unchanged legacy behavior for
 * every existing phone-only seed/shipped layout. "tablet" is the fallback so
 * a tablet-style seed (`buildCaseASeed`'s `platformStyle:"tablet"` reseed
 * path, scaffoldTouchLayout.ts) is still a valid replay/assignment target
 * instead of silently no-op'ing. Returns -1 when neither is present.
 */
export function resolveMobilePlatformIndex(
  platforms: ReadonlyArray<{ id: string }>,
): number {
  const phoneIdx = platforms.findIndex((p) => p.id === "phone");
  if (phoneIdx !== -1) return phoneIdx;
  return platforms.findIndex((p) => p.id === "tablet");
}

/**
 * Deadkey / store-index placement extraction (placement-priors v2).
 *
 * v1 (index.ts) only ever emitted `mechanism: "direct"` candidates and
 * skipped every rule whose context carried a `deadkey` element. This module
 * adds the two corpus-attested, ALLOWLISTED deadkey shapes (v2 scope — see
 * spec.md §7.6):
 *
 *   (a) Single deadkey + `any(charStore)` context, single `index(store, N)`
 *       output — e.g. `dk(003b) + any(dkf003b) > index(dkt003b,2)`
 *       (release/g/ghana). Emits one `"store-index"` candidate per paired
 *       (baseLetter, outputChar) position across the two stores.
 *   (b) Single deadkey + a quoted literal-char context, single-char output
 *       — e.g. `dk(bkt) + "N" > U+014A` idiom (this exact rule is itself
 *       opaque in the corpus because `bkt` is a NAMED, non-hex deadkey —
 *       see the module docstring in index.ts and opaque-reasons.ts; numeric
 *       `dk(NNNN)` keyboards using this shape DO reach typed IR and are
 *       covered here, e.g. release/basic/basic_kbdcherp).
 *
 * Everything else — multi-deadkey context, `any()` over a non-char (VKEY)
 * store, multi-element output, `context()`-bearing rules, platform-gated
 * rules (`targetSelector`), and any other unrecognised deadkey-context shape
 * — is SKIPPED LOUDLY: every discard bumps a counted reason in the caller-
 * supplied `skipCounts` map (mirrors the codec's `opaqueFeatures` counting),
 * never silently dropped.
 *
 * Deliberately mechanism-only: the trigger key (the deadkey itself) is never
 * recorded on the emitted candidate — trigger choice is keyboard-
 * idiosyncratic (spec §7.6 design note); only the base letter the mechanism
 * composes onto is corpus-attested and stable enough to suggest.
 *
 * Runs over ALL of `ir.groups[]`, not just `usingKeys` groups: corpus
 * deadkey-consumer rules commonly live in a dedicated `group(deadkeys)` with
 * NO `using keys` clause (e.g. release/a/amazigh_latin's `group(deadkeys)`)
 * as well as inside a `using keys` group (release/g/ghana's `group(main)`).
 * Gating on `group.usingKeys` — as the v1 direct-mechanism pass does, safely,
 * since a direct rule always needs a struck vkey which only a `using keys`
 * group can define — would silently miss the non-`using keys` case for
 * deadkey rules. This pass keys off CONTEXT SHAPE instead.
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 * @see spec.md §7.3 (S-02 deadkey strategy card)
 */

import type {
  ContextElement,
  IRRule,
  KeyboardIR,
  OutputElement,
  PlacementCandidate,
} from "@keyboard-studio/contracts";
import { US_UNSHIFTED, isSingleCodepoint } from "./filters.js";

// ---------------------------------------------------------------------------
// Base-letter -> vkey lookup (inverse of the engine's pinned US base layout)
// ---------------------------------------------------------------------------

/** Lowercase base letter -> vkey, inverted from `US_UNSHIFTED` (the engine's
 *  existing pinned US-QWERTY letter-key table — see filters.ts). Reused
 *  rather than re-declared so the two tables cannot drift. */
const CHAR_TO_VKEY: ReadonlyMap<string, string> = new Map(
  Object.entries(US_UNSHIFTED).map(([vkey, ch]) => [ch, vkey]),
);

function vkeyForBaseLetter(baseLetter: string): string | null {
  return CHAR_TO_VKEY.get(baseLetter.toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Skip reasons — counted, never silent
// ---------------------------------------------------------------------------

export const DEADKEY_SKIP_REASONS = {
  MULTI_DEADKEY: "multi-deadkey-context",
  NON_CHAR_STORE: "any-over-non-char-store",
  STORE_LENGTH_MISMATCH: "store-length-mismatch",
  MULTI_ELEMENT_OUTPUT: "multi-element-output",
  CONTEXT_BEARING: "context-bearing-rule",
  BASELAYOUT_CONTEXT: "baselayout-context-rule",
  PLATFORM_GATED: "platform-gated-rule",
  UNMAPPED_BASE_LETTER: "unmapped-base-letter",
  MULTI_CODEPOINT_GRAPHEME: "multi-codepoint-grapheme",
  UNRECOGNIZED_SHAPE: "unrecognized-deadkey-shape",
} as const;

/** Counted skip-reason accumulator — every discard bumps a named counter. */
export type DeadkeySkipCounts = Map<string, number>;

function bump(counts: DeadkeySkipCounts, reason: string): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The codec preserves a mid-rule `+` (e.g. `dk(003b) + any(dkf003b) > ...`)
 * as an untyped `{kind:"raw", text:"+"}` context element — it is a syntactic
 * marker (the Keyman "context / key-press" divider), not semantic context,
 * and real corpus keyboards write the same rule with or without it (compare
 * release/g/ghana's `dk(003b) + any(...)` to release/a/amazigh_latin's bare
 * `dk(003b) any(...)`). Both must extract identically, so it is filtered out
 * before any shape or position check.
 */
function stripPlusMarker(context: ContextElement[]): ContextElement[] {
  return context.filter((el) => !(el.kind === "raw" && el.text === "+"));
}

/** A store whose items are ALL `char` — returns its characters in order, or
 *  `null` if the store is missing or contains any non-char item (e.g. a
 *  vkey/deadkey/any store). */
function resolvePureCharStore(ir: KeyboardIR, name: string): string[] | null {
  const store = ir.stores.find((s) => s.name === name);
  if (!store) return null;
  const chars: string[] = [];
  for (const item of store.items) {
    if (item.kind !== "char") return null;
    chars.push(item.value);
  }
  return chars;
}

interface RawCandidate {
  codepoint: number;
  candidate: PlacementCandidate;
}

function makeCandidate(
  vkey: string,
  mechanism: "deadkey" | "store-index",
  baseLetter: string,
): PlacementCandidate {
  return {
    vkey,
    modifiers: [],
    mechanism,
    priorSource: "corpus",
    priorCount: 1,
    confidence: 0.5,
    baseLetter,
  };
}

// ---------------------------------------------------------------------------
// Per-rule extraction
// ---------------------------------------------------------------------------

/**
 * Extract deadkey/store-index candidates from one rule, or bump a counted
 * skip reason and return an empty array. Returns an empty array (no skip
 * bump) for rules whose context has no deadkey element at all — those are
 * simply not deadkey rules, not a discard.
 */
export function extractDeadkeyCandidatesFromRule(
  ir: KeyboardIR,
  rule: IRRule,
  skipCounts: DeadkeySkipCounts,
): RawCandidate[] {
  // Platform-gated rules ($keymanonly:/$keymanweb:) are corpus-idiosyncratic
  // per-target overrides — skip loudly rather than mining a partial view.
  if (rule.targetSelector !== undefined) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.PLATFORM_GATED);
    return [];
  }

  const ctx = stripPlusMarker(rule.context);
  const deadkeyCount = ctx.filter((el) => el.kind === "deadkey").length;
  if (deadkeyCount === 0) return []; // not a deadkey rule — nothing to extract or skip.
  if (deadkeyCount > 1) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.MULTI_DEADKEY);
    return [];
  }
  if (ctx.some((el) => el.kind === "context")) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.CONTEXT_BEARING);
    return [];
  }
  if (ctx.some((el) => el.kind === "baselayout")) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.BASELAYOUT_CONTEXT);
    return [];
  }
  if (ctx.length !== 2) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.UNRECOGNIZED_SHAPE);
    return [];
  }

  const anyEl = ctx.find((el) => el.kind === "any");
  const charEl = ctx.find((el) => el.kind === "char");

  if (anyEl !== undefined) {
    return extractStoreIndexShape(ir, anyEl, rule.output, skipCounts);
  }
  if (charEl !== undefined) {
    return extractLiteralDeadkeyShape(charEl, rule.output, skipCounts);
  }

  // dk + notany()/index()/vkey()/etc — no allowlisted shape.
  bump(skipCounts, DEADKEY_SKIP_REASONS.UNRECOGNIZED_SHAPE);
  return [];
}

/** Shape (a): `dk(...) + any(charStore) > index(store, N)`. */
function extractStoreIndexShape(
  ir: KeyboardIR,
  anyEl: Extract<ContextElement, { kind: "any" }>,
  output: OutputElement[],
  skipCounts: DeadkeySkipCounts,
): RawCandidate[] {
  if (output.length !== 1 || output[0]?.kind !== "index") {
    bump(
      skipCounts,
      output.length > 1
        ? DEADKEY_SKIP_REASONS.MULTI_ELEMENT_OUTPUT
        : DEADKEY_SKIP_REASONS.UNRECOGNIZED_SHAPE,
    );
    return [];
  }
  const outEl = output[0];

  const baseChars = resolvePureCharStore(ir, anyEl.storeRef);
  if (baseChars === null) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.NON_CHAR_STORE);
    return [];
  }
  const outChars = resolvePureCharStore(ir, outEl.storeRef);
  if (outChars === null) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.NON_CHAR_STORE);
    return [];
  }
  if (baseChars.length !== outChars.length) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.STORE_LENGTH_MISMATCH);
    return [];
  }

  const out: RawCandidate[] = [];
  for (let i = 0; i < baseChars.length; i++) {
    const baseLetter = baseChars[i] ?? "";
    const outputChar = outChars[i] ?? "";
    if (!isSingleCodepoint(baseLetter) || !isSingleCodepoint(outputChar)) {
      bump(skipCounts, DEADKEY_SKIP_REASONS.MULTI_CODEPOINT_GRAPHEME);
      continue;
    }
    const vkey = vkeyForBaseLetter(baseLetter);
    if (vkey === null) {
      bump(skipCounts, DEADKEY_SKIP_REASONS.UNMAPPED_BASE_LETTER);
      continue;
    }
    const codepoint = outputChar.codePointAt(0) ?? 0;
    if (codepoint === 0) continue;
    out.push({
      codepoint,
      candidate: makeCandidate(vkey, "store-index", baseLetter),
    });
  }
  return out;
}

/** Shape (b): `dk(...) + "X" > singleChar`. */
function extractLiteralDeadkeyShape(
  charEl: Extract<ContextElement, { kind: "char" }>,
  output: OutputElement[],
  skipCounts: DeadkeySkipCounts,
): RawCandidate[] {
  if (output.length !== 1 || output[0]?.kind !== "char") {
    bump(
      skipCounts,
      output.length > 1
        ? DEADKEY_SKIP_REASONS.MULTI_ELEMENT_OUTPUT
        : DEADKEY_SKIP_REASONS.UNRECOGNIZED_SHAPE,
    );
    return [];
  }
  const baseLetter = charEl.value;
  const outputChar = output[0].value;
  if (!isSingleCodepoint(baseLetter) || !isSingleCodepoint(outputChar)) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.MULTI_CODEPOINT_GRAPHEME);
    return [];
  }
  const vkey = vkeyForBaseLetter(baseLetter);
  if (vkey === null) {
    bump(skipCounts, DEADKEY_SKIP_REASONS.UNMAPPED_BASE_LETTER);
    return [];
  }
  const codepoint = outputChar.codePointAt(0) ?? 0;
  if (codepoint === 0) return [];
  return [{ codepoint, candidate: makeCandidate(vkey, "deadkey", baseLetter) }];
}

// ---------------------------------------------------------------------------
// Whole-IR extraction
// ---------------------------------------------------------------------------

/**
 * Walk every group in `ir` (regardless of `usingKeys` — see module docstring)
 * and extract deadkey/store-index placement candidates. Group-transition
 * rules (`match`/`nomatch > use(...)`) are skipped without counting — they
 * are structurally never deadkey rules.
 */
export function extractDeadkeyCandidates(
  ir: KeyboardIR,
  skipCounts: DeadkeySkipCounts,
): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.matchKind !== undefined) continue;
      out.push(...extractDeadkeyCandidatesFromRule(ir, rule, skipCounts));
    }
  }
  return out;
}

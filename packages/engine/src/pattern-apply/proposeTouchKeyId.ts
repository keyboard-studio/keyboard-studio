/**
 * proposeTouchKeyId — the inherit-first key-id proposer for the touch key
 * editor (spec 061 US5; FR-029…FR-032,
 * contracts/id-and-keycap-proposals.md §1).
 *
 * A thin wrapper around the untouched {@link proposeKeyId}: it asks two cheaper
 * questions first (can this key keep the id it already had? does some key
 * already produce this character?) and, when nothing applies, says WHY instead
 * of returning nothing. `proposeKeyId`'s four minting paths are unchanged and
 * are still the answer for every ordinary character.
 *
 * ## "Never by geometric proximity" is structural, not a promise
 *
 * FR-030 forbids inferring a key's id from where it sits. That is enforced by
 * the SHAPE of {@link TouchKeyIdProposalRequest}: it carries no row, no index,
 * no coordinate, no platform, no layer. The only positional fact that reaches
 * this module is `inheritedId` — an id the caller already resolved — and the
 * only question askable of the rule index is `producedByKeyId`. There is
 * nothing here to be geometric WITH, which is a stronger guarantee than a
 * comment asking future callers not to be (research D9).
 *
 * ## Coverage is the gate on inheriting
 *
 * Step 1 inherits only when the physical key's existing rules produce EVERY
 * entry of `expectedOutputs` — its modifier outputs included, not just the
 * unshifted one. A key whose shift output was reassigned elsewhere fails the
 * check and falls through to minting. That is the correct outcome: keeping the
 * id would silently claim an output the key no longer produces.
 */

import { producedByKeyId, type TouchKeyRuleIndex } from "@keyboard-studio/contracts";
import {
  proposeKeyId,
  type KeyIdMintingProposal,
  type KeyIdMintingRequest,
} from "./keyIdMinting.js";

/**
 * Why this proposal took the path it did — the "because" the panel shows.
 *
 * Distinct from `KeyIdMintingPath`: the path says which RULE produced the id,
 * this says which QUESTION found it.
 */
export type TouchKeyIdProposalReason =
  | { readonly kind: "inherited-from-physical-key"; readonly keyId: string }
  | { readonly kind: "existing-producer"; readonly keyId: string }
  | { readonly kind: "minted" };

/**
 * Why no id could be proposed (FR-032). Structured, never prose (FR-037) — the
 * studio composes and localizes each into `key-property-panel-no-proposal-reason`.
 *
 * The enumeration of what reaches each arm is
 * [character-classes.md](../../../../specs/061-touch-editor-parity/contracts/character-classes.md),
 * and T045 is a table-driven test over it.
 *
 * **`titlecase-self-third-form` is carried, but this module never sets it.**
 * A titlecase character gets an ordinary `U_` id — only its CASE TRIPLE is
 * impossible, and `proposeKeyId` already reports that through the long-standing
 * `noCaseTripleReason`. Setting `noProposalReason` as well would be a
 * contradiction: there IS a proposal. The arm exists so the studio has one
 * union to localize (contract §1.2), and the panel renders it from
 * `noCaseTripleReason`. See character-classes.md row 5.
 */
export type NoProposalReason =
  | { readonly kind: "titlecase-self-third-form" }
  | { readonly kind: "unassigned-codepoint" }
  | { readonly kind: "variation-selector-only" }
  | { readonly kind: "emoji-sequence-unsupported" }
  | { readonly kind: "empty-output" };

/** Input to {@link proposeTouchKeyId}. Carries no positional facts — see the module doc. */
export interface TouchKeyIdProposalRequest {
  /** The character(s) the author wants this key to produce. */
  readonly chars: string;
  /** The id the physical key at this position already carries, if any. */
  readonly inheritedId?: string;
  /** The rule join, asked only `producedByKeyId`. */
  readonly ruleIndex: TouchKeyRuleIndex;
  /** Everything the key must still produce — default AND modifier outputs. */
  readonly expectedOutputs: readonly string[];
  /** Does the keyboard already handle CAPS (gates offering a case triple). */
  readonly capsHandled: boolean;
  /** BCP47 tag for locale-sensitive case mapping. */
  readonly bcp47?: string;
  /** Explicit author request for the NCAPS/SHIFT+NCAPS/CAPS trio. */
  readonly caseTripleRequested?: boolean;
  /** How many other layers/platforms already carry a candidate `T_` id. */
  readonly sharedCandidateCount?: number;
}

/** A proposal, or a stated reason there is none. Never silence (FR-032). */
export interface TouchKeyIdProposal extends Partial<KeyIdMintingProposal> {
  /** Present unless `noProposalReason` is. */
  readonly id?: string;
  /** Which question found the id; absent when there is no proposal. */
  readonly because?: TouchKeyIdProposalReason;
  /** Present only when no path applied. */
  readonly noProposalReason?: NoProposalReason;
}

const ZWJ = "‍";
const VARIATION_SELECTOR_16 = "️";

/** Every codepoint is a variation selector (VS1-16 or the supplement). */
function isVariationSelectorOnly(chars: string): boolean {
  const cps = [...chars];
  if (cps.length === 0) return false;
  return cps.every((c) => {
    const cp = c.codePointAt(0) ?? 0;
    return (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
  });
}

/**
 * A sequence Keyman's touch layer cannot express as one key id.
 *
 * Checked BEFORE the multi-codepoint path deliberately: a ZWJ sequence IS a
 * multi-codepoint string, so minting would give it a `U_` id carrying the first
 * codepoint's worth of meaning and quietly lose the rest
 * (character-classes.md row 7).
 *
 * **`Extended_Pictographic` content is required, on BOTH joiner branches.**
 * Neither joiner is emoji-exclusive: ZWJ (U+200D) is linguistically
 * load-bearing — Devanagari/Bengali/Kannada conjunct control, Sinhala and
 * Malayalam chillu formation, Arabic cursive joining — and U+FE0F likewise
 * appears in non-emoji variation sequences. A key authoring one of those types
 * an ordinary multi-codepoint string (row 3) and must get an id, not the
 * `emoji-sequence-unsupported` refusal, so the joiner alone cannot decide this;
 * it is the joiner AND a pictograph that makes a sequence emoji.
 */
function isEmojiSequence(chars: string): boolean {
  const cps = [...chars];
  if (cps.length < 2) return false;
  if (!/\p{Extended_Pictographic}/u.test(chars)) return false;
  return chars.includes(ZWJ) || chars.includes(VARIATION_SELECTOR_16);
}

/** Any codepoint has no Unicode assignment. */
function hasUnassignedCodepoint(chars: string): boolean {
  return [...chars].some((c) => /\p{Cn}/u.test(c));
}

/**
 * The refusals, in the order character-classes.md fixes. Returns the first that
 * applies, or `undefined` when the character is mintable.
 */
function refusalFor(chars: string): NoProposalReason | undefined {
  if (chars.length === 0) return { kind: "empty-output" };
  if (isVariationSelectorOnly(chars)) return { kind: "variation-selector-only" };
  if (isEmojiSequence(chars)) return { kind: "emoji-sequence-unsupported" };
  if (hasUnassignedCodepoint(chars)) return { kind: "unassigned-codepoint" };
  return undefined;
}

/** Does `keyId` produce every one of `expectedOutputs`? Compared under NFC. */
function coversAll(
  ruleIndex: TouchKeyRuleIndex,
  keyId: string,
  expectedOutputs: readonly string[],
): boolean {
  if (expectedOutputs.length === 0) return false;
  const produced = new Set(producedByKeyId(ruleIndex, keyId).map((c) => c.normalize("NFC")));
  return expectedOutputs.every((o) => produced.has(o.normalize("NFC")));
}

/** The first id that already produces exactly `chars`, if any. */
function existingProducerOf(
  ruleIndex: TouchKeyRuleIndex,
  chars: string,
): string | undefined {
  const wanted = chars.normalize("NFC");
  for (const id of ruleIndex.producingIds) {
    if (producedByKeyId(ruleIndex, id).some((c) => c.normalize("NFC") === wanted)) {
      return id;
    }
  }
  return undefined;
}

/**
 * Propose an id for a touch key, or state why none is possible.
 *
 * Order of attempt (contract §1.1): inherit → existing producer → mint →
 * stated reason. The refusal check runs before minting, never before
 * inheriting: a key that already carries a working id keeps it even if its
 * output is something this module would decline to mint fresh.
 */
export function proposeTouchKeyId(req: TouchKeyIdProposalRequest): TouchKeyIdProposal {
  // 1 — inherit (FR-029). No rule is written.
  if (
    req.inheritedId !== undefined &&
    req.inheritedId.length > 0 &&
    coversAll(req.ruleIndex, req.inheritedId, req.expectedOutputs)
  ) {
    return {
      path: "inherited",
      id: req.inheritedId,
      ruleRequired: false,
      guardRequired: false,
      because: { kind: "inherited-from-physical-key", keyId: req.inheritedId },
    };
  }

  // 2 — a physical key already produces this character (FR-030).
  const producer = existingProducerOf(req.ruleIndex, req.chars);
  if (producer !== undefined) {
    return {
      path: "inherited",
      id: producer,
      ruleRequired: false,
      guardRequired: false,
      because: { kind: "existing-producer", keyId: producer },
    };
  }

  // 4 (checked before 3) — the classes that cannot be minted at all.
  const refusal = refusalFor(req.chars);
  if (refusal !== undefined) return { noProposalReason: refusal };

  // 3 — mint (FR-031), unchanged.
  const mintRequest: KeyIdMintingRequest = {
    chars: req.chars,
    capsHandled: req.capsHandled,
    ...(req.caseTripleRequested !== undefined
      ? { caseTripleRequested: req.caseTripleRequested }
      : {}),
    ...(req.bcp47 !== undefined ? { bcp47: req.bcp47 } : {}),
    ...(req.sharedCandidateCount !== undefined
      ? { sharedCandidateCount: req.sharedCandidateCount }
      : {}),
  };
  return { ...proposeKeyId(mintRequest), because: { kind: "minted" } };
}

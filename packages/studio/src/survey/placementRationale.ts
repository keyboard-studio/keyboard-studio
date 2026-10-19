// placementRationale — weighted, author-visible placement rationale (#2300).
//
// Replaces the producer-order cascade's invisible "why" with an explicit
// points breakdown the gallery can order chips by and render as a one-line
// rationale. This is a STUDIO CONSUMPTION layer only: it scores the
// candidates the producer already emitted (contracts PlacementCandidate
// carries priorSource + priorCount + confidence — the entire honest
// evidence base) plus locally-computed occupancy factors from
// slotOccupancy.ts. It never writes back into contracts ordering, the
// PlacementMap, or kbgen.
//
// Weights (alphabetic default — Cycle 1 domain table AS AMENDED by
// Matthew's mid-build ruling, 2026-10-19: "the corpus is over-weighted on
// placement, especially when the replacee and replaced are not of the
// same type… On physical keyboards, combos are mutually exclusive"):
// corpus 15 / phonetic 25 / visual 15 / spare 15 / occupied 20 /
// shift-pair 10 = 100. Phonetic is now the top factor and occupied-cost
// second; ergonomics stays the producer's tiebreak and earns no points.
//
//   corpus    15 — priorCount tiers: >=10 → 15, 3–9 → 11, 1–2 → 5, 0 → 0.
//                  Non-corpus sources earn 0 corpus points. SUBJECT TO
//                  THE TYPE-MATCH GATE below.
//   phonetic  25 — priorSource "phonetic", tiered by confidence:
//                  >=0.8 → 25, >=0.6 → 18, >0 → 13.
//   visual    15 — "unicode-decomp" → 15, "confusable" → 12, stepped down
//                  when confidence < 0.6 (decomp → 8, confusable → 6):
//                  a low-confidence resemblance must not spend full points.
//   spare     15 — true hole (slot free, base key free) → 15; only a free
//                  RAlt/SHIFT plane of an occupied key → 9; unverified
//                  occupancy → 4; slot occupied → 0.
//   occupied  20 — inverse cost: no incumbent → 20, incumbent not needed
//                  → 13, needed-rare → 5, needed-frequent → 0 AND gate G2.
//   shiftPair 10 — S-01/S-08 direct on one key → 10; synthesized
//                  (deadkey / store-index / opaque) → 5.
//
// THE Ñ/ẞ RULE (type-match gate on corpus, Matthew's ruling): corpus
// points count in full ONLY when the candidate slot has no incumbent, or
// the incoming character and the incumbent glyph are the same character
// TYPE (Unicode general-category class: Letter / Mark / Number /
// Punctuation / Symbol / other). Ñ on N is an interesting signal — letter
// displacing letter, the corpus is reporting a convention. ẞ on ' is
// just a leftover — a letter displacing punctuation is a keyboard filling
// a free-ish key, not a convention about where ẞ belongs — so when the
// types DIFFER on an occupied slot, corpus points collapse to a flat
// leftover tier of 3 (0 when priorCount is 0) regardless of priorCount,
// and the rationale line must not cite the corpus count as a reason.
// Corollary for multi-character sessions: a corpus placement that dumps
// several different letters onto the same punctuation key across
// keyboards is leftover evidence per this rule, which is exactly why it
// cannot win repeatedly when the author adds multiple characters.
//
// MUTUAL EXCLUSIVITY (Matthew's ruling): on physical keyboards one
// key+modifier combo holds exactly ONE output. The occupancy ledger this
// module consumes is built AFTER the session overlay (slotOccupancy.ts),
// so a combo claimed by the base, OR by a character placed earlier this
// session, OR by another mechanism of the current char, is occupied for
// every later candidate — never spare. A later character whose candidate
// targets a combo an earlier inventory character just took therefore
// scores that slot as occupied-by-needed, fires G2, and names that
// character as the incumbent its demotion proposal must re-home.
//
// WHO GETS DEMOTED — ORTHOGRAPHY TIER, NOT FREQUENCY (Matthew's second
// ruling, 2026-10-19: "Strictly speaking, we would need frequency data
// to determine whether Ñ replaces N as primary (and which gets
// demoted), but we won't have that data. A convenience character would
// lose to core-orthography."). PINNED RULE, same standing as the
// corpusLead:3 pin — explained here, changeable by a data/spec
// amendment, never silently: the primary/demotion ranking is decided by
// orthography tier (slotOccupancy.ts: core = confirmed inventory,
// convenience = base-produced-and-retained, none) precisely BECAUSE no
// frequency data exists in the studio, and no code here may pretend a
// frequency ranking happened. Direction: core incoming demotes a
// convenience incumbent; convenience incoming loses the primary slot to
// a core incumbent (the demotion points at the INCOMING char); both core
// → neither is demoted by default — the banner states the frequency gap
// and offers demotion only as an explicit author override.
//
// Gates (outside the points, per the domain strategy):
//   G2 — a needed-and-frequent incumbent is a heavy penalty (0 occupied
//        points, no spare points) AND never a silent/clean suggestion:
//        `gated: "G2"` marks the scored candidate so the chip renders the
//        trade-off wording with its demotion named. It is NOT a veto —
//        the author may still accept it, explicitly.
//   G3 — no displacement without a demotion proposal: every scored
//        candidate with an incumbent carries a `demotion` plan (rank 1:
//        RAlt layer on the SAME key; fallback: deadkey, only when the
//        RAlt slot is taken or is the candidate slot itself).
//
// APPROXIMATIONS (assumption deltas — reported, never silent):
//   - A PlacementCandidate carries a SINGLE priorSource, so at most one of
//     corpus / phonetic / visual can score for a given candidate. The
//     domain table imagines independent evidence channels; the shipped
//     data model does not carry them independently, and fabricating the
//     missing channels would be inventing evidence.
//   - Deadkey / store-index candidates consume no physical slot, so they
//     score occupied 20 ("displaces nothing") and spare 4 (the unverified
//     tier — hole availability is not the question for a deadkey), and
//     they never raise G2.
//   - Shift-pair "synthesized/inherited" is approximated by mechanism:
//     case-pair-inherited uppercase entries are indistinguishable from
//     direct entries in candidate shape (they ARE direct candidates with
//     SHIFT added), so they score the direct 10; only non-direct
//     mechanisms score the synthesized 5.
//   - Shift-pair is NOT APPLICABLE to a character with no distinct case
//     counterpart (caseless — digits, punctuation, symbols, uncased
//     letters): there is no pair to keep together, so the factor awards
//     0 points and is flagged `notApplicable` in the breakdown rather
//     than inflating every direct candidate by a flat 10 (Cycle 4 P2-b).
//     Case-paired characters are scored exactly as before. The casing
//     source is the engine's `caseCounterpart` (the ONLY casing source,
//     spec 074 FR-002 — the same helper placementSeeds.ts uses).
//   - Key labels in rationale lines come from the small local labeler
//     below (vkey name → keycap glyph), not the gallery's KeyCap
//     convention module — this module stays dependency-light and pure;
//     the label is display text only and never feeds a decision.
//   - The abjad/abugida corpus-35 re-weighting (Cycle 1 condition C6) is
//     OUT of scope for this PR and is not implemented here.

import type { PlacementCandidate } from "@keyboard-studio/contracts";
import { caseCounterpart } from "@keyboard-studio/engine";
import {
  classifySlot,
  orthographyTier,
  slotKeyFor,
  tierForNeedKind,
  type NeedSets,
  type OrthographyTier,
  type SlotNeedKind,
  type SlotOccupant,
} from "./slotOccupancy.ts";

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

export const PLACEMENT_WEIGHTS = {
  corpus: 15,
  phonetic: 25,
  visual: 15,
  spare: 15,
  occupied: 20,
  shiftPair: 10,
} as const;

/** Flat corpus points for a type-mismatched occupied slot (the Ñ/ẞ rule). */
export const CORPUS_LEFTOVER_POINTS = 3;

// ---------------------------------------------------------------------------
// Character type — Unicode general-category class (the Ñ/ẞ rule)
// ---------------------------------------------------------------------------

export type GeneralCategoryClass =
  | "letter"
  | "mark"
  | "number"
  | "punctuation"
  | "symbol"
  | "other";

/**
 * The character TYPE of a glyph: its Unicode general-category class,
 * via property escapes (the pattern placementSeeds.ts already uses for
 * `\p{M}`). Only the first codepoint is consulted — incumbents and
 * incoming characters in this ledger are single glyphs by construction.
 */
export function generalCategoryClass(char: string): GeneralCategoryClass {
  const ch = [...char][0] ?? "";
  if (ch === "") return "other";
  if (/\p{L}/u.test(ch)) return "letter";
  if (/\p{M}/u.test(ch)) return "mark";
  if (/\p{N}/u.test(ch)) return "number";
  if (/\p{P}/u.test(ch)) return "punctuation";
  if (/\p{S}/u.test(ch)) return "symbol";
  return "other";
}

/** Below this total the rationale line must confess the match is weak. */
export const WEAK_MATCH_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RationaleFactorId =
  | "corpus"
  | "phonetic"
  | "visual"
  | "spare"
  | "occupied"
  | "shiftPair";

export interface RationaleFactor {
  id: RationaleFactorId;
  points: number;
  max: number;
  /** Plain-words label for the factor at the awarded tier. */
  label: string;
  /**
   * True when the factor does not apply to this character at all
   * (shift-pair for a caseless character — Cycle 4 P2-b): the factor
   * awards 0 and must not be read as a failed test, just an absent one.
   */
  notApplicable?: true;
}

export interface DemotionPlan {
  method: "ralt" | "deadkey";
  /** The key the demotion targets (the contested key itself). */
  vkey: string;
  /** Plain-words description of the demotion slot, e.g. "AltGr + the ' key". */
  description: string;
  /**
   * WHO gets demoted, decided by orthography tier (see the pinned rule
   * in the module header): "incumbent" (the usual case), "incoming"
   * (a convenience character loses the primary slot to a core
   * incumbent), or "none" (both core — the studio picks no victim;
   * demotion exists only as an explicit author override).
   */
  target: "incumbent" | "incoming" | "none";
}

export interface ScoredCandidate {
  total: number;
  factors: RationaleFactor[];
  /** Gate G2 marker, or null when no gate fires. */
  gated: "G2" | null;
  /** The incumbent this candidate would displace, or null for a hole. */
  incumbent: { char: string; need: SlotNeedKind } | null;
  /** Where the incumbent goes, when there is one (gate G3). */
  demotion: DemotionPlan | null;
  /**
   * True when the type-match gate collapsed this candidate's corpus
   * points to the leftover tier (occupied slot, different character
   * type). The rationale line must not cite the corpus count then.
   */
  corpusLeftover: boolean;
  /** Orthography tier of the incoming character (steer 2). */
  incomingTier: OrthographyTier;
  /** Orthography tier of the incumbent, or null for a hole. */
  incumbentTier: OrthographyTier | null;
  // Carried for the rationale-line builder (not separate evidence):
  vkey: string;
  modifiers: string[];
  mechanism: PlacementCandidate["mechanism"];
  priorSource: PlacementCandidate["priorSource"];
  priorCount: number;
}

/** Everything {@link scoreCandidate} needs beyond the candidate itself. */
export interface OccupancyContext extends NeedSets {
  occupancy: ReadonlyMap<string, SlotOccupant>;
  /**
   * False when no working IR was available to build the ledger from — a
   * "free" slot is then unverified and earns only the 4-point spare tier.
   * Defaults to true.
   */
  occupancyVerified?: boolean;
}

// ---------------------------------------------------------------------------
// Key label (display only — see module doc)
// ---------------------------------------------------------------------------

const SPECIAL_KEY_LABELS: Record<string, string> = {
  QUOTE: "'",
  HYPHEN: "-",
  MINUS: "-",
  COMMA: ",",
  PERIOD: ".",
  SLASH: "/",
  BKSLASH: "\\",
  SEMICOLON: ";",
  LBRKT: "[",
  RBRKT: "]",
  EQUAL: "=",
  GRAVE: "`",
};

/** Minimal vkey → keycap-glyph label for rationale text. */
export function rationaleKeyLabel(vkey: string): string {
  const bare = vkey.startsWith("K_") ? vkey.slice(2) : vkey;
  const special = SPECIAL_KEY_LABELS[bare];
  if (special !== undefined) return special;
  if (/^[A-Z]$/.test(bare)) return bare.toLowerCase();
  return bare;
}

function slotDescription(vkey: string, modifiers: readonly string[]): string {
  const key = rationaleKeyLabel(vkey);
  if (modifiers.length === 0) return `the ${key} key`;
  const mods = modifiers.map((m) => (m === "RALT" ? "AltGr" : m === "SHIFT" ? "Shift" : m));
  return `${mods.join("+")} + the ${key} key`;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreCandidate(
  candidate: PlacementCandidate,
  char: string,
  ctx: OccupancyContext,
): ScoredCandidate {
  const keyLabel = rationaleKeyLabel(candidate.vkey);
  const isDeadkeyMech =
    candidate.mechanism === "deadkey" || candidate.mechanism === "store-index";
  const slotKey = slotKeyFor(candidate.vkey, candidate.modifiers);
  const classification = classifySlot(ctx.occupancy, slotKey, ctx);
  // A slot that already types the candidate's own char displaces nothing.
  const selfOccupied =
    classification.incumbent !== null &&
    classification.incumbent.char.normalize("NFC") === char.normalize("NFC");
  const incumbent =
    classification.incumbent !== null && !selfOccupied
      ? { char: classification.incumbent.char, need: classification.kind }
      : null;

  // --- corpus (15, type-gated — the Ñ/ẞ rule) ------------------------------
  let corpusTier = 0;
  if (candidate.priorSource === "corpus") {
    if (candidate.priorCount >= 10) corpusTier = 15;
    else if (candidate.priorCount >= 3) corpusTier = 11;
    else if (candidate.priorCount >= 1) corpusTier = 5;
  }
  // Full points only for an empty slot or a same-type displacement;
  // a different-type incumbent reduces the corpus evidence to leftover.
  const corpusLeftover =
    candidate.priorSource === "corpus" &&
    incumbent !== null &&
    generalCategoryClass(char) !== generalCategoryClass(incumbent.char);
  const corpusPoints = corpusLeftover
    ? candidate.priorCount >= 1
      ? CORPUS_LEFTOVER_POINTS
      : 0
    : corpusTier;
  const corpus: RationaleFactor = {
    id: "corpus",
    points: corpusPoints,
    max: PLACEMENT_WEIGHTS.corpus,
    label: corpusLeftover
      ? "Leftover corpus placement — a different kind of character sits there"
      : corpusPoints > 0
        ? `Attested by ${candidate.priorCount} keyboards`
        : "No corpus attestation",
  };

  // --- phonetic (25) -----------------------------------------------------
  let phoneticPoints = 0;
  if (candidate.priorSource === "phonetic") {
    if (candidate.confidence >= 0.8) phoneticPoints = 25;
    else if (candidate.confidence >= 0.6) phoneticPoints = 18;
    else if (candidate.confidence > 0) phoneticPoints = 13;
  }
  const phonetic: RationaleFactor = {
    id: "phonetic",
    points: phoneticPoints,
    max: PLACEMENT_WEIGHTS.phonetic,
    label:
      phoneticPoints > 0
        ? `Sounds like the ${keyLabel} key`
        : "No sound link to that key",
  };

  // --- visual / decomposition (15) ---------------------------------------
  let visualPoints = 0;
  if (candidate.priorSource === "unicode-decomp") {
    visualPoints = candidate.confidence >= 0.6 ? 15 : 8;
  } else if (candidate.priorSource === "confusable") {
    visualPoints = candidate.confidence >= 0.6 ? 12 : 6;
  }
  const visual: RationaleFactor = {
    id: "visual",
    points: visualPoints,
    max: PLACEMENT_WEIGHTS.visual,
    label:
      candidate.priorSource === "unicode-decomp" && visualPoints > 0
        ? `Built from the ${keyLabel} key's letter plus a mark`
        : candidate.priorSource === "confusable" && visualPoints > 0
          ? `Looks like '${incumbent?.char ?? keyLabel}'`
          : "No shape link to that key",
  };

  // --- spare hole (15) -----------------------------------------------------
  let sparePoints: number;
  let spareLabel: string;
  if (isDeadkeyMech) {
    sparePoints = 4;
    spareLabel = "Uses a deadkey, not a key slot";
  } else if (selfOccupied) {
    sparePoints = 0;
    spareLabel = "That spot already types this character";
  } else if (classification.kind === "spare") {
    if (ctx.occupancyVerified === false) {
      sparePoints = 4;
      spareLabel = "That spot looks empty (not verified)";
    } else if (
      candidate.modifiers.length > 0 &&
      ctx.occupancy.has(slotKeyFor(candidate.vkey, []))
    ) {
      sparePoints = 9;
      spareLabel = `Only this layer of the ${keyLabel} key was empty`;
    } else {
      sparePoints = 15;
      spareLabel = "That spot was empty";
    }
  } else {
    sparePoints = 0;
    spareLabel = `No empty spot on the ${keyLabel} key`;
  }
  const spare: RationaleFactor = {
    id: "spare",
    points: sparePoints,
    max: PLACEMENT_WEIGHTS.spare,
    label: spareLabel,
  };

  // --- occupied cost, inverse (20) + gate G2 -------------------------------
  let occupiedPoints: number;
  let occupiedLabel: string;
  if (isDeadkeyMech || selfOccupied) {
    occupiedPoints = 20;
    occupiedLabel = "Nothing you use had to move";
  } else if (classification.kind === "spare") {
    occupiedPoints = 20;
    occupiedLabel = "Nothing you use had to move";
  } else if (classification.kind === "not-needed") {
    occupiedPoints = 13;
    occupiedLabel = "The character there is not one you use";
  } else if (classification.kind === "needed-rare") {
    occupiedPoints = 5;
    occupiedLabel = "The character there is rarely used";
  } else {
    occupiedPoints = 0;
    occupiedLabel = "The character there is one you still use";
  }
  const occupied: RationaleFactor = {
    id: "occupied",
    points: occupiedPoints,
    max: PLACEMENT_WEIGHTS.occupied,
    label: occupiedLabel,
  };
  const gated: "G2" | null =
    !isDeadkeyMech && !selfOccupied && classification.kind === "needed-frequent"
      ? "G2"
      : null;

  // --- shift-pair consistency (10) -----------------------------------------
  // Not applicable when the character has no distinct case counterpart
  // (Cycle 4 P2-b): no pair exists to keep together, so 0 points, flagged.
  const hasCasePair = caseCounterpart(char) !== null;
  const shiftPairPoints = !hasCasePair
    ? 0
    : candidate.mechanism === "direct"
      ? 10
      : 5;
  const shiftPair: RationaleFactor = {
    id: "shiftPair",
    points: shiftPairPoints,
    max: PLACEMENT_WEIGHTS.shiftPair,
    label: !hasCasePair
      ? "No case pair — this character has no upper/lower-case partner"
      : shiftPairPoints === 10
        ? "Upper and lower case stay on one key"
        : "Case pair is built for you",
    ...(hasCasePair ? {} : { notApplicable: true as const }),
  };

  const factors = [corpus, phonetic, visual, spare, occupied, shiftPair];
  const total = factors.reduce((sum, f) => sum + f.points, 0);

  // --- demotion plan (gate G3, direction by orthography tier) ---------------
  // PINNED RULE (Matthew, 2026-10-19 — the corpusLead:3 precedent: pinned,
  // explained, changeable only by a data/spec amendment): the primary /
  // demotion ranking is decided by ORTHOGRAPHY TIER precisely because no
  // frequency data is available in the studio. A convenience character
  // loses to core orthography; two core characters are never ranked
  // against each other by this module — frequency data, which we don't
  // have, is what would be needed to rank Ñ against N.
  const incomingTier = orthographyTier(char, ctx);
  const incumbentTier =
    incumbent !== null ? tierForNeedKind(incumbent.need) : null;
  let demotion: DemotionPlan | null = null;
  if (incumbent !== null) {
    const raltSlotKey = slotKeyFor(candidate.vkey, ["RALT"]);
    const raltFree =
      !isDeadkeyMech && raltSlotKey !== slotKey && !ctx.occupancy.has(raltSlotKey);
    const target: DemotionPlan["target"] =
      incumbentTier === "core" && incomingTier === "core"
        ? "none"
        : incumbentTier === "core"
          ? "incoming"
          : "incumbent";
    demotion = raltFree
      ? {
          method: "ralt",
          vkey: candidate.vkey,
          description: `AltGr + the ${keyLabel} key`,
          target,
        }
      : {
          method: "deadkey",
          vkey: candidate.vkey,
          description: "a deadkey",
          target,
        };
  }

  return {
    total,
    factors,
    gated,
    incumbent,
    demotion,
    corpusLeftover,
    incomingTier,
    incumbentTier,
    vkey: candidate.vkey,
    modifiers: [...candidate.modifiers],
    mechanism: candidate.mechanism,
    priorSource: candidate.priorSource,
    priorCount: candidate.priorCount,
  };
}

// ---------------------------------------------------------------------------
// Rationale line — deterministic template over the factor breakdown.
//
// Rules (Cycle 1 domain strategy §3): at most two reasons + the cost when
// one exists; the corpus count is the only number; plain words (AltGr, not
// RAlt); the demotion is named in the same line whenever a displacement
// occurs — no line ends on a benefit when something had to move; a weak
// total is confessed, never bluffed.
// ---------------------------------------------------------------------------

function reasonPhrase(factor: RationaleFactor, scored: ScoredCandidate): string | null {
  const keyLabel = rationaleKeyLabel(scored.vkey);
  switch (factor.id) {
    case "corpus":
      // Leftover corpus evidence (the Ñ/ẞ rule) is never cited as a reason.
      return factor.points > 0 && !scored.corpusLeftover
        ? `${scored.priorCount} keyboards do this`
        : null;
    case "phonetic":
      return factor.points > 0 ? `it sounds like the ${keyLabel} key` : null;
    case "visual":
      if (factor.points === 0) return null;
      return scored.priorSource === "unicode-decomp"
        ? `it is built from the ${keyLabel} key plus a mark`
        : `it looks like '${scored.incumbent?.char ?? keyLabel}'`;
    case "spare":
      return factor.points >= 9
        ? factor.points === 15
          ? "that spot was empty"
          : "that layer was empty"
        : null;
    case "shiftPair":
      return factor.points === 10 ? "its upper and lower case stay together" : null;
    case "occupied":
      return null;
  }
}

export function buildRationaleLine(scored: ScoredCandidate, char: string): string {
  const where =
    scored.mechanism === "deadkey" || scored.mechanism === "store-index"
      ? "a deadkey"
      : slotDescription(scored.vkey, scored.modifiers);

  const reasons = scored.factors
    .filter((f) => f.id !== "occupied")
    .map((f) => ({ factor: f, phrase: reasonPhrase(f, scored) }))
    .filter((r): r is { factor: RationaleFactor; phrase: string } => r.phrase !== null)
    .sort((a, b) => b.factor.points - a.factor.points)
    .slice(0, 2)
    .map((r) => r.phrase);

  const weak = scored.total < WEAK_MATCH_THRESHOLD;
  const weakSuffix = weak ? " This is a weak match — the best available, not a strong one." : "";

  if (scored.incumbent === null) {
    const reasonText =
      reasons.length > 0
        ? ` — mainly because ${reasons.join("; also ")}`
        : " — the best available match";
    return `${char} goes on ${where}${reasonText}. Nothing you use had to move.${weakSuffix}`;
  }

  const inc = scored.incumbent.char;
  const cost =
    scored.incumbent.need === "needed-frequent"
      ? `but you still use '${inc}' in words`
      : scored.incumbent.need === "needed-rare"
        ? `but '${inc}' sits there now and you do use it, just rarely`
        : `but '${inc}' sits there now`;
  const demotionPhrase =
    scored.demotion?.method === "deadkey"
      ? `so '${inc}' moves behind a deadkey and will take an extra keystroke each time`
      : `so '${inc}' moves to AltGr + the ${rationaleKeyLabel(scored.vkey)} key and will take one extra key each time`;
  if (scored.demotion?.target === "incoming") {
    // Convenience incoming vs core incumbent: the INCOMING character is
    // the one that loses the primary slot (orthography-tier rule).
    const home =
      scored.demotion.method === "deadkey"
        ? "behind a deadkey"
        : `to AltGr + the ${rationaleKeyLabel(scored.vkey)} key`;
    return `${char} goes on ${where} — but '${inc}' is part of your alphabet and ${char} is a convenience character, so ${char} moves ${home} instead and '${inc}' keeps this key.${weakSuffix}`;
  }
  if (scored.demotion?.target === "none") {
    // Both core: no demotion victim is picked — ranking them would need
    // frequency data the studio does not have (pinned honesty rule).
    return `${char} goes on ${where} — but '${inc}' is part of your alphabet too. Without frequency data, neither can be ranked above the other, so find ${char} a different key — nothing is demoted unless you choose it.${weakSuffix}`;
  }
  if (scored.gated === "G2") {
    // A gated trade-off leads with its cost and demotion, never with a
    // benefit (the ẞ-on-' shape: the draw, if any, is stated after).
    const draw =
      reasons.length > 0 ? ` The draw is ${reasons.join(" and ")}.` : "";
    return `${char} goes on ${where} — ${cost}, ${demotionPhrase}.${draw}${weakSuffix}`;
  }
  const reasonText =
    reasons.length > 0 ? ` because ${reasons.join(" and ")}` : "";
  return `${char} goes on ${where}${reasonText} — ${cost}, ${demotionPhrase}.${weakSuffix}`;
}

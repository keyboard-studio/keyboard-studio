// slotOccupancy — per-key occupancy ledger for placement rationale (#2300).
//
// Answers the question the placement cascade never could: "for THIS slot
// (vkey + modifiers), which glyph sits there right now, and is that glyph
// still needed?" The ledger is built from the working IR's rules (the base
// keyboard as carved so far) overlaid with this session's MechanismAssignments
// (which live in phaseResults, NOT in the working IR — see MechanismGallery's
// sessionAssignments seam note). It is the honest input for the spare-hole
// and occupied-cost factors in placementRationale.ts, and for the gallery's
// displacement (demotion) proposal: an assignment that lands on an occupied
// slot shadows the incumbent (Keyman first-match-wins), so the incumbent
// must be named and re-homed, never silently lost.
//
// Slot identity reuses the contracts `collisions()` serialization
// (`vkey|sorted-modifiers`, packages/contracts/src/placementMap.ts) so a
// slot named here is the same slot the seeder's collision check names.
//
// CONSERVATIVE BY DESIGN — what this ledger does NOT claim:
//   - A rule whose output expands to zero or to MORE THAN ONE distinct
//     glyph (multi-char literal runs, store fan-outs via index()/outs())
//     is skipped: there is no single "the displaced glyph" to name, and
//     inventing one would let a demotion proposal re-home the wrong char.
//     A store/index output that expands to exactly one glyph IS recorded.
//   - Rules without exactly one {kind:"vkey"} context element (deadkey
//     compositions, any()/store contexts, multi-key contexts) are skipped:
//     they are not keyed to a single physical slot.
//   - Deadkey-only trigger rules (output is a lone deadkey token) produce
//     no glyph and are skipped, as are backspace-correction rules (the
//     same `contextHasDirectBackspace` predicate buildProducedSet uses).
//   - Opaque fragments (ir.raw without a typed rule) are invisible here.
//     Occupancy is KNOWN occupancy; copy built on it must not claim
//     exhaustiveness.
//   - Session S-02 (deadkey) and S-03 (sequence) mechanisms are not slot
//     occupants: a deadkey composes on top of a base keystroke without
//     shadowing the base slot's own output, and a sequence is not a single
//     slot. Only S-01 (kmnRules) and S-08 (altgrKeyList) overlay.
//   - CAPS pairs need no special case in the walk itself: a CAPS-handling
//     key's NCAPS and CAPS rules carry DIFFERENT modifier sets, so they
//     key to different slots and each records its own glyph. An S-01
//     session assignment whose kmnRules carries several lines (a CAPS
//     quad) is overlaid line-by-line for the same reason.
//
// All glyphs are NFC-normalized on the way in, matching the inventory's
// normalization convention.

import type {
  KeyboardIR,
  MechanismAssignment,
} from "@keyboard-studio/contracts";
import {
  collectFromElements,
  contextHasDirectBackspace,
} from "@keyboard-studio/contracts";
import { parseKeySpec } from "@keyboard-studio/engine";
import { isAlwaysKeepCategory } from "../lib/irToCarveNodes.ts";

// ---------------------------------------------------------------------------
// Slot identity
// ---------------------------------------------------------------------------

/**
 * Serialize a slot exactly like contracts `collisions()` does:
 * `` `${vkey}|${[...modifiers].sort().join(",")}` ``. Modifier order in the
 * input is insignificant.
 */
export function slotKeyFor(
  vkey: string,
  modifiers: readonly string[],
): string {
  return `${vkey}|${[...modifiers].sort().join(",")}`;
}

// ---------------------------------------------------------------------------
// Occupancy ledger
// ---------------------------------------------------------------------------

export type SlotSource = "base" | "session";

export interface SlotOccupant {
  /** The glyph (one NFC grapheme) this slot currently types. */
  char: string;
  /** Whether the occupant comes from the working IR or a session assignment. */
  source: SlotSource;
}

/** True when a rule's whole output is a lone deadkey token (an S-02 trigger). */
function isDeadkeyOnlyOutput(output: readonly { kind: string }[]): boolean {
  return (
    output.length === 1 &&
    (output[0]?.kind === "deadkey" || output[0]?.kind === "namedDeadkey")
  );
}

/**
 * Build the slot → incumbent ledger: working-IR rules first (Keyman
 * first-match-wins — the first rule keyed to a slot owns it), then the
 * session's physical assignments overlaid on top (a session assignment
 * shadows whatever the base had on that slot, which is precisely the
 * displacement the gallery must surface).
 *
 * @param ir           The working IR (carve state), or null before the
 *                     working copy exists — the session overlay still runs.
 * @param assignments  This session's physical MechanismAssignments.
 */
export function buildSlotOccupancy(
  ir: KeyboardIR | null,
  assignments: readonly MechanismAssignment[],
): Map<string, SlotOccupant> {
  const occupancy = new Map<string, SlotOccupant>();

  if (ir !== null) {
    const storeMap = new Map(ir.stores.map((s) => [s.name, s]));
    for (const group of ir.groups) {
      for (const rule of group.rules) {
        if (isDeadkeyOnlyOutput(rule.output)) continue;
        if (contextHasDirectBackspace(rule.context)) continue;
        // Exactly ONE context element, and it must be the vkey (Cycle 4
        // P1-1): a context that pairs the vkey with anything else — a
        // deadkey (deadkey-composition `[deadkey, K_E] → é`), an any() /
        // store element, a context() element — is not keyed to the plain
        // slot: a plain assignment on that slot does not shadow it, so
        // naming its output as the slot's incumbent would invent a
        // phantom displacement.
        if (rule.context.length !== 1) continue;
        const vkeyEl = rule.context[0];
        if (vkeyEl === undefined || vkeyEl.kind !== "vkey") continue;
        const glyphs = new Set<string>();
        collectFromElements(rule.output, storeMap, glyphs, false);
        // Conservative: only a single-glyph output names an incumbent.
        if (glyphs.size !== 1) continue;
        const [glyph] = glyphs;
        if (glyph === undefined) continue;
        const key = slotKeyFor(vkeyEl.name, vkeyEl.modifiers);
        // First rule wins (Keyman's own first-match semantics).
        if (!occupancy.has(key)) {
          occupancy.set(key, { char: glyph.normalize("NFC"), source: "base" });
        }
      }
    }
  }

  // Session overlay — later assignments shadow earlier ones on the same
  // slot, so plain `set` in recorded order is the correct precedence.
  for (const assignment of assignments) {
    if (assignment.modality !== "physical") continue;
    for (const mech of assignment.mechanisms) {
      for (const entry of mechanismSlotEntries(mech)) {
        occupancy.set(entry.key, { char: entry.char, source: "session" });
      }
      // S-02 / S-03: not slot occupants (see module doc).
    }
  }

  return occupancy;
}

// ---------------------------------------------------------------------------
// Recorded-assignment slot parsing — ONE source of truth for "which slot
// did this mechanism actually write?"
//
// The overlay above and the gallery's displacement check (Cycle 4 P1-2)
// both parse the RECORDED assignment through these helpers. Deriving a
// written slot from anything else — the suggestion candidate's raw
// modifiers, the author's chosen combo tokens — can name a different
// slot than the one the recorded rule took (a case-pair-inherited S-01
// candidate carries ["SHIFT"], while the S-01 accept writes a bare
// `[vkey]` rule). Parse failure yields NO entries: an unkeyable
// mechanism claims no slot, rather than a guessed one.
// ---------------------------------------------------------------------------

/** One slot a recorded mechanism writes, with the glyph it writes there. */
export interface MechanismSlotEntry {
  /** Slot identity, per {@link slotKeyFor}. */
  key: string;
  vkey: string;
  modifiers: string[];
  /** The glyph the mechanism writes on this slot (NFC). */
  char: string;
}

type MechanismLike = MechanismAssignment["mechanisms"][number];

/** `parseKeySpec`, with a mutually-exclusive modifier pair read as no key. */
function safeParseKeySpec(spec: string): ReturnType<typeof parseKeySpec> {
  try {
    return parseKeySpec(spec);
  } catch {
    return null;
  }
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * The glyph an S-01 line writes: every `U+XXXX` on its right-hand side,
 * NFC-normalised, accepted only when that is ONE grapheme. An NFD output
 * (`> U+0061 U+030C`) therefore names `ǎ`, not its bare base letter.
 */
function s01OutputGlyph(line: string): string | null {
  const rhs = line.slice(line.indexOf(">") + 1);
  const cps = [...rhs.matchAll(/U\+([0-9A-Fa-f]{4,6})/g)].map((m) =>
    parseInt(m[1] ?? "", 16),
  );
  if (cps.length === 0 || cps.some((cp) => Number.isNaN(cp))) return null;
  const glyph = String.fromCodePoint(...cps).normalize("NFC");
  return [...graphemes.segment(glyph)].length === 1 ? glyph : null;
}

function isSwapMechanism(mech: MechanismLike): boolean {
  return mech.patternId === "simple_swap" || mech.strategyId === "S-01";
}

function isRaltMechanism(mech: MechanismLike): boolean {
  return (
    mech.patternId === "modifier_as_layer_switch" || mech.strategyId === "S-08"
  );
}

function isDeadkeyMechanism(mech: MechanismLike): boolean {
  return mech.strategyId === "S-02" || mech.patternId.startsWith("deadkey_single_tap");
}

/** postfix_compose is S-03 like a plain sequence, so it is told by pattern id. */
function isPostfixMechanism(mech: MechanismLike): boolean {
  return mech.patternId === "postfix_compose";
}

/**
 * The slots ONE recorded mechanism writes, parsed from its slotValues.
 * S-01: each kmnRules line is `+ [MODS K_X] > U+XXXX` (an NFD output carries
 * several `U+XXXX`; their NFC form must be one grapheme)
 * (buildStartRuleLines / buildShiftRuleLines / buildCasePairRuleLines all
 * emit this shape, one line per plane — which is what makes a CAPS quad
 * land on its four distinct slots). If ANY line cannot be keyed exactly,
 * the whole mechanism yields nothing rather than a partial answer.
 * S-08: the altgrKeyList spec, when its output is a single glyph.
 * Every other mechanism (S-02 / S-03 / opaque) writes no single slot.
 */
export function mechanismSlotEntries(
  mech: MechanismLike,
): MechanismSlotEntry[] {
  if (isSwapMechanism(mech)) {
    const kmnRules = mech.slotValues?.["kmnRules"];
    if (kmnRules === undefined || kmnRules === "") return [];
    const lines = kmnRules
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) return [];
    const entries: MechanismSlotEntry[] = [];
    for (const line of lines) {
      const parsed = safeParseKeySpec(line);
      if (parsed === null) return [];
      const char = s01OutputGlyph(line);
      if (char === null) return [];
      entries.push({
        key: slotKeyFor(parsed.vkey, parsed.tokens),
        vkey: parsed.vkey,
        modifiers: [...parsed.tokens],
        char,
      });
    }
    return entries;
  }
  if (isRaltMechanism(mech)) {
    const altgrKeyList = mech.slotValues?.["altgrKeyList"];
    const altgrOutputList = mech.slotValues?.["altgrOutputList"];
    if (altgrKeyList === undefined || altgrOutputList === undefined) return [];
    const parsed = safeParseKeySpec(altgrKeyList);
    if (parsed === null) return [];
    const out = altgrOutputList.normalize("NFC");
    // Only a single-glyph output names an incumbent (module doc).
    if ([...out].length !== 1) return [];
    return [
      {
        key: slotKeyFor(parsed.vkey, parsed.tokens),
        vkey: parsed.vkey,
        modifiers: [...parsed.tokens],
        char: out,
      },
    ];
  }
  return [];
}

/**
 * Every slot a RECORDED assignment writes, across its mechanisms — the
 * displacement check's input (Cycle 4 P1-2). Derived exclusively from
 * the recorded slotValues via {@link mechanismSlotEntries}, never from
 * the candidate or picker state that produced the assignment.
 */
export function assignmentSlotKeys(
  assignment: MechanismAssignment,
): MechanismSlotEntry[] {
  if (assignment.modality !== "physical") return [];
  return assignment.mechanisms.flatMap((mech) => mechanismSlotEntries(mech));
}

// ---------------------------------------------------------------------------
// Claimed slots — "which bare keystrokes does this mechanism answer FIRST?"
//
// Unlike mechanismSlotEntries this is glyph-agnostic: it feeds the carve
// projection's claimed-inputs filter (lib/claimedInputs.ts), which drops the
// starting rules an assignment shadows, not the displacement ledger. A
// deadkey trigger types no glyph, yet its `+ [trigger] > dk(..)` line still
// shadows the starting rule on that key. Each slot is claimed only while the
// emitted fragment really carries a bare rule on it (applyAssignments.ts
// applyDeadkeyEscapes / applyPostfixEscapes read the same `escapes` tokens).
// ---------------------------------------------------------------------------

/** One bare keystroke (vkey + exact modifiers) a mechanism answers first. */
export interface ClaimedSlot {
  vkey: string;
  modifiers: string[];
}

function escapeTokens(mech: MechanismLike): Set<string> {
  return new Set(
    (mech.slotValues?.["escapes"] ?? "").split(/\s+/).filter((t) => t.length > 0),
  );
}

function claimFor(spec: string): ClaimedSlot[] {
  const parsed = safeParseKeySpec(spec);
  return parsed === null ? [] : [{ vkey: parsed.vkey, modifiers: [...parsed.tokens] }];
}

/**
 * The bare keystrokes ONE recorded mechanism claims:
 *   - S-01: the key of every kmnRules line, whatever its output;
 *   - S-08: every keystroke in altgrKeyList;
 *   - S-02: the trigger, plus `RALT trigger` when `escapes` has `altgr`;
 *   - postfix_compose: the mark key, only when `escapes` has `bare` (without
 *     it the compose rule needs a preceding base, so the starting rule on
 *     the key stays reachable and is the key's only output after a non-base).
 * A spec that does not parse claims nothing.
 */
export function mechanismClaimedSlots(mech: MechanismLike): ClaimedSlot[] {
  const slots = mech.slotValues ?? {};
  if (isSwapMechanism(mech)) {
    return (slots["kmnRules"] ?? "")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .flatMap(claimFor);
  }
  if (isRaltMechanism(mech)) {
    return [...(slots["altgrKeyList"] ?? "").matchAll(/\[[^\]]+\]/g)].flatMap((m) =>
      claimFor(m[0]),
    );
  }
  if (isDeadkeyMechanism(mech)) {
    const trigger = (slots["triggerKey"] ?? "").trim();
    if (trigger === "") return [];
    return [
      ...claimFor(`[${trigger}]`),
      ...(escapeTokens(mech).has("altgr") ? claimFor(`[RALT ${trigger}]`) : []),
    ];
  }
  if (isPostfixMechanism(mech)) {
    const markKey = (slots["markKey"] ?? "").trim();
    if (markKey === "" || !escapeTokens(mech).has("bare")) return [];
    return claimFor(`[${markKey}]`);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Need classification
// ---------------------------------------------------------------------------

/**
 * "Still needed" inputs for {@link classifySlot}. Both sets are expected
 * NFC-normalized (the studio's inventory and produced sets already are).
 *
 * - `confirmedInventory` — the author's confirmed inventory. An incumbent
 *   in it is needed-and-frequent.
 * - `baseProducedSet` — glyphs the base keyboard produces (session-aware
 *   produced set in the gallery). An incumbent produced here but NOT in
 *   the confirmed inventory is needed-rare: the spec-075 punctuation case
 *   (apostrophe / hyphen are retained by carve and used in loanwords, URLs
 *   and code-switching even when they never enter the alphabet inventory).
 */
export interface NeedSets {
  confirmedInventory: ReadonlySet<string>;
  baseProducedSet: ReadonlySet<string>;
}

export type SlotNeedKind =
  | "spare"
  | "not-needed"
  | "needed-rare"
  | "needed-frequent";

export interface SlotClassification {
  kind: SlotNeedKind;
  /** The incumbent glyph on the slot, or null when the slot is a hole. */
  incumbent: SlotOccupant | null;
}

/**
 * Classify one slot against the need sets:
 *   - no incumbent                                   → "spare"
 *   - incumbent ∈ confirmedInventory                 → "needed-frequent"
 *   - incumbent ∈ baseProducedSet (not in inventory) → "needed-rare"
 *   - incumbent in neither                           → "not-needed"
 */
export function classifySlot(
  occupancy: ReadonlyMap<string, SlotOccupant>,
  slotKey: string,
  needSets: NeedSets,
): SlotClassification {
  const incumbent = occupancy.get(slotKey) ?? null;
  if (incumbent === null) return { kind: "spare", incumbent: null };
  const ch = incumbent.char.normalize("NFC");
  if (needSets.confirmedInventory.has(ch)) {
    return { kind: "needed-frequent", incumbent };
  }
  if (needSets.baseProducedSet.has(ch)) {
    return { kind: "needed-rare", incumbent };
  }
  return { kind: "not-needed", incumbent };
}

/**
 * Orthography tier of a character (Matthew's ruling, 2026-10-19 —
 * steer 2 on #2300): WHO GETS DEMOTED is decided by orthography tier
 * precisely BECAUSE the studio has no frequency data — "Strictly
 * speaking, we would need frequency data to determine whether Ñ
 * replaces N as primary (and which gets demoted), but we won't have
 * that data. A convenience character would lose to core-orthography."
 * Never pretend a frequency ranking happened.
 *
 *   - "core"        — a letter or mark in the author's confirmed
 *                     inventory: part of the target orthography the
 *                     author declared.
 *   - "convenience" — base-produced and retained (spec-075 punctuation
 *                     defaults, loanword / URL / name coverage) but NOT
 *                     in the confirmed inventory, AND every digit,
 *                     punctuation mark or symbol (the carve always-keep
 *                     categories) even when it is in the inventory.
 *   - "none"        — produced nowhere / in no need set.
 *
 * Punctuation is never core (owner ruling 2026-10-29, spec 106 FR-043):
 * the punctuation step puts `'` in the inventory, and `’` taking its key
 * was then a both-core standoff whose default demoted nothing, leaving
 * `'` shadowed with no key. As convenience, an overwritten `'` gets the
 * ordinary "move it to AltGr" proposal. A script that writes a letter
 * with `'` should record that letter as ʼ (U+02BC), which stays core.
 */
export type OrthographyTier = "core" | "convenience" | "none";

export function orthographyTier(
  char: string,
  needSets: NeedSets,
): OrthographyTier {
  const ch = char.normalize("NFC");
  if (needSets.confirmedInventory.has(ch)) {
    return isAlwaysKeepCategory(ch) ? "convenience" : "core";
  }
  if (needSets.baseProducedSet.has(ch)) return "convenience";
  return "none";
}

/** True when `char` is still needed at either frequency tier. */
export function isStillNeeded(char: string, needSets: NeedSets): boolean {
  const ch = char.normalize("NFC");
  return needSets.confirmedInventory.has(ch) || needSets.baseProducedSet.has(ch);
}

/**
 * The glyph an assignment to (vkey, modifiers) would displace, or null when
 * the slot is free or already types `selfChar` itself.
 */
export function displacedFor(
  occupancy: ReadonlyMap<string, SlotOccupant>,
  vkey: string,
  modifiers: readonly string[],
  selfChar: string,
): SlotOccupant | null {
  const occupant = occupancy.get(slotKeyFor(vkey, modifiers)) ?? null;
  if (occupant === null) return null;
  if (occupant.char.normalize("NFC") === selfChar.normalize("NFC")) return null;
  return occupant;
}

/**
 * True when `char` is still produced on some slot OTHER than `exceptSlotKey`
 * — the gallery's "not otherwise produced after this assignment" check for
 * raising a demotion proposal (a glyph reachable elsewhere is not lost,
 * so no proposal is raised for it).
 */
export function isProducedOnOtherSlot(
  occupancy: ReadonlyMap<string, SlotOccupant>,
  char: string,
  exceptSlotKey: string,
): boolean {
  const target = char.normalize("NFC");
  for (const [key, occupant] of occupancy) {
    if (key === exceptSlotKey) continue;
    if (occupant.char.normalize("NFC") === target) return true;
  }
  return false;
}

/** Who a displacement proposal demotes (see useDisplacementProposal). */
export type DisplacementDirection =
  | "demote-incumbent"
  | "demote-incoming"
  | "both-core";

/**
 * What an author can do about a pending displacement proposal:
 *   - "confirm-move"      — record the proposed demotion (the banner's "Move it")
 *   - "keep-both"         — both are core: keep both primary, a recorded dismissal
 *   - "demote-displaced"  — both-core only: demote the displaced glyph anyway
 *   - "leave"             — a recorded dismissal; the glyph stays shadowed
 */
export type DisplacementAction =
  | "confirm-move"
  | "keep-both"
  | "demote-displaced"
  | "leave";

/**
 * The available actions for a proposal, in banner order: the first is the
 * default (confirm) button, the second the other button. Both-core is
 * inverted from the rest: the default keeps both primaries, and demoting is
 * the explicit override.
 */
export function displacementActions(
  direction: DisplacementDirection,
): readonly [DisplacementAction, DisplacementAction] {
  return direction === "both-core"
    ? ["keep-both", "demote-displaced"]
    : ["confirm-move", "leave"];
}

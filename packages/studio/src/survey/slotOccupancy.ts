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
  /** The glyph (single NFC codepoint string) this slot currently types. */
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
        const vkeys = rule.context.filter((el) => el.kind === "vkey");
        if (vkeys.length !== 1) continue;
        const vkeyEl = vkeys[0];
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
      if (mech.patternId === "simple_swap" || mech.strategyId === "S-01") {
        overlaySwapMechanism(occupancy, mech.slotValues?.["kmnRules"]);
      } else if (
        mech.patternId === "modifier_as_layer_switch" ||
        mech.strategyId === "S-08"
      ) {
        overlayRaltMechanism(
          occupancy,
          mech.slotValues?.["altgrKeyList"],
          mech.slotValues?.["altgrOutputList"],
        );
      }
      // S-02 / S-03: not slot occupants (see module doc).
    }
  }

  return occupancy;
}

/**
 * Overlay one S-01 mechanism from its recorded kmnRules text. Each line is
 * `+ [MODS K_X] > U+XXXX` (buildStartRuleLines / buildShiftRuleLines /
 * buildCasePairRuleLines all emit this shape, one line per plane — which
 * is what makes a CAPS quad land on its four distinct slots). If ANY line
 * cannot be keyed exactly, the whole mechanism is skipped rather than
 * partially overlaid.
 */
function overlaySwapMechanism(
  occupancy: Map<string, SlotOccupant>,
  kmnRules: string | undefined,
): void {
  if (kmnRules === undefined || kmnRules === "") return;
  const lines = kmnRules
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return;
  const parsedLines: { key: string; char: string }[] = [];
  for (const line of lines) {
    const parsed = parseKeySpec(line);
    if (parsed === null) return;
    const outMatch = />\s*U\+([0-9A-Fa-f]{4,6})/.exec(line);
    if (outMatch === null || outMatch[1] === undefined) return;
    const cp = parseInt(outMatch[1], 16);
    if (Number.isNaN(cp)) return;
    parsedLines.push({
      key: slotKeyFor(parsed.vkey, parsed.tokens),
      char: String.fromCodePoint(cp).normalize("NFC"),
    });
  }
  for (const { key, char } of parsedLines) {
    occupancy.set(key, { char, source: "session" });
  }
}

/** Overlay one S-08 mechanism from its altgrKeyList / altgrOutputList slots. */
function overlayRaltMechanism(
  occupancy: Map<string, SlotOccupant>,
  altgrKeyList: string | undefined,
  altgrOutputList: string | undefined,
): void {
  if (altgrKeyList === undefined || altgrOutputList === undefined) return;
  const parsed = parseKeySpec(altgrKeyList);
  if (parsed === null) return;
  const out = altgrOutputList.normalize("NFC");
  // Only a single-glyph output names an incumbent (module doc).
  if ([...out].length !== 1) return;
  occupancy.set(slotKeyFor(parsed.vkey, parsed.tokens), {
    char: out,
    source: "session",
  });
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
 *   - "core"        — in the author's confirmed inventory: part of the
 *                     target orthography the author declared
 *                     (= the needed-frequent need class).
 *   - "convenience" — base-produced and retained (spec-075 punctuation
 *                     defaults, loanword / URL / name coverage) but NOT
 *                     in the confirmed inventory (= needed-rare).
 *   - "none"        — produced nowhere / in no need set.
 *
 * This maps the existing need classes onto tiers rather than building a
 * parallel classification: needed-frequent IS core, needed-rare IS
 * convenience.
 */
export type OrthographyTier = "core" | "convenience" | "none";

export function orthographyTier(
  char: string,
  needSets: NeedSets,
): OrthographyTier {
  const ch = char.normalize("NFC");
  if (needSets.confirmedInventory.has(ch)) return "core";
  if (needSets.baseProducedSet.has(ch)) return "convenience";
  return "none";
}

/** The tier a slot classification's incumbent sits at. */
export function tierForNeedKind(kind: SlotNeedKind): OrthographyTier {
  if (kind === "needed-frequent") return "core";
  if (kind === "needed-rare") return "convenience";
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

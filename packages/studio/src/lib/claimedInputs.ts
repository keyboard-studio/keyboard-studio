// claimedInputs — the starting rules this session's assignments shadow
// (spec 106 US4, FR-040 / FR-041).
//
// The projection runs carve (step 1) before assignments (step 2), and the
// assignments are merged AHEAD of the starting rules in group(main)
// (applyAssignments, first-match-wins). A starting rule keyed to a keystroke
// an assignment also answers therefore never fires: kmcmplib reports it as
// an unreachable rule. This module names those rules so step 1 can drop them.
//
// Computed fresh on every projection from the recorded assignments, never
// stored: removing the assignment brings the starting rule back on the next
// projection, so undo needs no bookkeeping.
//
// CONSERVATIVE BY DESIGN — a wrong drop loses a character, a wrong keep
// costs one compiler hint:
//   - Only top-level rules of the group named exactly `main` are
//     candidates. That is the only group the assignment fragments merge
//     into; a rule on the same key in another group reached by use() or
//     match is still reachable. No `main` group → nothing is claimed.
//   - The rule's whole context must be ONE vkey element (no preceding
//     context, deadkey, any(), if() or context()).
//   - Every modifier on the starting rule must be a known modifier word;
//     an unknown one claims nothing rather than comparing a truncated set.
//   - Modifiers match exactly after canonicalisation, chirality included.
//     The one widening is caps state: Keyman ignores Caps Lock on a rule
//     that names neither CAPS nor NCAPS, so a claim on `[K_A]` also shadows
//     `[NCAPS K_A]` and `[CAPS K_A]`.
//   - The rule's output does not matter: a shadowed starting deadkey
//     trigger is dropped too (its dk() compositions are kept, FR-041).
//   - A mechanism claims only when step 2 will actually merge it, by the
//     same gates applyAssignments uses (pattern resolves, fragment is
//     non-empty, every required slot has a value). One it would skip with a
//     warning must not take the starting rule down with it.

import type { IRChange, IRRule, KeyboardIR, MechanismAssignment, OwnerRef, Pattern } from "@keyboard-studio/contracts";
import { elementAtOffset, ruleContextElements } from "@keyboard-studio/contracts";
import { parseKeySpec } from "@keyboard-studio/engine";
import { mechanismClaimedSlots } from "../survey/slotOccupancy.ts";

const KNOWN_MODIFIERS = new Set([
  "SHIFT", "CAPS", "NCAPS", "ALT", "RALT", "LALT", "CTRL", "RCTRL", "LCTRL",
]);
const CAPS_STATE = new Set(["CAPS", "NCAPS"]);

interface Keystroke {
  vkey: string;
  /** Canonical non-caps modifiers, joined. */
  plane: string;
  /** "CAPS" | "NCAPS" | "" (caps state not tested). */
  caps: string;
}

function keystrokeOf(vkey: string, modifiers: readonly string[]): Keystroke | null {
  const upper = modifiers.map((m) => m.toUpperCase());
  if (upper.some((m) => !KNOWN_MODIFIERS.has(m))) return null;
  let parsed: ReturnType<typeof parseKeySpec>;
  try {
    parsed = parseKeySpec(`[${[...upper, vkey].join(" ")}]`);
  } catch {
    return null;
  }
  if (parsed === null) return null;
  return {
    vkey: parsed.vkey.toUpperCase(),
    plane: parsed.tokens.filter((t) => !CAPS_STATE.has(t)).sort().join(" "),
    caps: parsed.tokens.find((t) => CAPS_STATE.has(t)) ?? "",
  };
}

type MechanismLike = MechanismAssignment["mechanisms"][number];

/** True when applyAssignments will emit this mechanism's fragment. */
function willMerge(
  mech: MechanismLike,
  getPattern: (id: string) => Pattern | undefined,
): boolean {
  const pattern = getPattern(mech.patternId);
  if (pattern === undefined || pattern.kmnFragment.trim() === "") return false;
  const slots = mech.slotValues ?? {};
  return pattern.questions.every(
    (q) =>
      q.required === false ||
      !pattern.kmnFragment.includes(`{{${q.id}}}`) ||
      slots[q.id] !== undefined,
  );
}

function covers(claim: Keystroke, rule: Keystroke): boolean {
  return (
    claim.vkey === rule.vkey &&
    claim.plane === rule.plane &&
    (claim.caps === "" || claim.caps === rule.caps)
  );
}

/**
 * The nodeIds of the starting rules in `startIr` that this session's
 * physical assignments shadow. See the module doc for what is (and is
 * deliberately not) claimed. `getPattern` is the projection's resolver.
 */
export function claimedInputRuleIds(
  startIr: KeyboardIR,
  assignments: ReadonlyArray<MechanismAssignment>,
  getPattern: (id: string) => Pattern | undefined,
): Set<string> {
  const ids = new Set<string>();
  const main = startIr.groups.find((g) => g.name === "main");
  if (main === undefined) return ids;

  const claims: Keystroke[] = [];
  for (const assignment of assignments) {
    if (assignment.modality !== "physical") continue;
    for (const mech of assignment.mechanisms) {
      if (!willMerge(mech, getPattern)) continue;
      for (const slot of mechanismClaimedSlots(mech)) {
        const k = keystrokeOf(slot.vkey, slot.modifiers);
        if (k !== null) claims.push(k);
      }
    }
  }
  if (claims.length === 0) return ids;

  for (const rule of main.rules) {
    // Exactly one context element, and it must be the vkey.
    if (elementAtOffset(rule, main, 2) !== undefined) continue;
    const el = elementAtOffset(rule, main, 1);
    if (el === undefined || el.kind !== "vkey") continue;
    const k = keystrokeOf(el.name, el.modifiers);
    if (k === null) continue;
    if (claims.some((c) => covers(c, k))) ids.add(rule.nodeId);
  }
  return ids;
}

/** A key an assignment claims: the vkey and exact modifier words of a shadowed starting rule. */
export interface AssignedKey {
  readonly vkey: string;
  readonly modifiers: readonly string[];
}

/** The keystrokes of the starting rules the assignments shadow (the keys the Assign tab owns). */
export function claimedKeystrokes(
  startIr: KeyboardIR,
  assignments: ReadonlyArray<MechanismAssignment>,
  getPattern: (id: string) => Pattern | undefined,
): AssignedKey[] {
  const ids = claimedInputRuleIds(startIr, assignments, getPattern);
  const main = startIr.groups.find((g) => g.name === "main");
  const keys: AssignedKey[] = [];
  if (main === undefined) return keys;
  for (const rule of main.rules) {
    const el = elementAtOffset(rule, main, 1);
    if (ids.has(rule.nodeId) && el !== undefined && el.kind === "vkey") {
      keys.push({ vkey: el.name, modifiers: el.modifiers });
    }
  }
  return keys;
}

function sameKey(rule: IRRule, key: AssignedKey): boolean {
  // No group in scope here (the rule comes from a change record), so the
  // loose whole-LHS reader is the right accessor (spec 116 FR-037).
  const els = ruleContextElements(rule);
  const el = els.length === 1 ? els[0] : undefined;
  if (el === undefined || el.kind !== "vkey" || el.name.toUpperCase() !== key.vkey.toUpperCase()) return false;
  const have = new Set(el.modifiers.map((m) => m.toUpperCase()));
  return have.size === key.modifiers.length && key.modifiers.every((m) => have.has(m.toUpperCase()));
}

/**
 * Ruling 10: a `replace` or `remove` of a single-key rule in `main` whose key an Assign-tab
 * assignment claims gets a keystroke anchor, so it still finds its rule in the projected keyboard
 * (where the assignment has rewritten the text), and an `assign-tab` override, so the confirm names
 * the Assign tab and the review flags it. Other changes pass through unchanged.
 */
export function anchorAssignedKeys(
  changes: readonly IRChange[],
  keys: readonly AssignedKey[],
): { changes: IRChange[]; overrides: OwnerRef[] } {
  const overrides: OwnerRef[] = [];
  const out = changes.map((c, i): IRChange => {
    if (c.change !== "replace" && c.change !== "remove") return c;
    if (c.at.container.kind !== "group" || c.at.container.name !== "main") return c;
    if (!("context" in c.old)) return c;
    const old = c.old;
    const key = keys.find((k) => sameKey(old, k));
    if (key === undefined) return c;
    overrides.push({ change: i, owner: "assign-tab" });
    const keystroke = { vkey: key.vkey, modifiers: [...key.modifiers] };
    return { ...c, at: { ...c.at, keystroke } };
  });
  return { changes: out, overrides };
}

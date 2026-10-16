/**
 * s02-families — the ONE reconciled S-02 (deadkey single-tap) shape definition,
 * shared by the hand-written s02Recognizer (rules/s02-deadkey-single-tap.ts) and
 * the YAML-generated rule (via interpreter.ts). Issue #2233 / queue-2233-ruling.md.
 *
 * Before #2233 the two matchers implemented divergent shape definitions (the
 * interpreter required an escape rule and char-only stores, keyed families by
 * deadkey id alone, and rejected same-group trigger/fan-out layouts; the hand
 * matcher required a group literally named "deadkeys" and swept fallback rules
 * into ownership). Both now consume the families computed here, so the family
 * set cannot diverge; the per-matcher twin tests pin slot/fragment parity.
 *
 * The definition (binding text: queue-2233-ruling.md):
 *  - All shape checks run on the CLEANED context: the rule's context with the
 *    codec's `+` separator elements removed (isPlusSeparator). Cleaning is a
 *    view — the IR is never mutated. A context containing any OTHER raw
 *    element is disqualified (its true shape is unknown).
 *  - Trigger: in a `usingKeys` group, cleaned context is exactly one element
 *    (vkey | char | any(store)) and the output is exactly one deadkey. An
 *    any-store trigger must resolve to a store with exactly one item, a char
 *    (a multi-item store is a set selector — rule-6 architecture, not S-02).
 *  - Fan-out: cleaned context is exactly [dk, any] (classic) or
 *    [char, dk, any] (postfix form), output is exactly one index() whose
 *    offset equals the cleaned position of the sole any() (Keyman's own
 *    definition of index() — the `+` never counts). The two stores must exist
 *    and have equal item counts; there is NO char-only store requirement
 *    (real families' stores carry deadkey chain items and `nul` padding —
 *    ruling D6).
 *  - A classic family is emitted only when its deadkey has at least one
 *    trigger; a postfix family is self-triggering (its prefix char is the
 *    trigger identity — EuroLatin has no typed trigger rule at all).
 *  - Family identity is the full cluster key (group, deadkey id, prefix char,
 *    base store, output store) — never the deadkey id alone (EuroLatin's 19
 *    families share dk(1)).
 *  - Escape: optional, owned when present. Classic form [dk, vkey|char] >
 *    [char]; postfix form [char(X), dk, char(X)] > [char(X)] with X the
 *    family's prefix char. An escape matched by more than one family is
 *    shared: every matching family derives accentChar from it, none owns it.
 *  - Trigger ownership: a deadkey's trigger rules are owned by its family
 *    only when the deadkey has exactly ONE family; with several families the
 *    triggers are shared infrastructure, recorded on each family but owned
 *    by none (a rule can carry only one ownedByPattern stamp — claiming a
 *    shared trigger twice throws Ownership drift in recognizePatterns).
 */

import type {
  ContextElement,
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
} from "@keyboard-studio/contracts";
import { isDeadkeyOnlyOutput, isPlusSeparator } from "../shared/rule-shape.js";
import { formatDkName, formatVKeyModifiers, isBehaviourOwned } from "./utils.js";

// ---------------------------------------------------------------------------
// Cleaned context
// ---------------------------------------------------------------------------

/**
 * The rule's context with `+` separator elements removed, or null when the
 * context contains any other raw element (shape unknown — disqualified).
 */
export function cleanedContext(rule: IRRule): ContextElement[] | null {
  const cleaned: ContextElement[] = [];
  for (const el of rule.context) {
    if (isPlusSeparator(el)) continue;
    if (el.kind === "raw") return null;
    cleaned.push(el);
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Role shapes
// ---------------------------------------------------------------------------

export type S02TriggerForm = "vkey" | "char" | "any-store";

export interface S02TriggerMatch {
  rule: IRRule;
  deadkeyId: number;
  form: S02TriggerForm;
  /** The single cleaned context element (vkey | char | any). */
  element: ContextElement;
  /** Slot value: vkey name with modifiers, the char, or the any-store's sole char. */
  triggerKey: string;
  /** Set only for the any-store form: the trigger store's name. */
  triggerStore?: string;
}

export function matchS02Trigger(
  ir: KeyboardIR,
  rule: IRRule,
): S02TriggerMatch | null {
  if (!isDeadkeyOnlyOutput(rule)) return null;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "deadkey") return null;
  const cleaned = cleanedContext(rule);
  if (cleaned === null || cleaned.length !== 1) return null;
  const element = cleaned[0]!;
  if (element.kind === "vkey") {
    return {
      rule,
      deadkeyId: out.id,
      form: "vkey",
      element,
      triggerKey: `${formatVKeyModifiers(element.modifiers)}${element.name}`,
    };
  }
  if (element.kind === "char") {
    return { rule, deadkeyId: out.id, form: "char", element, triggerKey: element.value };
  }
  if (element.kind === "any") {
    const store = ir.stores.find((s) => s.name === element.storeRef);
    if (store === undefined || store.items.length !== 1) return null;
    const item = store.items[0]!;
    if (item.kind !== "char") return null;
    return {
      rule,
      deadkeyId: out.id,
      form: "any-store",
      element,
      triggerKey: item.value,
      triggerStore: store.name,
    };
  }
  return null;
}

export interface S02FanOutMatch {
  rule: IRRule;
  deadkeyId: number;
  /** The postfix form's prefix char; null for the classic form. */
  prefixChar: string | null;
  baseStoreRef: string;
  outStoreRef: string;
}

export function matchS02FanOut(rule: IRRule): S02FanOutMatch | null {
  if (rule.output.length !== 1) return null;
  const out = rule.output[0]!;
  if (out.kind !== "index") return null;
  const cleaned = cleanedContext(rule);
  if (cleaned === null) return null;

  // The any() must be the terminal element; index()'s offset must equal its
  // 1-indexed cleaned position (the sole any() in the context).
  const anyIndex = cleaned.findIndex((el) => el.kind === "any");
  if (anyIndex === -1 || anyIndex !== cleaned.length - 1) return null;
  if (cleaned.filter((el) => el.kind === "any").length !== 1) return null;
  if (out.offset !== anyIndex + 1) return null;
  const anyEl = cleaned[anyIndex]!;
  if (anyEl.kind !== "any") return null;

  if (cleaned.length === 2) {
    const dk = cleaned[0]!;
    if (dk.kind !== "deadkey") return null;
    return {
      rule,
      deadkeyId: dk.id,
      prefixChar: null,
      baseStoreRef: anyEl.storeRef,
      outStoreRef: out.storeRef,
    };
  }
  if (cleaned.length === 3) {
    const prefix = cleaned[0]!;
    const dk = cleaned[1]!;
    if (prefix.kind !== "char" || dk.kind !== "deadkey") return null;
    return {
      rule,
      deadkeyId: dk.id,
      prefixChar: prefix.value,
      baseStoreRef: anyEl.storeRef,
      outStoreRef: out.storeRef,
    };
  }
  return null;
}

/**
 * Escape shape for a family. Classic: cleaned [dk(id), vkey|char] > [char].
 * Postfix: cleaned [char(X), dk(id), char(X)] > [char(X)], X = prefix char —
 * the equality pins are definitional (without them the shape also matches
 * digraph rules that are not escapes).
 */
export function matchS02Escape(
  rule: IRRule,
  deadkeyId: number,
  prefixChar: string | null,
): boolean {
  if (rule.output.length !== 1) return false;
  const out = rule.output[0]!;
  if (out.kind !== "char") return false;
  const cleaned = cleanedContext(rule);
  if (cleaned === null) return false;
  if (prefixChar !== null) {
    if (cleaned.length !== 3) return false;
    const [c0, c1, c2] = cleaned as [ContextElement, ContextElement, ContextElement];
    return (
      c0.kind === "char" && c0.value === prefixChar &&
      c1.kind === "deadkey" && c1.id === deadkeyId &&
      c2.kind === "char" && c2.value === prefixChar &&
      out.value === prefixChar
    );
  }
  if (cleaned.length !== 2) return false;
  const [c0, c1] = cleaned as [ContextElement, ContextElement];
  if (c0.kind !== "deadkey" || c0.id !== deadkeyId) return false;
  return c1.kind === "vkey" || c1.kind === "char";
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

export interface S02Family {
  /** The fan-out's group. */
  group: IRGroup;
  deadkeyId: number;
  prefixChar: string | null;
  fanOuts: IRRule[];
  /** The family's escape rule, when one is present in the fan-out's group. */
  escape?: IRRule;
  /** True when the escape is matched by several families: recorded on each, owned by none. */
  escapeShared: boolean;
  /** The bare accent char from the escape's output, when an escape is present. */
  accentChar?: string;
  baseStore: IRStore;
  outStore: IRStore;
  /** All trigger rules for this deadkey (possibly empty for a postfix family). */
  triggers: S02TriggerMatch[];
  /** True iff this is the deadkey's only family — only then are triggers owned. */
  triggersOwned: boolean;
  /** The trigger used for slots/fragment: unshifted vkey preferred, else first. */
  primaryTrigger?: S02TriggerMatch;
  /** A beep rule for this deadkey exists in the fan-out's group (S-02 + S-10 review flag source). */
  hasBeep: boolean;
  /** patternId suffix after the `#`: the full cluster key. */
  idSuffix: string;
}

export function s02IdSuffix(family: {
  groupName: string;
  deadkeyId: number;
  prefixChar: string | null;
  baseStoreName: string;
  outStoreName: string;
}): string {
  const prefix = family.prefixChar !== null ? `:${family.prefixChar}` : "";
  return `${family.groupName}:${formatDkName(family.deadkeyId)}${prefix}:${family.baseStoreName}>${family.outStoreName}`;
}

function isCandidate(rule: IRRule): boolean {
  // FR-021: behaviour-owned rules are never pattern candidates.
  return rule.ownedByPattern === undefined && !isBehaviourOwned(rule);
}

function pickPrimaryTrigger(
  triggers: S02TriggerMatch[],
): S02TriggerMatch | undefined {
  const unshifted = triggers.find(
    (t) => t.element.kind === "vkey" && t.element.modifiers.length === 0,
  );
  return unshifted ?? triggers[0];
}

interface FamilyAcc {
  group: IRGroup;
  deadkeyId: number;
  prefixChar: string | null;
  baseStoreRef: string;
  outStoreRef: string;
  fanOuts: IRRule[];
}

export function findS02Families(ir: KeyboardIR): S02Family[] {
  // Index triggers by deadkey id (usingKeys groups only — the keystroke
  // position only exists there).
  const triggersByDkId = new Map<number, S02TriggerMatch[]>();
  for (const group of ir.groups) {
    if (group.usingKeys !== true) continue;
    for (const rule of group.rules) {
      if (!isCandidate(rule)) continue;
      const trigger = matchS02Trigger(ir, rule);
      if (trigger === null) continue;
      const existing = triggersByDkId.get(trigger.deadkeyId) ?? [];
      existing.push(trigger);
      triggersByDkId.set(trigger.deadkeyId, existing);
    }
  }

  // Index fan-outs by full cluster key, in first-appearance order.
  const accByKey = new Map<string, FamilyAcc>();
  const accOrder: FamilyAcc[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (!isCandidate(rule)) continue;
      const fanOut = matchS02FanOut(rule);
      if (fanOut === null) continue;
      const key = `${group.name}|${fanOut.deadkeyId}|${fanOut.prefixChar ?? ""}|${fanOut.baseStoreRef}>${fanOut.outStoreRef}`;
      let acc = accByKey.get(key);
      if (acc === undefined) {
        acc = {
          group,
          deadkeyId: fanOut.deadkeyId,
          prefixChar: fanOut.prefixChar,
          baseStoreRef: fanOut.baseStoreRef,
          outStoreRef: fanOut.outStoreRef,
          fanOuts: [],
        };
        accByKey.set(key, acc);
        accOrder.push(acc);
      }
      acc.fanOuts.push(rule);
    }
  }

  // Validate stores and the emission condition (classic families need a
  // trigger; postfix families are self-triggering).
  interface Validated extends FamilyAcc {
    baseStore: IRStore;
    outStore: IRStore;
    triggers: S02TriggerMatch[];
  }
  const validated: Validated[] = [];
  for (const acc of accOrder) {
    const baseStore = ir.stores.find((s) => s.name === acc.baseStoreRef);
    const outStore = ir.stores.find((s) => s.name === acc.outStoreRef);
    if (baseStore === undefined || outStore === undefined) continue;
    // Parallel-store invariant (Layer A per spec §10 Check #13).
    if (baseStore.items.length !== outStore.items.length) continue;
    const triggers = triggersByDkId.get(acc.deadkeyId) ?? [];
    if (acc.prefixChar === null && triggers.length === 0) continue;
    validated.push({ ...acc, baseStore, outStore, triggers });
  }

  const familyCountByDkId = new Map<number, number>();
  for (const v of validated) {
    familyCountByDkId.set(v.deadkeyId, (familyCountByDkId.get(v.deadkeyId) ?? 0) + 1);
  }

  // Escape candidates per family (searched in the fan-out's group), then the
  // sharing pass: an escape rule matched by several families is owned by none.
  const escapeByAcc = new Map<Validated, IRRule | undefined>();
  const escapeClaimants = new Map<string, number>();
  for (const v of validated) {
    const escape = v.group.rules.find(
      (r) => isCandidate(r) && matchS02Escape(r, v.deadkeyId, v.prefixChar),
    );
    escapeByAcc.set(v, escape);
    if (escape !== undefined) {
      escapeClaimants.set(escape.nodeId, (escapeClaimants.get(escape.nodeId) ?? 0) + 1);
    }
  }

  const families: S02Family[] = [];
  for (const v of validated) {
    const escape = escapeByAcc.get(v);
    const escapeShared =
      escape !== undefined && (escapeClaimants.get(escape.nodeId) ?? 0) > 1;
    const escapeOut = escape?.output[0];
    const primaryTrigger =
      v.triggers.length > 0 ? pickPrimaryTrigger(v.triggers) : undefined;
    const hasBeep = v.group.rules.some((r) => {
      const c0 = r.context[0];
      if (c0 === undefined || c0.kind !== "deadkey" || c0.id !== v.deadkeyId) {
        return false;
      }
      return r.output.some((el) => el.kind === "beep");
    });
    families.push({
      group: v.group,
      deadkeyId: v.deadkeyId,
      prefixChar: v.prefixChar,
      fanOuts: v.fanOuts,
      ...(escape !== undefined ? { escape } : {}),
      escapeShared,
      ...(escapeOut !== undefined && escapeOut.kind === "char"
        ? { accentChar: escapeOut.value }
        : {}),
      baseStore: v.baseStore,
      outStore: v.outStore,
      triggers: v.triggers,
      triggersOwned: (familyCountByDkId.get(v.deadkeyId) ?? 0) === 1,
      ...(primaryTrigger !== undefined ? { primaryTrigger } : {}),
      hasBeep,
      idSuffix: s02IdSuffix({
        groupName: v.group.name,
        deadkeyId: v.deadkeyId,
        prefixChar: v.prefixChar,
        baseStoreName: v.baseStore.name,
        outStoreName: v.outStore.name,
      }),
    });
  }
  return families;
}

// ---------------------------------------------------------------------------
// Fragment (shared by both lift paths so the fragments cannot diverge)
// ---------------------------------------------------------------------------

/**
 * The S-02 kmnFragment template for a family's slot values. The trigger line
 * renders the any() form when the primary trigger is an any-store trigger
 * (triggerStore slot present); the escape line is present only when the
 * family has an escape (accentChar slot present).
 */
export function buildS02Fragment(slotValues: Record<string, string>): string {
  const triggerLine =
    slotValues["triggerStore"] !== undefined
      ? "+ any({{triggerStore}}) > dk({{deadkeyName}})"
      : "+ [{{triggerKey}}] > dk({{deadkeyName}})";
  const lines = [
    triggerLine,
    "dk({{deadkeyName}}) + any({{baseLetters}}) > index({{accentedForms}}, 2)",
  ];
  if (slotValues["accentChar"] !== undefined) {
    lines.push("dk({{deadkeyName}}) + [{{triggerKey}}] > {{accentChar}}");
  }
  return lines.join("\n");
}

// carvedCombo — the carved-combination display row shared by the "Review
// carved keys" panel and the fallback-policy host summary.
//
// A plain carve review: it names WHAT was carved (key + modifiers, or a store
// slot) and carries the trigger key so a host layout can be consulted. It
// holds no fallback decision — that is the keyboard-wide fallback policy,
// decided elsewhere (see specs/076-rule-behaviours/fallback-surface-design.md).

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parseSlotId } from "@keyboard-studio/engine";
import {
  DEADKEY,
  lookupHostOutput,
  type BaseLayoutId,
} from "./referenceBaseLayouts.ts";

/** One row of the review panel: a carved combination. */
export interface CarvedCombo {
  comboId: string;
  /** Human label, e.g. "RALT + 4" or 'store "dkt003b" slot 1 — ‘É’'. */
  label: string;
  /** Keyman K_ vkey id for lookupHostOutput; undefined when no key resolves. */
  key: string | undefined;
  /** Raw IR modifier tokens, e.g. ["RALT"]. */
  modifiers: string[];
  /** True for <storeNodeId>#<index> combos (no direct key of their own). */
  isStoreSlot: boolean;
}

/** "K_4" -> "4", "K_BKQUOTE" -> "BKQUOTE" — the K_ prefix is positional noise. */
function humanizeVkey(name: string): string {
  return name.startsWith("K_") ? name.slice(2) : name;
}

/** "RALT + 4" style label for a key chord. */
export function humanizeChord(key: string, modifiers: readonly string[]): string {
  const mods = modifiers.map((m) => m.toUpperCase()).join(" + ");
  return mods === "" ? humanizeVkey(key) : `${mods} + ${humanizeVkey(key)}`;
}

/** The trigger key of a rule: the LAST vkey in its context (the key pressed). */
function triggerKeyOf(rule: {
  context: { kind: string; name?: string; modifiers?: string[] }[];
}): { key: string; modifiers: string[] } | undefined {
  for (let i = rule.context.length - 1; i >= 0; i--) {
    const el = rule.context[i]!;
    if (el.kind === "vkey" && el.name !== undefined) {
      return { key: el.name, modifiers: el.modifiers ?? [] };
    }
  }
  return undefined;
}

function storeItemLabel(item: {
  kind: string;
  value?: string;
  name?: string;
  id?: number;
  text?: string;
}): string {
  if (item.kind === "char" && item.value !== undefined) return `‘${item.value}’`;
  if (item.kind === "vkey" && item.name !== undefined) return humanizeVkey(item.name);
  if (item.kind === "deadkey" && item.id !== undefined) return `deadkey ${item.id}`;
  if (item.kind === "raw" && item.text !== undefined) return item.text;
  return item.kind;
}

/**
 * Find a rule consuming the store via any()/index() — the carved slot's
 * trigger follows the consuming rule's key. Matches storeRef against both the
 * store name and nodeId (the IR does not guarantee which the codec recorded).
 */
function findPairedRuleKey(
  ir: KeyboardIR,
  storeName: string,
  storeNodeId: string,
): { key: string; modifiers: string[] } | undefined {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const consumes = rule.context.some(
        (el) =>
          (el.kind === "any" || el.kind === "index") &&
          (el.storeRef === storeName || el.storeRef === storeNodeId),
      );
      if (!consumes) continue;
      const trigger = triggerKeyOf(rule);
      if (trigger !== undefined) return trigger;
    }
  }
  return undefined;
}

/**
 * Resolve carved combo ids (rule nodeIds and `<storeNodeId>#<index>` slot ids)
 * against the pre-carve IR to display rows. Ids that resolve to neither a rule
 * nor a store slot (groups, stores, raw nodes, stale ids) are dropped — never
 * rendered as broken rows. Order follows `comboIds`; duplicates collapse.
 */
export function resolveCarvedCombos(ir: KeyboardIR, comboIds: Iterable<string>): CarvedCombo[] {
  const rows: CarvedCombo[] = [];
  const seen = new Set<string>();
  const rulesById = new Map(ir.groups.flatMap((g) => g.rules).map((r) => [r.nodeId, r]));
  for (const comboId of comboIds) {
    if (seen.has(comboId)) continue;
    seen.add(comboId);
    const rule = rulesById.get(comboId);
    if (rule !== undefined) {
      const trigger = triggerKeyOf(rule);
      rows.push({
        comboId,
        label:
          trigger !== undefined ? humanizeChord(trigger.key, trigger.modifiers) : `rule ${comboId}`,
        key: trigger?.key,
        modifiers: trigger?.modifiers ?? [],
        isStoreSlot: false,
      });
      continue;
    }
    const slot = parseSlotId(comboId);
    if (slot === null) continue;
    const store = ir.stores.find((s) => s.nodeId === slot.storeNodeId);
    const item = store?.items[slot.itemsIndex];
    if (store === undefined || item === undefined) continue;
    const paired = findPairedRuleKey(ir, store.name, store.nodeId);
    rows.push({
      comboId,
      label: `store "${store.name}" slot ${slot.itemsIndex} — ${storeItemLabel(item)}`,
      key: paired?.key,
      modifiers: paired?.modifiers ?? [],
      isStoreSlot: true,
    });
  }
  return rows;
}

/**
 * What a host layout would produce for a key+modifiers. "unknown" where the
 * reference data has no cell (never a guess), "deadkey" where the host starts
 * a deadkey, otherwise the character. An undefined key is "unknown".
 */
export function hostOutcomeText(
  hostId: BaseLayoutId,
  combo: { key: string | undefined; modifiers: readonly string[] },
): string {
  if (combo.key === undefined) return "unknown";
  const out = lookupHostOutput(hostId, combo.key, combo.modifiers);
  if (out === undefined) return "unknown";
  if (out === DEADKEY) return "deadkey";
  return out;
}

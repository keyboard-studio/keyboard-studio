// guardRuleSynthesis — synthesize guard rules for direction A's "Add all"
// (spec 082 FR-020).
//
// "Add all" stages one guard rule per missing entry through the normal
// reversible working-copy path (`setWorkingIR`). Synthesis mirrors the
// guard family's own template rule — the family's first member —
// substituting only the key element, so the new rules spell the same pattern
// (`any(store) + key > context`) the author already has:
//
//   - template key element is a vkey → `{ kind: "vkey", name: entry.key,
//     modifiers: <template's modifiers> }` (the entry's key is the physical
//     key; the family's modifier pattern, e.g. RALT, is preserved);
//   - template key element is a char → `{ kind: "char", value:
//     entry.outputChar }` (the mark character in the text stream).
//
// Idempotent: an entry whose guard signature already exists in the IR is
// skipped, so re-running "Add all" never duplicates rules. Entries with no
// identifiable key element (or no family template at all) are skipped, not
// guessed — the result reports counts honestly.

import { ruleContextElements } from "@keyboard-studio/contracts";
import {
  makeRule,
  ruleConditions,
  ruleHasNulContext,
  ruleKeystroke,
  rulePreContext,
} from "@keyboard-studio/contracts";
import type {
  ContextElement,
  IRRule,
  KeyboardIR,
} from "@keyboard-studio/contracts";
import type { MissingGuardEntry, MissingGuardGroup } from "./guardAnalysis.ts";
import type { RuleFamily } from "./ruleFamilies.ts";

export interface SynthesizeMissingGuardsResult {
  /** Rules synthesized (not yet written — the caller stages them). */
  rules: IRRule[];
  /** Entries skipped because their guard signature already exists (idempotent re-run). */
  alreadyCovered: number;
  /**
   * Entries skipped because there is nothing to clone from: the family has
   * no template rule, or the template has no identifiable key element.
   */
  noTemplate: number;
}

/** Normalized guard signature for dedup: guard store + key element. */
function guardSignature(rule: IRRule): string | null {
  const guard = ruleContextElements(rule).find(
    (el): el is { kind: "any"; storeRef: string } => el.kind === "any",
  );
  const keyEl = lastKeyElement(ruleContextElements(rule));
  if (guard === undefined || keyEl === undefined) return null;
  return `${guard.storeRef}::${JSON.stringify(keyEl)}`;
}

function lastKeyElement(
  context: readonly ContextElement[],
): ContextElement | undefined {
  for (let i = context.length - 1; i >= 0; i--) {
    const el = context[i]!;
    if (el.kind === "vkey" || el.kind === "char") return el;
  }
  return undefined;
}

function findRule(ir: KeyboardIR, nodeId: string): IRRule | undefined {
  for (const group of ir.groups) {
    const rule = group.rules.find((r) => r.nodeId === nodeId);
    if (rule !== undefined) return rule;
  }
  return undefined;
}

function cloneWithKey(template: IRRule, entry: MissingGuardEntry): IRRule | null {
  // Guard rules are `using keys` rules (`any(store) + key > context`).
  const group = { usingKeys: true };
  const isKey = (el: ContextElement): boolean => el.kind === "vkey" || el.kind === "char";
  const keystroke = ruleKeystroke(template, group);
  const preContext = rulePreContext(template, group);
  // The key element is the last vkey/char: the keystroke, else the last one before it.
  const keyInKeystroke = keystroke !== undefined && isKey(keystroke);
  const preKeyIndex = keyInKeystroke ? -1 : preContext.map(isKey).lastIndexOf(true);
  const templateKey = keyInKeystroke ? keystroke : preContext[preKeyIndex];
  if (templateKey === undefined) return null;
  const replacement: ContextElement =
    templateKey.kind === "vkey"
      ? { kind: "vkey", name: entry.key, modifiers: [...templateKey.modifiers] }
      : { kind: "char", value: entry.outputChar };
  return makeRule(
    {
      nodeId: crypto.randomUUID(),
      nulContext: ruleHasNulContext(template),
      conditions: ruleConditions(template),
      preContext: keyInKeystroke ? preContext : preContext.map((el, i) => (i === preKeyIndex ? replacement : el)),
      ...(keystroke !== undefined ? { keystroke: keyInKeystroke ? replacement : keystroke } : {}),
      output: template.output.map((el) => ({ ...el })),
      trailingComment: "added from guard suggestion",
      rulesStepAdded: true,
    },
    group,
  );
}

/**
 * The family holding guard rules for a store: preferably the family that
 * declares the guard store, else a family with a member carrying an
 * `any(store)` guard for it (see synthesizeMissingGuardRules).
 */
export function familyForGuardStore(
  ir: KeyboardIR,
  families: readonly RuleFamily[],
  store: string,
): RuleFamily | undefined {
  return (
    families.find((f) => f.guardStore === store) ??
    families.find((f) =>
      f.memberIds.some((id) =>
        findRule(ir, id)?.context.some(
          (el) => el.kind === "any" && el.storeRef === store,
        ),
      ),
    )
  );
}

/**
 * Synthesize one guard rule per missing entry. Pure — the caller writes the
 * result via `setWorkingIR`.
 */
export function synthesizeMissingGuardRules(
  ir: KeyboardIR,
  group: MissingGuardGroup,
  families: readonly RuleFamily[],
): SynthesizeMissingGuardsResult {
  const family = familyForGuardStore(ir, families, group.store);
  const template =
    family !== undefined ? findRule(ir, family.memberIds[0]!) : undefined;

  const seen = new Set<string>();
  for (const g of ir.groups) {
    for (const rule of g.rules) {
      const sig = guardSignature(rule);
      if (sig !== null) seen.add(sig);
    }
  }

  const rules: IRRule[] = [];
  let alreadyCovered = 0;
  let noTemplate = 0;
  for (const entry of group.missing) {
    const rule = template !== undefined ? cloneWithKey(template, entry) : null;
    if (rule === null) {
      noTemplate += 1;
      continue;
    }
    const sig = guardSignature(rule);
    if (sig !== null && seen.has(sig)) {
      alreadyCovered += 1; // idempotent
      continue;
    }
    if (sig !== null) seen.add(sig);
    rules.push(rule);
  }
  return { rules, alreadyCovered, noTemplate };
}

/**
 * The group the synthesized rules should be appended to: the family's own
 * group (non-readonly), else the first non-readonly group, else null (the
 * caller then stages nothing).
 */
export function targetGroupForSynthesis(
  ir: KeyboardIR,
  families: readonly RuleFamily[],
  store: string,
):
  | { groupIndex: number }
  | null {
  const family = familyForGuardStore(ir, families, store);
  if (family !== undefined && family.memberIds.length > 0) {
    const idx = ir.groups.findIndex(
      (g) => !g.readonly && g.rules.some((r) => r.nodeId === family.memberIds[0]),
    );
    if (idx !== -1) return { groupIndex: idx };
  }
  const fallback = ir.groups.findIndex((g) => !g.readonly);
  return fallback !== -1 ? { groupIndex: fallback } : null;
}

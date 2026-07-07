/**
 * collectCharContributors — capability-agnostic contributor discovery for carve cascade-delete.
 *
 * Finds every place in the IR that contributes to producing a given target character:
 *   - ruleNodeIds:  whole-rule delete candidates (entire NFC output === targetChar)
 *   - storeSlotIds: output-store slot ids to remove ("<storeNodeId>#<i>")
 *   - locations:    human-readable origin labels for the confirmation dialog
 *   - blocked:      multi-char / opaque producers that cannot be surgically removed
 *
 * Design constraints (from km-strategy, treated as requirements):
 *   - CAPABILITY-AGNOSTIC: does not gate on RemovalCapability; a misclassified
 *     RAlt/S-08 duplicate must still be found.
 *   - S-02 TRIGGER RULE EXCLUSION: the `+ deadkeyKey > dk(X)` trigger rule must
 *     NEVER enter the contributor set; only the fan-out rule's single matching
 *     SLOT is a contributor. A trigger rule is detected as: output is exactly one
 *     `{kind:"deadkey"}` element.
 *   - OUTPUT-STORE ONLY (this function's job): only the one matching slot index
 *     in the output store is added to `storeSlotIds` here — the input/trigger
 *     store is never explicitly targeted by THIS function. applyStoreSlotRemovals
 *     is the one that resolves the pairing graph and coordinates the drop across
 *     the paired input store too, so the caller doesn't need to (and shouldn't)
 *     duplicate that resolution here.
 *   - SINGLE-CHAR WHOLE-DELETE: whole-rule-delete only when the rule's ENTIRE
 *     NFC output === targetChar (single-char producer). Multi-char producers go
 *     to `blocked`.
 *   - OPAQUE FRAGMENTS: RawKmnFragment producers can only be whole-fragment-
 *     deleted; listed in `blocked`.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { isDeadkeyOnlyOutput } from "../shared/rule-shape.js";

// ---------------------------------------------------------------------------
// Public contract (shared with km-frontend — do not deviate)
// ---------------------------------------------------------------------------

export interface CharContributors {
  /** The target character that was queried. */
  targetChar: string;
  /** nodeIds of rules whose ENTIRE NFC output equals targetChar — whole-rule delete. */
  ruleNodeIds: string[];
  /** "<storeNodeId>#<index>" output-store slots to remove (one slot per matching position). */
  storeSlotIds: string[];
  /** Human-readable origin labels for the confirmation dialog. */
  locations: { kind: 'group' | 'pattern' | 'store'; label: string; nodeId: string }[];
  /** Opaque or multi-char producers that cannot be surgically removed. */
  blocked: { reason: string; label: string }[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * True when a rule is an S-02 trigger rule: output is exactly one `{kind:"deadkey"}` element.
 * Such rules must NEVER be added to the contributor set — removing them destroys the
 * whole deadkey family.
 */
const isTriggerRule = isDeadkeyOnlyOutput;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Collect every contributor to `targetChar` in the IR.
 *
 * @param ir         The KeyboardIR (after recognizePatterns() has run, if applicable).
 * @param targetChar The NFC character to find producers for.
 * @returns          A CharContributors record (see interface above).
 */
export function collectCharContributors(ir: KeyboardIR, targetChar: string): CharContributors {
  // Normalize the target to NFC so comparisons are canonical.
  const target = targetChar.normalize("NFC");

  const ruleNodeIds: string[] = [];
  const storeSlotIds: string[] = [];
  const locations: CharContributors['locations'] = [];
  const blocked: CharContributors['blocked'] = [];

  // Pre-build store map (name → store) for store-output expansion.
  const storeMap = new Map(ir.stores.map((s) => [s.name, s]));

  // Build a set of recognized-pattern IDs to patternTitle, for location labels.
  const patternById = new Map(
    ir.recognizedPatterns
      .filter((p) => p.origin === 'recognized')
      .map((p) => [p.id, p.title]),
  );

  // Track already-seen locations to avoid duplicates in the locations array.
  const seenLocationNodeIds = new Set<string>();

  const addLocation = (kind: 'group' | 'pattern' | 'store', label: string, nodeId: string) => {
    if (!seenLocationNodeIds.has(nodeId)) {
      seenLocationNodeIds.add(nodeId);
      locations.push({ kind, label, nodeId });
    }
  };

  // Track already-added ruleNodeIds / storeSlotIds to avoid duplicates.
  const seenRuleNodeIds = new Set<string>();
  const seenStoreSlotIds = new Set<string>();

  // --- 1. Check opaque fragments (RawKmnFragment) ---
  // These can only be whole-fragment-deleted; list in blocked.
  for (const frag of ir.raw) {
    // We can't statically determine what a raw fragment produces. To avoid a
    // false "cannot be removed" warning on every chip (a fragment's source may
    // merely MATCH a common character on the input side), only flag it when the
    // target appears on the OUTPUT side of a rule — i.e. after a `>`.
    const outputSide = frag.sourceText.split('>').slice(1).join('>');
    if (outputSide.includes(target)) {
      blocked.push({
        reason: `Opaque fragment (${frag.reason}): cannot surgically remove individual characters`,
        label: frag.reason,
      });
    }
  }

  // Record where a contributing rule lives (its owning pattern, else its group)
  // so the confirm dialog can name the place.
  const addRuleLocation = (
    r: { ownedByPattern?: string | undefined },
    group: { name: string; nodeId: string },
  ) => {
    if (r.ownedByPattern !== undefined) {
      addLocation('pattern', patternById.get(r.ownedByPattern) ?? r.ownedByPattern, r.ownedByPattern);
    } else {
      addLocation('group', group.name, group.nodeId);
    }
  };

  // --- 2. Walk all groups → all rules ---
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // Skip S-02 trigger rules (output is exactly one deadkey element) — deleting
      // one would destroy the whole deadkey family, not this single character.
      if (isTriggerRule(rule)) continue;

      const outEls = rule.output as { kind: string; value?: string; storeRef?: string }[];

      // (a) Store-produced target — the character is emitted through an
      //     index()/outs() over a store (base-layer alphabet fan-out OR a
      //     deadkey fan-out). The surgical unit is the matching store SLOT
      //     (a drop, coordinated by applyStoreSlotRemovals with any paired
      //     store), NEVER the whole rule — the rule produces the entire
      //     store's worth of characters, so deleting it would remove them all.
      let storeMatched = false;
      for (const el of outEls) {
        if ((el.kind === 'index' || el.kind === 'outs') && el.storeRef !== undefined) {
          const store = storeMap.get(el.storeRef);
          if (store === undefined) continue;
          for (let i = 0; i < store.items.length; i++) {
            const item = store.items[i];
            if (item !== undefined && item.kind === 'char' && item.value.normalize('NFC') === target) {
              const slotId = `${store.nodeId}#${i}`;
              if (!seenStoreSlotIds.has(slotId)) { seenStoreSlotIds.add(slotId); storeSlotIds.push(slotId); }
              addLocation('store', store.name, store.nodeId);
              storeMatched = true;
            }
          }
        }
      }
      if (storeMatched) {
        addRuleLocation(rule, group);
        continue;
      }

      // (b) Literal target — the character is written out directly as one or
      //     more `char` elements (base+combining runs NFC-compose to one glyph).
      const charVals = outEls.filter((el) => el.kind === 'char').map((el) => el.value ?? '');
      if (charVals.length === 0) continue;
      const onlyCharOutput = charVals.length === outEls.length;
      const wholeOutput = charVals.join('').normalize('NFC');

      if (onlyCharOutput && wholeOutput === target) {
        // The rule's entire output is exactly this character → whole-rule delete.
        if (!seenRuleNodeIds.has(rule.nodeId)) { seenRuleNodeIds.add(rule.nodeId); ruleNodeIds.push(rule.nodeId); }
        addRuleLocation(rule, group);
      } else if (wholeOutput.includes(target)) {
        // The character is only part of a longer literal output that can't be
        // split surgically (rare) → genuinely blocked.
        blocked.push({
          reason: `produces "${wholeOutput}" — "${target}" can't be removed without affecting the rest of that output`,
          label: `${group.name} / ${rule.nodeId}`,
        });
      }
    }
  }

  return { targetChar: target, ruleNodeIds, storeSlotIds, locations, blocked };
}

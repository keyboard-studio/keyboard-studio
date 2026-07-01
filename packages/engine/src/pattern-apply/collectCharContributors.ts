/**
 * collectCharContributors — capability-agnostic contributor discovery for carve cascade-delete.
 *
 * Finds every place in the IR that contributes to producing a given target character:
 *   - ruleNodeIds:  whole-rule delete candidates (entire NFC output === targetChar)
 *   - storeSlotIds: output-store slot nul-fills ("<storeNodeId>#<i>")
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
 *   - OUTPUT-STORE ONLY: slot nul-fill targets the one matching slot index in the
 *     output store only; the input/trigger store is never touched.
 *   - SINGLE-CHAR WHOLE-DELETE: whole-rule-delete only when the rule's ENTIRE
 *     NFC output === targetChar (single-char producer). Multi-char producers go
 *     to `blocked`.
 *   - OPAQUE FRAGMENTS: RawKmnFragment producers can only be whole-fragment-
 *     deleted; listed in `blocked`.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { ruleProducedStrings } from "@keyboard-studio/contracts";
import { isParallelIndexFanOut } from "../recognizer/rules/parallel-index-fanout.js";

// ---------------------------------------------------------------------------
// Public contract (shared with km-frontend — do not deviate)
// ---------------------------------------------------------------------------

export interface CharContributors {
  /** The target character that was queried. */
  targetChar: string;
  /** nodeIds of rules whose ENTIRE NFC output equals targetChar — whole-rule delete. */
  ruleNodeIds: string[];
  /** "<storeNodeId>#<index>" output-store slots to nul-fill (one slot per matching position). */
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
function isTriggerRule(rule: { output: { kind: string }[] }): boolean {
  return rule.output.length === 1 && rule.output[0]?.kind === "deadkey";
}

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

  // Pre-build store map (name → store) for ruleProducedStrings.
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

  // --- 2. Walk all groups → all rules ---
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // Skip S-02 trigger rules (output is exactly one deadkey element).
      if (isTriggerRule(rule)) continue;

      // --- 2a. Parallel-index fan-out rules (S-02 body + bare-any/Bamum) ---
      // For these, nul-fill the ONE matching slot in the output store.
      if (isParallelIndexFanOut(rule)) {
        const outEl = rule.output[0];
        if (outEl === undefined || outEl.kind !== "index") continue;
        const outputStore = ir.stores.find((s) => s.name === outEl.storeRef);
        if (outputStore === undefined) continue;

        // Find all matching slots in the output store.
        let found = false;
        for (let i = 0; i < outputStore.items.length; i++) {
          const item = outputStore.items[i];
          if (item === undefined) continue;
          if (item.kind === "char" && item.value.normalize("NFC") === target) {
            const slotId = `${outputStore.nodeId}#${i}`;
            if (!seenStoreSlotIds.has(slotId)) {
              seenStoreSlotIds.add(slotId);
              storeSlotIds.push(slotId);
              found = true;
            }
          }
        }

        if (found) {
          // Add a store-kind location for the output store.
          addLocation('store', outputStore.name, outputStore.nodeId);

          // Also add a pattern location if the rule is owned by a pattern.
          if (rule.ownedByPattern !== undefined) {
            const patternTitle = patternById.get(rule.ownedByPattern) ?? rule.ownedByPattern;
            addLocation('pattern', patternTitle, rule.ownedByPattern);
          } else {
            // Add a group location.
            addLocation('group', group.name, group.nodeId);
          }
        }

        // Skip remaining rule processing — fan-out rules always go to storeSlotIds.
        continue;
      }

      // --- 2b. Standard rules ---
      const produced = ruleProducedStrings(rule as Parameters<typeof ruleProducedStrings>[0], storeMap);
      if (produced.length === 0) continue;

      // Check if ANY produced string contains the target (works for BMP and
      // surrogate-pair characters, since String.includes matches on code units).
      const anyContains = produced.some((s) => s.includes(target));
      if (!anyContains) continue;

      // produced is non-empty here (guarded above), so `every` is meaningful.
      const allEqual = produced.every((s) => s === target);

      if (allEqual) {
        // Entire output === targetChar (single-char producer): whole-rule delete.
        if (!seenRuleNodeIds.has(rule.nodeId)) {
          seenRuleNodeIds.add(rule.nodeId);
          ruleNodeIds.push(rule.nodeId);
        }
        // Add location.
        if (rule.ownedByPattern !== undefined) {
          const patternTitle = patternById.get(rule.ownedByPattern) ?? rule.ownedByPattern;
          addLocation('pattern', patternTitle, rule.ownedByPattern);
        } else {
          addLocation('group', group.name, group.nodeId);
        }
      } else {
        // Multi-char producer: cannot whole-delete without over-sweep.
        blocked.push({
          reason: `Rule produces "${produced.join(', ')}" which includes "${target}" among other characters; surgical removal is not safe`,
          label: `${group.name} / ${rule.nodeId}`,
        });
      }
    }
  }

  return { targetChar: target, ruleNodeIds, storeSlotIds, locations, blocked };
}

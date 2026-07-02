import type { KeyboardIR, IRRule } from "@keyboard-studio/contracts";
import { s01Recognizer } from "./rules/s01-simple-swap.js";
import { s02Recognizer } from "./rules/s02-deadkey-single-tap.js";
import { simpleSwapRule, deadkeySingleTapRule } from "./rules/generated/index.js";
import type { RecognizerRule, RecognizeResult } from "./types.js";

const DEFAULT_RULES: RecognizerRule[] = [
  s01Recognizer,
  s02Recognizer,
  simpleSwapRule,
  deadkeySingleTapRule,
];

export function recognizePatterns(
  ir: KeyboardIR,
  rules: RecognizerRule[] = DEFAULT_RULES,
): RecognizeResult {
  // Idempotency guard: if patterns were already recognized, recompute coverage
  // from the existing ownedByPattern annotations and return without mutating ir.
  if (ir.recognizedPatterns.length > 0) {
    const total = ir.groups.reduce((sum, g) => sum + g.rules.length, 0);
    const covered = ir.groups.reduce(
      (sum, g) => sum + g.rules.filter((r) => r.ownedByPattern !== undefined).length,
      0,
    );
    return { ir, recognizedRatio: total > 0 ? covered / total : 0 };
  }

  const totalRules = ir.groups.reduce((sum, g) => sum + g.rules.length, 0);

  // Track which rule nodeIds are covered (across all recognizer passes).
  const coveredRuleIds = new Set<string>();

  for (const rule of rules) {
    const matches = rule.match(ir);
    for (const match of matches) {
      const pattern = rule.lift(match);
      ir.recognizedPatterns.push(pattern);

      for (const nodeRef of match.ownedNodes) {
        if (nodeRef.kind !== "rule") continue;
        coveredRuleIds.add(nodeRef.nodeId);

        // Set ownedByPattern on every covered IRRule.
        for (const group of ir.groups) {
          for (const irRule of group.rules) {
            if (irRule.nodeId === nodeRef.nodeId) {
              irRule.ownedByPattern = pattern.id;
            }
          }
        }
      }
    }
  }

  // 0/0 = 0 (no rules means nothing to recognize; ratio is 0).
  const recognizedRatio = totalRules === 0 ? 0 : coveredRuleIds.size / totalRules;

  assertOwnershipConsistency(ir);

  return { ir, recognizedRatio };
}

// ---------------------------------------------------------------------------
// assertOwnershipConsistency — invariant guard for the two ownership signals
// ---------------------------------------------------------------------------
//
// A Pattern's ownedNodes (kind:'rule' entries only — kind:'store' entries
// carry no ownedByPattern) and an IRRule's ownedByPattern stamp must agree
// bidirectionally:
//   1. every {kind:'rule'} entry in a pattern's ownedNodes must resolve to an
//      IRRule whose ownedByPattern === that pattern's id, and
//   2. every IRRule whose ownedByPattern === p.id must appear in p.ownedNodes.
// Divergence here is exactly the "ghost chip" bug: the same rule renders as
// owned by two different patterns (or by a pattern that doesn't claim it),
// so the group Inspector and pattern Inspector disagree about who owns it.
// Always-on: O(rules), cheap relative to the recognition pass itself.
//
// Origin-blind by design: this runs at the tail of recognizePatterns(), which
// is the only producer of ownedByPattern stamps, so ir.recognizedPatterns
// holds only freshly-recognized patterns at this point — there are no authored
// patterns to exclude. (Contrast collectOwnedNodeIds/toRailNodes in the studio,
// which filter origin === 'recognized' because they run later, over an IR that
// may also carry authored patterns.) If authored patterns ever reach this
// function, revisit whether the invariant should filter by origin.
function assertOwnershipConsistency(ir: KeyboardIR): void {
  const ruleById = new Map<string, IRRule>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      ruleById.set(rule.nodeId, rule);
    }
  }

  for (const pattern of ir.recognizedPatterns) {
    for (const nodeRef of pattern.ownedNodes ?? []) {
      if (nodeRef.kind !== "rule") continue;
      const rule = ruleById.get(nodeRef.nodeId);
      if (rule === undefined || rule.ownedByPattern !== pattern.id) {
        throw new Error(
          `Ownership drift: pattern "${pattern.id}" lists ownedNodes entry ` +
            `"${nodeRef.nodeId}" (kind:'rule'), but that rule's ` +
            `ownedByPattern is ${
              rule === undefined ? "missing (no such rule)" : `"${String(rule.ownedByPattern)}"`
            } instead of "${pattern.id}".`,
        );
      }
    }
  }

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.ownedByPattern === undefined) continue;
      // Small-N: patterns are single-digit-to-low-tens per keyboard, so this
      // .find() inside the rule loop is not a hot path — no index needed.
      const pattern = ir.recognizedPatterns.find((p) => p.id === rule.ownedByPattern);
      const claimsRule = pattern?.ownedNodes?.some(
        (n) => n.kind === "rule" && n.nodeId === rule.nodeId,
      );
      if (pattern === undefined || claimsRule !== true) {
        throw new Error(
          `Ownership drift: rule "${rule.nodeId}" has ownedByPattern ` +
            `"${rule.ownedByPattern}", but pattern ` +
            `${pattern === undefined ? "(missing — no such pattern)" : `"${pattern.id}"`} ` +
            `does not list it in ownedNodes.`,
        );
      }
    }
  }
}

export type { RecognizerRule, MatchResult, RecognizeResult } from "./types.js";
export { classifyRemovalCapabilities } from "./classifyRemovalCapabilities.js";

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { s01Recognizer } from "./rules/s01-simple-swap.js";
import { s02Recognizer } from "./rules/s02-deadkey-single-tap.js";
import type { RecognizerRule, RecognizeResult } from "./types.js";

const DEFAULT_RULES: RecognizerRule[] = [s01Recognizer, s02Recognizer];

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

  return { ir, recognizedRatio };
}

export type { RecognizerRule, MatchResult, RecognizeResult } from "./types.js";

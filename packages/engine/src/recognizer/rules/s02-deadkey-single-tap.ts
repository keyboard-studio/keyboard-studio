import type { IRRule, KeyboardIR, Pattern } from "@keyboard-studio/contracts";
import { makePattern } from "@keyboard-studio/contracts";
import type { MatchResult, RecognizerRule } from "../types.js";
import { ruleRef, storeRef } from "../node-refs.js";
import { storeItemsToCharString, formatDkName } from "../utils.js";
import { buildS02Fragment, findS02Families } from "../s02-families.js";

/**
 * isBody — the CLASSIC S-02 body shape on the RAW context:
 * [dk(D), any(BASE_STORE)] > [index(OUT_STORE, 2)], offset exactly 2.
 *
 * This predicate is retained for classifyRemovalCapabilities (Decision 3:
 * an un-owned body still earns slot-fill when the classifier runs on an IR
 * where recognizePatterns() was not applied). It is deliberately NARROWER
 * than the recognizer's generalised fan-out shape (s02-families.ts
 * matchS02FanOut: cleaned context, offset = cleaned any() position, postfix
 * form): shape-based classification of un-owned rules stays conservative —
 * generalised bodies earn slot-fill through Pattern ownership (Decision 2)
 * plus the ownership-gated store alias, not through this raw shape.
 */
export function isBody(rule: IRRule): boolean {
  if (rule.context.length !== 2) return false;
  const c0 = rule.context[0];
  const c1 = rule.context[1];
  if (c0 === undefined || c0.kind !== "deadkey") return false;
  if (c1 === undefined || c1.kind !== "any") return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "index") return false;
  // Only offset === 2 is supported in v1.1 scope.
  return out.offset === 2;
}

function buildPattern(match: MatchResult): Pattern {
  return makePattern({
    id: match.patternId,
    title: "Single-tap deadkey",
    description: "Deadkey triggered by one keystroke, applying an accent to a base letter.",
    category: "desktop",
    appliesTo: [],
    strategyId: "S-02",
    origin: "recognized",
    ownedNodes: match.ownedNodes,
    questions: [
      {
        id: "triggerKey",
        prompt: "Virtual key that triggers the deadkey state",
        answerType: "key-name",
        default: match.slotValues["triggerKey"] ?? "",
      },
      {
        id: "deadkeyName",
        prompt: "Internal deadkey name",
        // "text" not "store-content": holds a short identifier like dk_0060, not a store body.
        answerType: "text",
        default: match.slotValues["deadkeyName"] ?? "",
      },
      {
        id: "baseLetters",
        prompt: "Base letters the deadkey applies to",
        answerType: "char-list",
        default: match.slotValues["baseLetters"] ?? "",
      },
      match.slotValues["markChars"] !== undefined
        ? {
            id: "markChars",
            prompt: "Combining mark(s) emitted after each base letter",
            answerType: "text",
            default: match.slotValues["markChars"],
          }
        : {
            id: "accentedForms",
            prompt: "Resulting accented forms",
            answerType: "char-list",
            default: match.slotValues["accentedForms"] ?? "",
          },
      {
        id: "accentChar",
        prompt: "Bare combining accent character (emitted by escape rule)",
        answerType: "text",
        default: match.slotValues["accentChar"] ?? "",
      },
    ],
    kmnFragment: buildS02Fragment(match.slotValues),
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "recognizer",
    reviewDate: new Date().toISOString().slice(0, 10),
  });
}

export const s02Recognizer: RecognizerRule = {
  id: "s02-deadkey-single-tap",
  strategyId: "S-02",

  // Family finding is shared with the YAML-generated rule (s02-families.ts,
  // issue #2233): one reconciled shape definition, so the two matchers cannot
  // diverge. This matcher only converts families to MatchResults.
  match(ir: KeyboardIR): MatchResult[] {
    const results: MatchResult[] = [];
    for (const family of findS02Families(ir)) {
      const ownedNodes = [
        ...(family.triggersOwned
          ? family.triggers.map((t) => ruleRef(t.rule.nodeId))
          : []),
        ...family.fanOuts.map((r) => ruleRef(r.nodeId)),
        ...(family.escape !== undefined && !family.escapeShared
          ? [ruleRef(family.escape.nodeId)]
          : []),
        storeRef(family.baseStore.nodeId),
        ...(family.nfdMarks === undefined ? [storeRef(family.outStore.nodeId)] : []),
      ];
      const primary = family.primaryTrigger;
      results.push({
        patternId: `${family.nfdMarks !== undefined ? "deadkey_single_tap_nfd" : "deadkey_single_tap"}#${family.idSuffix}`,
        ownedNodes,
        slotValues: {
          triggerKey:
            primary?.triggerKey ?? family.prefixChar ?? "",
          ...(primary?.triggerStore !== undefined
            ? { triggerStore: primary.triggerStore }
            : {}),
          deadkeyName: formatDkName(family.deadkeyId),
          baseLetters: storeItemsToCharString(family.baseStore),
          ...(family.nfdMarks !== undefined
            ? { markChars: family.nfdMarks.join("") }
            : { accentedForms: storeItemsToCharString(family.outStore) }),
          ...(family.accentChar !== undefined
            ? { accentChar: family.accentChar }
            : {}),
        },
      });
    }
    return results;
  },

  lift(match: MatchResult): Pattern {
    return buildPattern(match);
  },
};

import type { KeyboardIR, IRRule, Pattern } from "@keyboard-studio/contracts";
import { makePattern } from "@keyboard-studio/contracts";
import type { MatchResult, RecognizerRule } from "../types.js";
import { ruleRef } from "../node-refs.js";
import { toUPlus, formatVKeyModifiers } from "../utils.js";

// Format one rule line for the keystrokeCharacterMap slot.
// e.g. + [SHIFT K_Q] > U+0190  or  + [K_Q] > U+025B
function formatMapLine(rule: IRRule): string {
  const ctx = rule.context[0];
  const out = rule.output[0];
  if (
    ctx === undefined ||
    ctx.kind !== "vkey" ||
    out === undefined ||
    out.kind !== "char"
  ) {
    return "";
  }
  const mods = formatVKeyModifiers(ctx.modifiers);
  return `+ [${mods}${ctx.name}] > ${toUPlus(out.value)}`;
}

export function isS01(rule: IRRule, groupName: string): boolean {
  return (
    groupName !== "deadkeys" &&
    rule.context.length === 1 &&
    rule.context[0] !== undefined &&
    rule.context[0].kind === "vkey" &&
    rule.output.length === 1 &&
    rule.output[0] !== undefined &&
    rule.output[0].kind === "char"
  );
}

function buildPattern(matchResult: MatchResult): Pattern {
  return makePattern({
    id: matchResult.patternId,
    title: "Simple swap",
    description: "Direct keystroke-to-character substitution.",
    category: "desktop",
    appliesTo: [],
    strategyId: "S-01",
    origin: "recognized",
    ownedNodes: matchResult.ownedNodes,
    questions: [
      {
        id: "keystrokeCharacterMap",
        prompt: "Keystroke-to-character map (one entry per line: + [MODS KEY] > U+XXXX)",
        // "text" not "store-content": slot contains KMN rule lines, not a store body.
        answerType: "text",
        default: matchResult.slotValues["keystrokeCharacterMap"] ?? "",
      },
    ],
    kmnFragment: "{{keystrokeCharacterMap}}",
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "recognizer",
    reviewDate: new Date().toISOString().slice(0, 10),
  });
}

const S01_MAX_DISTINCT_KEYS = 5; // spec §7.3 S-01: at most 5 extra characters

export const s01Recognizer: RecognizerRule = {
  id: "s01-simple-swap",
  strategyId: "S-01",

  match(ir: KeyboardIR): MatchResult[] {
    const results: MatchResult[] = [];

    for (const group of ir.groups) {
      const matchingRules = group.rules.filter((r) => {
        // Skip rules an earlier recognizer in this pass already claimed, so we
        // never double-claim a node into a second pattern (the #886 ghost
        // chip). NB: this is an independent guard from the identical one in
        // interpreter.ts (findS01Clusters, etc.) — that path serves the
        // generated rules; neither guard implies the other is covered.
        if (r.ownedByPattern !== undefined) return false;
        return isS01(r, group.name);
      });
      if (matchingRules.length === 0) continue;

      // Guard: spec §7.3 S-01 card says "1–5 extra characters" (≤5 inclusive); skip groups with more than 5 distinct base keys.
      const distinctBaseNames = new Set(
        matchingRules
          .map((r) => r.context[0])
          .filter((ctx): ctx is NonNullable<typeof ctx> & { kind: "vkey" } => ctx?.kind === "vkey")
          .map((ctx) => ctx.name),
      );
      if (distinctBaseNames.size > S01_MAX_DISTINCT_KEYS) continue;

      const lines = matchingRules
        .map(formatMapLine)
        .filter((l) => l.length > 0);

      results.push({
        patternId: `simple-swap#${group.name}`,
        ownedNodes: matchingRules.map((r) => ruleRef(r.nodeId)),
        slotValues: {
          keystrokeCharacterMap: lines.join("\n"),
        },
      });
    }

    return results;
  },

  lift(match: MatchResult): Pattern {
    return buildPattern(match);
  },
};

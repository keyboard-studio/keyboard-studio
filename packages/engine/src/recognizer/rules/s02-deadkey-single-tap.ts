import type {
  KeyboardIR,
  IRGroup,
  IRRule,
  Pattern,
} from "@keyboard-studio/contracts";
import { makePattern } from "@keyboard-studio/contracts";
import type { MatchResult, RecognizerRule } from "../types.js";
import { ruleRef, storeRef } from "../node-refs.js";
import { storeItemsToCharString, formatVKeyModifiers, formatDkName } from "../utils.js";

// A trigger is a rule whose output is a single deadkey.
// Context may be a single vkey OR a single char (sil_euro_latin uses char triggers).
function isTrigger(rule: IRRule): boolean {
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "deadkey") return false;
  if (rule.context.length !== 1) return false;
  const ctx = rule.context[0];
  if (ctx === undefined) return false;
  return ctx.kind === "vkey" || ctx.kind === "char";
}

// A body rule has context = [dk(D), any(BASE_STORE)], output = [index(OUT_STORE, 2)].
// offset === 2 (v1.1 scope; non-standard offsets fall back to raw — not matched here).
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

// A fallback rule has context starting with dk(D) but doesn't match body shape.
function isFallback(rule: IRRule, deadkeyId: number): boolean {
  if (isBody(rule)) return false;
  const c0 = rule.context[0];
  return c0 !== undefined && c0.kind === "deadkey" && c0.id === deadkeyId;
}

// Pick the "primary" trigger for naming: prefer the unshifted vkey trigger.
function pickPrimaryTrigger(triggers: IRRule[]): IRRule {
  const unshifted = triggers.find((r) => {
    const ctx = r.context[0];
    return ctx !== undefined && ctx.kind === "vkey" && ctx.modifiers.length === 0;
  });
  return unshifted ?? triggers[0]!;
}

function triggerKeyName(rule: IRRule): string {
  const ctx = rule.context[0];
  if (ctx === undefined) return "";
  if (ctx.kind === "vkey") {
    const mods = formatVKeyModifiers(ctx.modifiers);
    return `${mods}${ctx.name}`;
  }
  // TODO: char-context triggers need a dedicated AnswerType (follow-up issue).
  if (ctx.kind === "char") return ctx.value;
  return "";
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
      {
        id: "accentedForms",
        prompt: "Resulting accented forms",
        answerType: "char-list",
        default: match.slotValues["accentedForms"] ?? "",
      },
    ],
    kmnFragment:
      "+ [{{triggerKey}}] > dk({{deadkeyName}})\n" +
      "dk({{deadkeyName}}) + any({{baseLetters}}) > index({{accentedForms}}, 2)",
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "recognizer",
    reviewDate: new Date().toISOString().slice(0, 10),
  });
}

// Index trigger rules (output = single deadkey) by deadkey id, from every
// non-deadkeys group.
function buildTriggerIndex(ir: KeyboardIR): Map<number, IRRule[]> {
  const triggersByDkId = new Map<number, IRRule[]>();
  for (const group of ir.groups) {
    if (group.name === "deadkeys") continue;
    for (const rule of group.rules) {
      if (rule.ownedByPattern !== undefined) continue;
      if (!isTrigger(rule)) continue;
      const out = rule.output[0];
      if (out === undefined || out.kind !== "deadkey") continue;
      const existing = triggersByDkId.get(out.id) ?? [];
      existing.push(rule);
      triggersByDkId.set(out.id, existing);
    }
  }
  return triggersByDkId;
}

// Index body rules by deadkey id (first body wins per id).
function buildBodyIndex(deadkeysGroup: IRGroup): Map<number, IRRule> {
  const bodyByDkId = new Map<number, IRRule>();
  for (const rule of deadkeysGroup.rules) {
    if (rule.ownedByPattern !== undefined) continue;
    if (!isBody(rule)) continue;
    const c0 = rule.context[0];
    if (c0 === undefined || c0.kind !== "deadkey") continue;
    if (!bodyByDkId.has(c0.id)) bodyByDkId.set(c0.id, rule);
  }
  return bodyByDkId;
}

// Index fallback rules by deadkey id, for the deadkey ids that have a body.
function buildFallbackIndex(
  deadkeysGroup: IRGroup,
  bodyByDkId: Map<number, IRRule>,
): Map<number, IRRule[]> {
  const fallbacksByDkId = new Map<number, IRRule[]>();
  for (const dkId of bodyByDkId.keys()) {
    const fallbacks = deadkeysGroup.rules.filter(
      (r) => r.ownedByPattern === undefined && isFallback(r, dkId),
    );
    if (fallbacks.length > 0) fallbacksByDkId.set(dkId, fallbacks);
  }
  return fallbacksByDkId;
}

// Assemble the MatchResult for one deadkey id, or null when the body's base/out
// stores are missing or non-parallel (Layer A error per spec §10 Check #13).
function buildMatchResult(
  ir: KeyboardIR,
  dkId: number,
  triggers: IRRule[],
  body: IRRule,
  fallbacks: IRRule[],
): MatchResult | null {
  const c1 = body.context[1];
  const outEl = body.output[0];
  if (
    c1 === undefined ||
    c1.kind !== "any" ||
    outEl === undefined ||
    outEl.kind !== "index"
  ) {
    return null;
  }

  const baseStore = ir.stores.find((s) => s.name === c1.storeRef);
  const outStore = ir.stores.find((s) => s.name === outEl.storeRef);
  if (baseStore === undefined || outStore === undefined) return null;
  if (baseStore.items.length !== outStore.items.length) return null;

  const primaryTrigger = pickPrimaryTrigger(triggers);
  const ownedNodes = [
    ...triggers.map((r) => ruleRef(r.nodeId)),
    ruleRef(body.nodeId),
    ...fallbacks.map((r) => ruleRef(r.nodeId)),
    storeRef(baseStore.nodeId),
    storeRef(outStore.nodeId),
  ];

  return {
    patternId: `deadkey-single-tap#${formatDkName(dkId)}`,
    ownedNodes,
    slotValues: {
      triggerKey: triggerKeyName(primaryTrigger),
      deadkeyName: formatDkName(dkId),
      baseLetters: storeItemsToCharString(baseStore),
      accentedForms: storeItemsToCharString(outStore),
    },
  };
}

export const s02Recognizer: RecognizerRule = {
  id: "s02-deadkey-single-tap",
  strategyId: "S-02",

  // High-level orchestration: index triggers/bodies/fallbacks by deadkey id,
  // then emit one MatchResult per deadkey id that has both a trigger and a body.
  match(ir: KeyboardIR): MatchResult[] {
    const deadkeysGroup = ir.groups.find((g) => g.name === "deadkeys");
    if (deadkeysGroup === undefined) return [];

    const triggersByDkId = buildTriggerIndex(ir);
    const bodyByDkId = buildBodyIndex(deadkeysGroup);
    const fallbacksByDkId = buildFallbackIndex(deadkeysGroup, bodyByDkId);

    const results: MatchResult[] = [];
    for (const [dkId, triggers] of triggersByDkId.entries()) {
      const body = bodyByDkId.get(dkId);
      if (body === undefined) continue;
      const result = buildMatchResult(
        ir,
        dkId,
        triggers,
        body,
        fallbacksByDkId.get(dkId) ?? [],
      );
      if (result !== null) results.push(result);
    }
    return results;
  },

  lift(match: MatchResult): Pattern {
    return buildPattern(match);
  },
};

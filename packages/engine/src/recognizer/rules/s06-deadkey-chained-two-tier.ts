/**
 * s06Recognizer — hand recognizer for S-06 (two-trigger chain, library
 * pattern), issue #2235, predicate per queue-2235-ruling.md §3 (see
 * s06-families.ts for the verbatim predicate and the census record).
 *
 * Registered FIRST in DEFAULT_RULES (recognizer/index.ts): recognizePatterns
 * stamps ownedByPattern per rule in order and the S-01/S-02 matchers skip
 * stamped rules, so S-06-first IS the issue's replace/merge-before-lift
 * constraint, satisfied by construction. No merge pass exists or may be
 * improvised — a later second stamp trips assertOwnershipConsistency and
 * fails the whole import. The predicate discipline (the mandatory pure-edge
 * gate in s06-families.ts) is what prevents this recognizer, running first,
 * from stealing genuine S-02 families: a tier-2 resolution is claimed only
 * when its head deadkey is armed through an admitted pure edge from the
 * family deadkey.
 *
 * Naming (ruling §3): rule id `deadkey-chained-two-tier`; cluster type
 * `two-trigger-chained-deadkey`; the lifted Pattern is the library pattern
 * itself, `latin_deadkey_chained_two_tier`, instanced as
 * `latin_deadkey_chained_two_tier#<tier-1 deadkey discriminator>`, titled
 * explicitly "Chained deadkeys (two-tier)" (the interpreter's
 * titleForStrategy would otherwise title it literally "S-06").
 */

import type { KeyboardIR, Pattern } from "@keyboard-studio/contracts";
import { makePattern } from "@keyboard-studio/contracts";
import type { MatchResult, RecognizerRule } from "../types.js";
import { ruleRef } from "../node-refs.js";
import { storeItemsToCharString, formatVKeyModifiers } from "../utils.js";
import {
  deadkeyDiscriminator,
  deadkeyElementKey,
  findS06Families,
  s06CleanedContext,
  type S06Family,
} from "../s06-families.js";

function keyElementLabel(rule: Parameters<typeof s06CleanedContext>[0], index: number): string {
  const el = s06CleanedContext(rule)[index];
  if (el === undefined) return "";
  if (el.kind === "vkey") return `${formatVKeyModifiers(el.modifiers)}${el.name}`;
  if (el.kind === "char") return el.value;
  return "";
}

function slotValuesFor(ir: KeyboardIR, family: S06Family): Record<string, string> {
  const firstArming = family.arming[0];
  const firstSub = family.subClusters[0];
  const firstEdge = firstSub?.edges[0];
  const firstResolution = firstSub?.resolutions[0];

  const storeChars = (storeRef: string | undefined): string => {
    if (storeRef === undefined) return "";
    const store = ir.stores.find((s) => s.name === storeRef);
    return store === undefined ? "" : storeItemsToCharString(store);
  };
  const resolutionStores = (rule: typeof firstResolution) => {
    if (rule === undefined) return { base: "", out: "" };
    const cleaned = s06CleanedContext(rule);
    const anyEl = cleaned[1];
    const outEl = rule.output[0];
    return {
      base: storeChars(anyEl?.kind === "any" ? anyEl.storeRef : undefined),
      out: storeChars(outEl?.kind === "index" ? outEl.storeRef : undefined),
    };
  };

  const res = resolutionStores(firstResolution);
  const tier1 = resolutionStores(family.tier1DirectResolutions[0]);
  const fallbackCharFor = (headKey: string): string => {
    const rule = family.fallbacks.find(
      (r) => deadkeyElementKey(s06CleanedContext(r)[0]!) === headKey,
    );
    const out = rule?.output[0];
    return out?.kind === "char" ? out.value : "";
  };

  return {
    firstTriggerKey: firstArming !== undefined ? keyElementLabel(firstArming, 0) : "",
    secondTriggerKey: firstEdge !== undefined ? keyElementLabel(firstEdge, 1) : "",
    tier1FamilyName: family.familyDisplay,
    tier2AccentName: family.subClusters
      .map((s) => deadkeyDiscriminator(s.tier2Key))
      .join(","),
    baseLetters: res.base,
    chainedOutputs: res.out,
    tier1OnlyOutputs: tier1.out,
    tier1FallbackChar: fallbackCharFor(family.familyKey),
    tier2FallbackChar:
      firstSub !== undefined ? fallbackCharFor(firstSub.tier2Key) : "",
    subClusterCount: String(family.subClusters.length),
  };
}

function buildPattern(match: MatchResult): Pattern {
  const tier2 = match.slotValues["tier2AccentName"] ?? "";
  return makePattern({
    id: match.patternId,
    title: "Chained deadkeys (two-tier)",
    description:
      `Two-trigger chained deadkeys: a first trigger arms the family deadkey ` +
      `${match.slotValues["tier1FamilyName"] ?? ""}, a second trigger arms a tier-2 ` +
      `deadkey (${tier2}), and the following base letter resolves through a ` +
      `parallel index() fan-out. S-06 (two-trigger chain, library pattern) — ` +
      `one sense of S-06; the family-selection and pending-letter senses are ` +
      `not recognized.`,
    category: "desktop",
    appliesTo: [],
    strategyId: "S-06",
    combinesWith: ["S-04", "S-08", "S-11"],
    origin: "recognized",
    ownedNodes: match.ownedNodes,
    questions: [
      {
        id: "firstTriggerKey",
        prompt: "Key that starts the two-key accent sequence (family selector)",
        answerType: "key-name",
        default: match.slotValues["firstTriggerKey"] ?? "",
      },
      {
        id: "secondTriggerKey",
        prompt: "Key pressed after the family selector to choose the accent",
        answerType: "text",
        default: match.slotValues["secondTriggerKey"] ?? "",
      },
      {
        id: "tier1FamilyName",
        prompt: "Internal name of the family (tier-1) deadkey",
        answerType: "text",
        default: match.slotValues["tier1FamilyName"] ?? "",
      },
      {
        id: "tier2AccentName",
        prompt: "Internal name(s) of the tier-2 deadkey(s), comma-separated when the family has several sub-clusters",
        answerType: "text",
        default: match.slotValues["tier2AccentName"] ?? "",
      },
      {
        id: "baseLetters",
        prompt: "Base letters the tier-2 deadkey applies to (first sub-cluster)",
        answerType: "char-list",
        default: match.slotValues["baseLetters"] ?? "",
      },
      {
        id: "chainedOutputs",
        prompt: "Resulting forms for the chained path, in base-letter order (first sub-cluster)",
        answerType: "char-list",
        default: match.slotValues["chainedOutputs"] ?? "",
      },
      {
        id: "tier1OnlyOutputs",
        prompt: "Optional tier-1-only outputs (first trigger + base letter directly)",
        answerType: "char-list",
        required: false,
        default: match.slotValues["tier1OnlyOutputs"] ?? "",
      },
      {
        id: "tier1FallbackChar",
        prompt: "Fallback character for the first trigger on a miss",
        answerType: "char-single",
        required: false,
        default: match.slotValues["tier1FallbackChar"] ?? "",
      },
      {
        id: "tier2FallbackChar",
        prompt: "Fallback character for the second trigger on a miss",
        answerType: "char-single",
        required: false,
        default: match.slotValues["tier2FallbackChar"] ?? "",
      },
    ],
    kmnFragment: [
      "+ [{{firstTriggerKey}}] > dk({{tier1FamilyName}})",
      "dk({{tier1FamilyName}}) + [{{secondTriggerKey}}] > dk({{tier2AccentName}})",
      "dk({{tier2AccentName}}) + any({{baseLetters}}) > index({{chainedOutputs}}, 2)",
    ].join("\n"),
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "recognizer",
    reviewDate: new Date().toISOString().slice(0, 10),
  });
}

export const s06Recognizer: RecognizerRule = {
  id: "deadkey-chained-two-tier",
  strategyId: "S-06",

  match(ir: KeyboardIR): MatchResult[] {
    return findS06Families(ir).map((family) => ({
      patternId: `latin_deadkey_chained_two_tier#${family.discriminator}`,
      ownedNodes: family.ownedRules.map((r) => ruleRef(r.nodeId)),
      slotValues: slotValuesFor(ir, family),
    }));
  },

  lift(match: MatchResult): Pattern {
    return buildPattern(match);
  },
};

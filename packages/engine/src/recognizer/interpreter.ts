import type {
  KeyboardIR,
  IRRule,
  IRGroup,
  IRStore,
} from "@keyboard-studio/contracts";
import { makePattern } from "@keyboard-studio/contracts";
import type { MatchResult } from "./types.js";
import type { Pattern } from "@keyboard-studio/contracts";
import { ruleRef, storeRef } from "./node-refs.js";
import { buildS02Fragment, findS02Families } from "./s02-families.js";
import { toUPlus, storeItemsToCharString, formatVKeyModifiers, formatDkName, isBehaviourOwned } from "./utils.js";
import type {
  RecognizerRuleYaml,
  SlotMapping,
} from "./yaml-schema.js";

// rules_to_keystroke_char_map: produce "+ [MODS KEY] > U+XXXX" lines
function applyRulesToKeystrokeCharMap(rules: IRRule[]): string {
  const lines: string[] = [];
  for (const rule of rules) {
    const ctx = rule.context[0];
    const out = rule.output[0];
    if (
      ctx === undefined ||
      out === undefined ||
      out.kind !== "char"
    ) continue;
    if (ctx.kind === "vkey") {
      const mods = formatVKeyModifiers(ctx.modifiers);
      lines.push(`+ [${mods}${ctx.name}] > ${toUPlus(out.value)}`);
    } else if (ctx.kind === "char") {
      lines.push(`+ "${ctx.value}" > ${toUPlus(out.value)}`);
    }
  }
  return lines.join("\n");
}

// numeric_id_to_label: deadkey id -> underscore-hex label, e.g. 0x0060 -> "dk_0060".
// Delegates to formatDkName so this transform and the hand-written S-02 reference
// rule (s02-deadkey-single-tap.ts) emit byte-identical deadkeyName slot values.
function applyNumericIdToLabel(id: number): string {
  return formatDkName(id);
}

// ---------------------------------------------------------------------------
// Predicate helpers — check a single IRRule against a role definition
// ---------------------------------------------------------------------------

// S-02's role shapes (trigger / fan-out / escape) live in s02-families.ts,
// shared with the hand-written s02Recognizer (issue #2233): one reconciled
// shape definition, so the generated rule and the reference rule cannot
// diverge. The role matchers that used to live here were deleted with it.

// A "single" rule: one vkey-or-char context, one char output, no deadkey or store involvement.
function matchesSingleRole(rule: IRRule): boolean {
  if (rule.context.length !== 1) return false;
  const ctx = rule.context[0];
  if (ctx === undefined) return false;
  if (ctx.kind !== "vkey" && ctx.kind !== "char") return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  return out !== undefined && out.kind === "char";
}

// ---------------------------------------------------------------------------
// Store-constraint validation
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Group guard
// ---------------------------------------------------------------------------

// IRGroup.usingKeys is the correct field per keyboard-ir.ts (boolean, not a name check)
function groupPassesConstraints(group: IRGroup, usingKeys?: boolean): boolean {
  if (usingKeys !== undefined && group.usingKeys !== usingKeys) return false;
  return true;
}

// ---------------------------------------------------------------------------
// S-01 predicate (single-rule-direct cluster)
// ---------------------------------------------------------------------------

interface S01ClusterMatch {
  group: IRGroup;
  rules: IRRule[];
}

function findS01Clusters(ir: KeyboardIR): S01ClusterMatch[] {
  const clusters: S01ClusterMatch[] = [];
  const MAX_DISTINCT_BASE_CHARS = 5;

  for (const group of ir.groups) {
    if (!groupPassesConstraints(group, true)) continue;

    const qualifying = group.rules.filter((rule) => {
      // FR-021: behaviour-owned rules are never pattern candidates.
      if (rule.ownedByPattern !== undefined || isBehaviourOwned(rule)) return false;
      if (!matchesSingleRole(rule)) return false;

      // Disqualify any rule that has deadkey, index, outs, beep, raw in output
      const out = rule.output[0];
      if (out === undefined) return false;
      if (out.kind !== "char") return false;

      // Disqualify if context has store references (storeRef field)
      const ctx = rule.context[0];
      if (ctx === undefined) return false;
      if (ctx.kind === "any" || ctx.kind === "notany") return false;

      return true;
    });

    if (qualifying.length === 0) continue;

    // Count distinct base key names
    const distinctBaseNames = new Set<string>();
    for (const rule of qualifying) {
      const ctx = rule.context[0];
      if (ctx === undefined) continue;
      if (ctx.kind === "vkey") distinctBaseNames.add(ctx.name);
      else if (ctx.kind === "char") distinctBaseNames.add(ctx.value);
    }

    if (distinctBaseNames.size > MAX_DISTINCT_BASE_CHARS) continue;

    clusters.push({ group, rules: qualifying });
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// S-02 predicate (three-rule-deadkey cluster)
// ---------------------------------------------------------------------------

// The S-02 cluster finder is findS02Families in s02-families.ts (shared with
// the hand-written rule since #2233). It returns one family per full cluster
// key (group, deadkey id, prefix char, base store, output store), with the
// escape optional and shared triggers/escapes recorded but not owned.

// ---------------------------------------------------------------------------
// Slot-value population from YAML lifts_to.slot_mapping
// ---------------------------------------------------------------------------

interface ClusterContext {
  clusterRules: IRRule[];
  stores: Map<string, IRStore>;
  triggerRule?: IRRule | undefined;
  escapeRule?: IRRule | undefined;
  fanOutRule?: IRRule | undefined;
  deadkeyId?: number | undefined;
}

function populateSlots(
  mapping: SlotMapping,
  ctx: ClusterContext,
  ir: KeyboardIR,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [slotId, entry] of Object.entries(mapping)) {
    if (entry.source === null) {
      // source=null means skip — user fills in survey
      continue;
    }

    const { source, transform } = entry;

    if (transform === "rules_to_keystroke_char_map") {
      result[slotId] = applyRulesToKeystrokeCharMap(ctx.clusterRules);
      continue;
    }

    // Resolve the source path
    if (source.startsWith("stores[")) {
      // e.g. "stores[S_bases].items"
      const storeNameMatch = /stores\[([^\]]+)\]/.exec(source);
      if (storeNameMatch === null) continue;
      const storeName = storeNameMatch[1];
      if (storeName === undefined) continue;
      const store = ctx.stores.get(storeName) ?? ir.stores.find((s) => s.name === storeName);
      if (store === undefined) continue;
      if (transform === "store_items_to_char_string") {
        result[slotId] = storeItemsToCharString(store);
      }
      continue;
    }

    if (source.startsWith("rules[trigger]")) {
      const rule = ctx.triggerRule;
      if (rule === undefined) continue;

      if (source.includes("context_pattern[0].name")) {
        const ctx0 = rule.context[0];
        if (ctx0 === undefined) continue;
        if (ctx0.kind === "vkey") {
          const mods = formatVKeyModifiers(ctx0.modifiers);
          result[slotId] = `${mods}${ctx0.name}`;
        } else if (ctx0.kind === "char") {
          result[slotId] = ctx0.value;
        }
        continue;
      }

      if (source.includes("output_pattern[0].id")) {
        const out0 = rule.output[0];
        if (out0 === undefined || out0.kind !== "deadkey") continue;
        if (transform === "numeric_id_to_label") {
          result[slotId] = applyNumericIdToLabel(out0.id);
        } else {
          result[slotId] = String(out0.id);
        }
        continue;
      }
      continue;
    }

    if (source.startsWith("rules[escape].output_pattern[0].value")) {
      // accentChar slot: lift from escape rule's output_pattern[0].value
      const rule = ctx.escapeRule;
      if (rule === undefined) continue;
      const out0 = rule.output[0];
      if (out0 === undefined || out0.kind !== "char") continue;
      result[slotId] = out0.value;
      continue;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API: interpretPredicate
// ---------------------------------------------------------------------------

export function interpretPredicate(rule: RecognizerRuleYaml, ir: KeyboardIR): MatchResult[] {
  const clusterType = rule.predicate.cluster_type;
  const results: MatchResult[] = [];

  if (clusterType === "single-rule-direct") {
    const clusters = findS01Clusters(ir);
    for (const cluster of clusters) {
      const slotValues = rule.lifts_to.slot_mapping !== undefined
        ? populateSlots(
            rule.lifts_to.slot_mapping,
            { clusterRules: cluster.rules, stores: new Map() },
            ir,
          )
        : {};

      results.push({
        patternId: `${rule.lifts_to.patternId}#${cluster.group.name}`,
        ownedNodes: cluster.rules.map((r) => ruleRef(r.nodeId)),
        slotValues,
      });
    }
    return results;
  }

  if (clusterType === "three-rule-deadkey") {
    const families = findS02Families(ir);
    for (const family of families) {
      const storesByName = new Map<string, IRStore>([
        ...ir.stores.map((s): [string, IRStore] => [s.name, s]),
      ]);
      // Add abstract YAML aliases so populateSlots can resolve "S_bases" / "S_output"
      // from the YAML slot_mapping without knowing the IR-level store names.
      storesByName.set("S_bases", family.baseStore);
      storesByName.set("S_output", family.outStore);

      const triggerRules = family.triggers.map((t) => t.rule);
      const clusterRules = [
        ...family.fanOuts,
        ...(family.escape !== undefined ? [family.escape] : []),
        ...triggerRules,
      ];

      const slotValues = rule.lifts_to.slot_mapping !== undefined
        ? populateSlots(
            rule.lifts_to.slot_mapping,
            {
              clusterRules,
              stores: storesByName,
              triggerRule: family.primaryTrigger?.rule,
              escapeRule: family.escape,
              fanOutRule: family.fanOuts[0],
              deadkeyId: family.deadkeyId,
            },
            ir,
          )
        : {};

      // Code-level slot completions for the shapes the YAML slot_mapping
      // cannot reach: an any-store trigger's key is its store's sole char
      // (populateSlots only reads vkey/char context elements), a postfix
      // family may have no trigger rule at all (its prefix char is the
      // trigger identity), and the triggerStore slot exists only for the
      // any-store form.
      if (slotValues["triggerKey"] === undefined) {
        slotValues["triggerKey"] =
          family.primaryTrigger?.triggerKey ?? family.prefixChar ?? "";
      }
      if (slotValues["deadkeyName"] === undefined) {
        slotValues["deadkeyName"] = formatDkName(family.deadkeyId);
      }
      if (family.primaryTrigger?.triggerStore !== undefined) {
        slotValues["triggerStore"] = family.primaryTrigger.triggerStore;
      }

      // Owned exactly as the hand-written rule owns: fan-outs and stores
      // always; triggers only when this is the deadkey's sole family; the
      // escape only when no other family shares it.
      const ownedNodes = [
        ...(family.triggersOwned
          ? triggerRules.map((r) => ruleRef(r.nodeId))
          : []),
        ...family.fanOuts.map((r) => ruleRef(r.nodeId)),
        ...(family.escape !== undefined && !family.escapeShared
          ? [ruleRef(family.escape.nodeId)]
          : []),
        storeRef(family.baseStore.nodeId),
        storeRef(family.outStore.nodeId),
      ];

      results.push({
        patternId: `${rule.lifts_to.patternId}#${family.idSuffix}`,
        ownedNodes,
        slotValues: {
          ...slotValues,
          ...(family.hasBeep ? { __hasBeep: "1" } : {}),
        },
      });
    }
    return results;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API: interpretLift
// ---------------------------------------------------------------------------

export function interpretLift(rule: RecognizerRuleYaml, match: MatchResult): Pattern {
  const today = new Date().toISOString().slice(0, 10);

  // Read beep flag from reserved slotValues entry; strip it before passing to makePattern.
  const hasBeep = match.slotValues["__hasBeep"] === "1";
  const cleanSlotValues: Record<string, string> = { ...match.slotValues };
  delete cleanSlotValues["__hasBeep"];

  // Check combinedWith_if for flag_for_human_review actions.
  const combinedWithIf = rule.predicate.combinedWith_if ?? [];
  // flag_for_human_review is a no-op for now — Pattern has no suitable field for
  // a machine-generated review flag without a real keyboard id. Tracked as follow-up.
  void (hasBeep || combinedWithIf.some((e) => e.action === "flag_for_human_review"));

  // Derive questions from slot_mapping
  const questions = buildQuestions(rule, cleanSlotValues);

  // Derive kmnFragment from strategyId defaults
  const kmnFragment = buildKmnFragment(rule.strategyId, cleanSlotValues);

  const patternInit = {
    id: match.patternId,
    title: titleForStrategy(rule.strategyId),
    description: rule.description?.trim() ?? "",
    category: "desktop" as const,
    appliesTo: [] as string[],
    strategyId: rule.strategyId as import("@keyboard-studio/contracts").StrategyId,
    origin: "recognized" as const,
    ownedNodes: match.ownedNodes,
    questions,
    kmnFragment,
    tests: [] as import("@keyboard-studio/contracts").TestVector[],
    validatedForFamilies: [] as string[],
    sourceKeyboards: [] as string[],
    reviewedBy: "recognizer",
    reviewDate: today,
  };

  try {
    return makePattern(patternInit);
  } catch (err) {
    throw new Error(
      `interpretLift: makePattern failed for pattern "${match.patternId}": ${String(err)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers for interpretLift
// ---------------------------------------------------------------------------

function titleForStrategy(strategyId: string): string {
  switch (strategyId) {
    case "S-01": return "Simple swap";
    case "S-02": return "Single-tap deadkey";
    case "S-08": return "Full remap";
    default: return strategyId;
  }
}

function buildQuestions(
  rule: RecognizerRuleYaml,
  slotValues: Record<string, string>,
): import("@keyboard-studio/contracts").PatternQuestion[] {
  const mapping = rule.lifts_to.slot_mapping;
  if (mapping === undefined) return [];

  const questions: import("@keyboard-studio/contracts").PatternQuestion[] = [];

  for (const [slotId, entry] of Object.entries(mapping)) {
    // source=null means user fills in survey — still include the question but without a default
    const defaultValue = slotValues[slotId] ?? "";
    const answerType = inferAnswerType(slotId, entry.transform ?? "none");

    questions.push({
      id: slotId,
      prompt: promptForSlot(slotId),
      answerType,
      ...(defaultValue !== "" ? { default: defaultValue } : {}),
    });
  }

  return questions;
}

function inferAnswerType(
  slotId: string,
  transform: string,
): import("@keyboard-studio/contracts").AnswerType {
  if (transform === "rules_to_keystroke_char_map") return "text";
  if (transform === "store_items_to_char_string") return "char-list";
  if (slotId === "triggerKey") return "key-name";
  if (slotId === "deadkeyName") return "text";
  return "text";
}

function promptForSlot(slotId: string): string {
  switch (slotId) {
    case "keystrokeCharacterMap": return "Keystroke-to-character map (one entry per line: + [MODS KEY] > U+XXXX)";
    case "swapCharDescriptions": return "Human-readable description of each swapped character";
    case "triggerKey": return "Virtual key that triggers the deadkey state";
    case "deadkeyName": return "Internal deadkey name";
    case "baseLetters": return "Base letters the deadkey applies to";
    case "accentedForms": return "Resulting accented forms";
    case "accentChar": return "Bare combining accent character (emitted by escape rule)";
    default: return slotId;
  }
}

function buildKmnFragment(strategyId: string, slotValues: Record<string, string>): string {
  switch (strategyId) {
    case "S-01":
      return "{{keystrokeCharacterMap}}";
    case "S-02":
      // Shared with the hand-written rule (s02-families.ts buildS02Fragment):
      // any-store trigger form when triggerStore is set, escape line only
      // when the family has an escape (accentChar slot present).
      return buildS02Fragment(slotValues);
    default:
      // Fallback: emit placeholders for every known slot value
      return Object.keys(slotValues)
        .map((k) => `{{${k}}}`)
        .join("\n");
  }
}

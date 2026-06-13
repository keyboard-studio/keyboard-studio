import type {
  KeyboardIR,
  IRRule,
  IRGroup,
  IRStore,
  ContextElement,
  OutputElement,
} from "@keyboard-studio/contracts";
import { makePattern } from "@keyboard-studio/contracts";
import type { MatchResult } from "./types.js";
import type { Pattern } from "@keyboard-studio/contracts";
import { ruleRef, storeRef } from "./node-refs.js";
import { toUPlus, storeItemsToCharString } from "./utils.js";
import type {
  RecognizerRuleYaml,
  RuleEntry,
  StoreConstraint,
  CombinedWithEntry,
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
      const mods = ctx.modifiers.length > 0 ? ctx.modifiers.join(" ") + " " : "";
      lines.push(`+ [${mods}${ctx.name}] > ${toUPlus(out.value)}`);
    } else if (ctx.kind === "char") {
      lines.push(`+ "${ctx.value}" > ${toUPlus(out.value)}`);
    }
  }
  return lines.join("\n");
}

// numeric_id_to_label: deadkey id -> "dk<N>"
function applyNumericIdToLabel(id: number): string {
  return "dk" + String(id);
}

// ---------------------------------------------------------------------------
// Predicate helpers — check a single IRRule against a role definition
// ---------------------------------------------------------------------------

// A "trigger" rule: exactly one context element that is vkey or char, output is deadkey.
// Matches isTrigger() in s02-deadkey-single-tap.ts exactly.
function matchesTriggerRole(rule: IRRule): boolean {
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "deadkey") return false;
  // S-02 YAML says count: zero_or_one, but the TS reference implementation
  // requires context.length === 1. We implement what the TS rule does.
  if (rule.context.length !== 1) return false;
  const ctx = rule.context[0];
  if (ctx === undefined) return false;
  return ctx.kind === "vkey" || ctx.kind === "char";
}

// A "fan-out" rule: [deadkey, any] context, [index] output with offset matching any position.
function matchesFanOutRole(rule: IRRule): boolean {
  if (rule.context.length !== 2) return false;
  const c0 = rule.context[0];
  const c1 = rule.context[1];
  if (c0 === undefined || c0.kind !== "deadkey") return false;
  if (c1 === undefined || c1.kind !== "any") return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "index") return false;
  // any() is at position 2 (1-indexed) in context; only offset===2 is supported in v1.1
  return out.offset === 2;
}

// An "escape" rule: [deadkey, vkey] context, [char] output, same dk id as a given trigger.
function matchesEscapeRole(rule: IRRule, deadkeyId: number): boolean {
  if (rule.context.length !== 2) return false;
  const c0 = rule.context[0];
  const c1 = rule.context[1];
  if (c0 === undefined || c0.kind !== "deadkey" || c0.id !== deadkeyId) return false;
  if (c1 === undefined || c1.kind !== "vkey") return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  return out !== undefined && out.kind === "char";
}

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

function checkStoreConstraints(
  constraints: StoreConstraint[],
  resolvedStores: Map<string, IRStore>,
): boolean {
  for (const sc of constraints) {
    const store = resolvedStores.get(sc.store);
    if (store === undefined) return false;

    if (sc.isSystem !== undefined && store.isSystem !== sc.isSystem) return false;

    if (sc.items_kind !== undefined) {
      // All items in the store must match items_kind.
      // kind=any in store items disqualifies when we require char-only items.
      for (const item of store.items) {
        if (item.kind !== sc.items_kind) return false;
      }
    }

    if (sc.same_length_as !== undefined) {
      const other = resolvedStores.get(sc.same_length_as);
      if (other === undefined) return false;
      if (store.items.length !== other.items.length) return false;
    }
  }

  return true;
}

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
      if (rule.ownedByPattern !== undefined) return false;
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

interface S02ClusterMatch {
  triggers: IRRule[];
  fanOut: IRRule;
  escape: IRRule;
  deadkeyId: number;
  baseStore: IRStore;
  outStore: IRStore;
  group: IRGroup;
  hasBeep: boolean;
}

function findS02Clusters(ir: KeyboardIR): S02ClusterMatch[] {
  // Index triggers by deadkey id (from usingKeys=true groups, any name).
  const triggersByDkId = new Map<number, IRRule[]>();
  for (const group of ir.groups) {
    if (!groupPassesConstraints(group, true)) continue;
    for (const rule of group.rules) {
      if (rule.ownedByPattern !== undefined) continue;
      if (!matchesTriggerRole(rule)) continue;
      const out = rule.output[0];
      if (out === undefined || out.kind !== "deadkey") continue;
      const existing = triggersByDkId.get(out.id) ?? [];
      existing.push(rule);
      triggersByDkId.set(out.id, existing);
    }
  }

  // Index fan-out rules by deadkey id across ALL groups (no name filter).
  // Also track which group each fan-out lives in, so we can find escape in
  // the same group and check the usingKeys constraint.
  const fanOutByDkId = new Map<number, { rule: IRRule; group: IRGroup }>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.ownedByPattern !== undefined) continue;
      if (!matchesFanOutRole(rule)) continue;
      const c0 = rule.context[0];
      if (c0 === undefined || c0.kind !== "deadkey") continue;
      if (!fanOutByDkId.has(c0.id)) {
        fanOutByDkId.set(c0.id, { rule, group });
      }
    }
  }

  const clusters: S02ClusterMatch[] = [];

  for (const [dkId, triggers] of triggersByDkId.entries()) {
    const fanOutEntry = fanOutByDkId.get(dkId);
    if (fanOutEntry === undefined) continue;
    const { rule: fanOut, group: deadkeyGroup } = fanOutEntry;

    // Fan-out group must not be a usingKeys=true group (triggers are usingKeys=true;
    // the deadkey group that holds fan-out/escape is typically usingKeys=false).
    // Reject any dkId where triggers and fan-out share the same group instance.
    const triggerGroupOwnsAll = triggers.every((t) =>
      deadkeyGroup.rules.includes(t),
    );
    if (triggerGroupOwnsAll) continue;

    const c1 = fanOut.context[1];
    const outEl = fanOut.output[0];
    if (
      c1 === undefined ||
      c1.kind !== "any" ||
      outEl === undefined ||
      outEl.kind !== "index"
    ) continue;

    const baseStore = ir.stores.find((s) => s.name === c1.storeRef);
    const outStore = ir.stores.find((s) => s.name === outEl.storeRef);
    if (baseStore === undefined || outStore === undefined) continue;

    // Parallel-store length invariant
    if (baseStore.items.length !== outStore.items.length) continue;

    // Store items must be char-only (disqualify if any non-char item)
    const baseAllChar = baseStore.items.every((item) => item.kind === "char");
    const outAllChar = outStore.items.every((item) => item.kind === "char");
    if (!baseAllChar || !outAllChar) continue;

    // Find escape rule in the SAME group as fan-out (no name filter).
    const escape = deadkeyGroup.rules.find(
      (r) => r.ownedByPattern === undefined && matchesEscapeRole(r, dkId),
    );
    if (escape === undefined) continue;

    // Check for beep in any rule in the deadkey group with this dk id.
    const hasBeep = deadkeyGroup.rules.some((r) => {
      const c0 = r.context[0];
      if (c0 === undefined || c0.kind !== "deadkey" || c0.id !== dkId) return false;
      return r.output.some((el) => el.kind === "beep");
    });

    clusters.push({
      triggers,
      fanOut,
      escape,
      deadkeyId: dkId,
      baseStore,
      outStore,
      group: deadkeyGroup,
      hasBeep,
    });
  }

  return clusters;
}

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
          const mods = ctx0.modifiers.length > 0 ? ctx0.modifiers.join(" ") + " " : "";
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
    const clusters = findS02Clusters(ir);
    for (const cluster of clusters) {
      const storesByName = new Map<string, IRStore>([
        ...ir.stores.map((s): [string, IRStore] => [s.name, s]),
      ]);
      // Add abstract YAML aliases so populateSlots can resolve "S_bases" / "S_output"
      // from the YAML slot_mapping without knowing the IR-level store names.
      storesByName.set("S_bases", cluster.baseStore);
      storesByName.set("S_output", cluster.outStore);

      const canonicalTrigger =
        cluster.triggers.find((r) => {
          const ctx = r.context[0];
          return ctx?.kind === "vkey" && ctx.modifiers.length === 0;
        }) ?? cluster.triggers[0];

      const slotValues = rule.lifts_to.slot_mapping !== undefined
        ? populateSlots(
            rule.lifts_to.slot_mapping,
            {
              clusterRules: [cluster.fanOut, cluster.escape, ...cluster.triggers],
              stores: storesByName,
              triggerRule: canonicalTrigger,
              escapeRule: cluster.escape,
              fanOutRule: cluster.fanOut,
              deadkeyId: cluster.deadkeyId,
            },
            ir,
          )
        : {};

      const ownedNodes = [
        ...cluster.triggers.map((r) => ruleRef(r.nodeId)),
        ruleRef(cluster.fanOut.nodeId),
        ruleRef(cluster.escape.nodeId),
        storeRef(cluster.baseStore.nodeId),
        storeRef(cluster.outStore.nodeId),
      ];

      const suffix = `dk_${cluster.deadkeyId.toString(16).toUpperCase().padStart(4, "0")}`;
      const patternIdBase = `${rule.lifts_to.patternId}#${suffix}`;

      results.push({
        patternId: patternIdBase,
        ownedNodes,
        slotValues: {
          ...slotValues,
          ...(cluster.hasBeep ? { __hasBeep: "1" } : {}),
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
      // Use slot names that match the YAML slot_mapping keys
      return (
        "+ [{{triggerKey}}] > dk({{deadkeyName}})\n" +
        "dk({{deadkeyName}}) + any({{baseLetters}}) > index({{accentedForms}}, 2)\n" +
        "dk({{deadkeyName}}) + [{{triggerKey}}] > {{accentChar}}"
      );
    default:
      // Fallback: emit placeholders for every known slot value
      return Object.keys(slotValues)
        .map((k) => `{{${k}}}`)
        .join("\n");
  }
}

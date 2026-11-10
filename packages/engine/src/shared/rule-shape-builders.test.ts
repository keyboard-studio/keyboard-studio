/**
 * makeRule / withRuleParts must produce exactly the rule object the codec
 * parser produces for the same source (spec 116 FR-036). Lives engine-side
 * because contracts cannot import the codec.
 */
import { describe, expect, it } from "vitest";
import type { IRGroup, IRRule } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import {
  makeRule,
  ruleConditions,
  ruleHasNulContext,
  ruleKeystroke,
  ruleLhsKind,
  rulePreContext,
  withRuleParts,
} from "./rule-shape.js";

function header(groupLine: string, body: string): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&NAME) 'T'",
    "store(s) 'ab'",
    "begin Unicode > use(main)",
    groupLine,
    body,
    "",
  ].join("\n");
}

function firstRule(body: string, usingKeys = true): { rule: IRRule; group: IRGroup } {
  const groupLine = usingKeys ? "group(main) using keys" : "group(main)";
  const { ir } = parse(header(groupLine, body), "t");
  const group = ir.groups.find((g) => g.name === "main");
  if (!group) throw new Error("no main group");
  const rule = group.rules[0];
  if (!rule) throw new Error(`no rule parsed from: ${body}`);
  return { rule, group };
}

/** Rebuild a rule from its parsed parts through the readers + makeRule. */
function rebuild(rule: IRRule, group: IRGroup): IRRule {
  const parts: Parameters<typeof makeRule>[0] = {
    lhsKind: ruleLhsKind(rule),
    nulContext: ruleHasNulContext(rule),
    conditions: ruleConditions(rule),
    preContext: rulePreContext(rule, group),
    output: rule.output,
    nodeId: rule.nodeId,
  };
  const keystroke = ruleKeystroke(rule, group);
  if (keystroke !== undefined) parts.keystroke = keystroke;
  if (rule.trailingComment !== undefined) parts.trailingComment = rule.trailingComment;
  if (rule.targetSelector !== undefined) parts.targetSelector = rule.targetSelector;
  if (rule.sourceLine !== undefined) parts.sourceLine = rule.sourceLine;
  return makeRule(parts, group);
}

const KEYS_CASES: Array<[string, string]> = [
  ["bare vkey, no +", "+ [K_A] > 'x'"],
  ["inline +", "'a' + [K_A] > 'x'"],
  ["inline + with two pre-context chars", "'a' 'b' + [K_A] > 'x'"],
  ["any() keystroke", "'a' + any(s) > index(s,2)"],
  ["leading nul", "nul + [K_A] > 'x'"],
  ["head if() guard", "if(&platform = 'touch') 'a' + [K_A] > 'x'"],
  ["if() guard then any() and a literal keystroke", "if(&platform = 'touch') any(s) + 'k' > index(s,2)"],
  ["trailing comment", "'a' + [K_A] > 'x' c note"],
  ["target selector", "$keymanweb: 'a' + [K_A] > 'x'"],
  ["match", "match > use(main)"],
  ["nomatch", "nomatch > use(main)"],
];

describe("makeRule equals the codec parse() output (using keys)", () => {
  for (const [label, body] of KEYS_CASES) {
    it(label, () => {
      const { rule, group } = firstRule(body);
      expect(rebuild(rule, group)).toEqual(rule);
      expect(withRuleParts(rule, group, {})).toEqual(rule);
    });
  }
});

describe("makeRule equals the codec parse() output (group not using keys)", () => {
  for (const [label, body] of [
    ["pre-context only", "'a' 'b' > 'x'"],
    ["deadkey context", "dk(1) 'a' > 'x'"],
  ] as Array<[string, string]>) {
    it(label, () => {
      const { rule, group } = firstRule(body, false);
      expect(rebuild(rule, group)).toEqual(rule);
    });
  }
});

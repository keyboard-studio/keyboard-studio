// ruleNaming — firedRule → IR rule → author-language owner name (spec 082, FR-002).
//
// FR-002 requires the demo pane's per-keystroke trace to name the rule or
// behaviour that fired "in author language … never bare rule indices". The
// naming resolution, in order:
//
//   1. `ownedByBehaviour` (076 FR-002 — defensive read: the field lands with
//      the 076 foundation, which is not in the tree yet) → the behaviour's
//      human name, humanized from its id when no behaviour record is handy.
//   2. `ownedByPattern` → the pattern's gallery title when the pattern
//      library can supply it (async, cached — see `usePatternTitle`), else
//      the humanized pattern id. A stable id is author-meaningful; a bare
//      rule index is not.
//   3. Otherwise a plain-language summary of the rule's shape ("a rule
//      matching `n` + `g` → outputs `ŋ`"), derived from the IR
//      ContextElement[]/OutputElement[] — never a bare index.
//
// When the (group, ruleIndex) pair does not resolve to an IR rule (compiled
// order drifted from IR order, or the IR is unavailable), the fired trace's
// own matchedContext/emittedOutput carry the author-language description.

import type {
  ContextElement,
  IRRule,
  OutputElement,
} from "@keyboard-studio/contracts";
import type { FiredRuleTrace } from "./demoSimulation.ts";

/** `latin_deadkey_acute` → `Latin deadkey acute`. */
export function humanizeId(id: string): string {
  const words = id.replace(/[_-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return id;
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Ownership reads
// ---------------------------------------------------------------------------

/**
 * The behaviour that owns a rule, from `IRRule.ownedByBehaviour`
 * (`"<packId>/<behaviourId>"`, stamped by rule-pack install — spec 082
 * FR-015). Returns the behaviour id (the displayable segment); a bare
 * behaviour id with no pack prefix (the 076-literal form) is returned as-is.
 */
function ownedByBehaviourOf(rule: IRRule): string | undefined {
  const v = rule.ownedByBehaviour;
  if (typeof v !== "string" || v === "") return undefined;
  const slash = v.indexOf("/");
  return slash === -1 ? v : v.slice(slash + 1);
}

/** A pack id, if a future pack-install path stamps one on the rule directly. */
function ownedByPackOf(rule: IRRule): string | undefined {
  const v: unknown = (rule as { ownedByPack?: unknown }).ownedByPack;
  return typeof v === "string" && v !== "" ? v : undefined;
}

// ---------------------------------------------------------------------------
// Rule-shape summaries — the "never a bare index" fallback
// ---------------------------------------------------------------------------

function contextElementText(el: ContextElement): string {
  switch (el.kind) {
    case "char":
      return `\`${el.value}\``;
    case "vkey":
      return el.modifiers.length > 0 ? `${el.modifiers.join("+")}+${el.name}` : el.name;
    case "deadkey":
      return `deadkey(${el.id})`;
    case "any":
      return `any(${el.storeRef})`;
    case "notany":
      return `notany(${el.storeRef})`;
    case "context":
      return `context(${el.offset})`;
    case "index":
      return `index(${el.storeRef}, ${el.offset})`;
    case "baselayout":
      return `baselayout(${el.value})`;
    case "raw":
      return el.text;
  }
}

function outputElementText(el: OutputElement): string {
  switch (el.kind) {
    case "char":
      return `\`${el.value}\``;
    case "deadkey":
      return `deadkey(${el.id})`;
    case "beep":
      return "beep";
    case "nul":
      return "nul";
    case "context":
      return el.offset === 0 ? "context" : `context(${el.offset})`;
    case "index":
      return `index(${el.storeRef}, ${el.offset})`;
    case "outs":
      return `outs(${el.storeRef})`;
    case "useGroup":
      return `use(${el.groupName})`;
    case "raw":
      return el.text;
  }
}

/**
 * Plain-language summary of one IR rule's shape, e.g.
 * `rule matching \`n\` + \`g\` → outputs \`ŋ\``,
 * `rule matching \`5\` + acute → no output` (swallow),
 * `rule matching \`a\` → deadkey(3)` (deadkey arming).
 */
export function describeRuleShape(rule: IRRule): string {
  const context = rule.context.map(contextElementText).join(" + ") || "anything";
  const output = rule.output.map(outputElementText).join(" + ");
  const rhs = output === "" ? "no output" : `outputs ${output}`;
  return `rule matching ${context} → ${rhs}`;
}

// ---------------------------------------------------------------------------
// IR lookup: (group name, rule index) → IRRule
//
// The lookup itself lives in firedRuleMapping.ts: `ruleIndex` is the COMPILED
// ordinal (kmc reorders rules), so the resolver goes through the compiled
// marker's `// Line N` → `IRRule.sourceLine`, never through positional
// indexing into `ir.groups[].rules[]`.
// ---------------------------------------------------------------------------

/** Resolves a fired-rule trace to its IR rule, or `undefined` when unmappable. */
export type FiredRuleResolver = (fired: FiredRuleTrace) => IRRule | undefined;

// ---------------------------------------------------------------------------
// Author-language naming
// ---------------------------------------------------------------------------

export interface FiredRuleName {
  /** The author-language name — never a bare index. */
  name: string;
  /**
   * Where the name came from: an owner id, or the rule-shape / trace-context
   * fallback. Lets the pane style owners and fallbacks differently.
   */
  provenance: "behaviour" | "pattern" | "pack" | "shape" | "trace-context" | "unknown";
}

/**
 * Name a fired rule in author language.
 *
 * `resolveRule` maps the trace to its IR rule via the compiled-ordinal →
 * source-line bridge (firedRuleMapping.ts) — never positional indexing.
 * `patternTitle` is an optional synchronous title lookup (the demo pane feeds
 * it from its cached async pattern-library resolution); when absent the
 * humanized pattern id is used — still author-meaningful, never an index.
 */
export function nameFiredRule(
  fired: FiredRuleTrace,
  resolveRule: FiredRuleResolver,
  patternTitle?: (patternId: string) => string | undefined,
): FiredRuleName {
  const rule = resolveRule(fired);
  if (rule !== undefined) {
    const behaviour = ownedByBehaviourOf(rule);
    if (behaviour !== undefined) {
      return { name: humanizeId(behaviour), provenance: "behaviour" };
    }
    const pack = ownedByPackOf(rule);
    if (pack !== undefined) {
      return { name: `${humanizeId(pack)} (rule pack)`, provenance: "pack" };
    }
    if (rule.ownedByPattern !== undefined && rule.ownedByPattern !== "") {
      const title = patternTitle?.(rule.ownedByPattern) ?? humanizeId(rule.ownedByPattern);
      return { name: title, provenance: "pattern" };
    }
    return { name: describeRuleShape(rule), provenance: "shape" };
  }
  // The (group, ruleIndex) pair did not resolve — describe the trace itself.
  if (fired.matchedContext !== undefined || fired.emittedOutput !== undefined) {
    const matched = fired.matchedContext ?? "—";
    const emitted = fired.emittedOutput ?? "no output";
    return {
      name: `rule matching ${matched} → ${emitted}`,
      provenance: "trace-context",
    };
  }
  return { name: `a rule in the \`${fired.group}\` group`, provenance: "unknown" };
}

/**
 * The one-line trace caption for a keystroke, in author language:
 * `<family> — <owner> — matched <context>, <output>` (US-1's shape:
 * "Diacritic blocking — Swallow mark after non-letter (card 2) — matched `5` + acute,
 * re-emitted context"). FR-018: the trace names the family as well as the fired rule.
 * The family segment is omitted when the rule doesn't resolve or has no family.
 */
export function firedRuleCaption(
  fired: FiredRuleTrace,
  resolveRule: FiredRuleResolver,
  patternTitle?: (patternId: string) => string | undefined,
  familyNameFor?: (rule: IRRule) => string | undefined,
): string {
  const rule = resolveRule(fired);
  const { name } = nameFiredRule(fired, () => rule, patternTitle);
  const parts: string[] = [];
  const family = rule !== undefined ? familyNameFor?.(rule) : undefined;
  if (family !== undefined && family !== "") parts.push(family);
  parts.push(name);
  if (fired.matchedContext !== undefined) parts.push(`matched ${fired.matchedContext}`);
  if (fired.emittedOutput !== undefined) parts.push(`emitted ${fired.emittedOutput}`);
  return parts.join(" — ");
}

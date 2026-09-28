// demoTrace — build the Track A demo pane's per-keystroke rows (spec 082, FR-002/FR-003).
//
// Pure function of (typed keys, SimulationResult, IR, host layout): one row
// per keystroke carrying the stored code points, the rendered glyphs, the
// author-language fired-rule caption (or the graceful no-rule fallback), and
// the per-row host-consequence label for the blocking demonstration. No
// React, no stores — unit-testable in isolation.

import type { SimulationResult } from "@keyboard-studio/contracts";
import {
  codePointsOf,
  describeDelta,
  extractFiredRule,
  traceHasFiredRules,
  type DemoKey,
} from "./demoSimulation.ts";
import { firedRuleCaption, type FiredRuleResolver } from "./ruleNaming.ts";
import { hostCharFor, hostLayoutById, type HostLayoutId } from "./hostLayouts.ts";

export interface DemoTraceRow {
  index: number;
  /** The character the author typed. */
  typedChar: string;
  /** Physical-key label, e.g. "K_5", "Shift+K_A", "U_0301". */
  vkeyLabel: string;
  /** Stored code points after this keystroke, e.g. "U+0035". */
  codePoints: string;
  /** The rendered glyphs (outputAfter as text). */
  rendered: string;
  /** Short before→after delta: `+"x"`, `−"y"`, `→ "z"`, or `—`. */
  delta: string;
  /** True when this keystroke armed a deadkey. */
  deadkeyArmed: boolean;
  /** True when this keystroke changed nothing and armed nothing. */
  swallowed: boolean;
  /**
   * Author-language fired-rule caption (`<owner> — matched <ctx>, emitted
   * <out>`), or null when the step carries no firedRule.
   */
  firedCaption: string | null;
  /** Graceful text for the no-firedRule case (FR-002: never a bare index). */
  noRuleText: string;
  /** What the selected host layout would emit for this physical key. */
  hostChar: string | null;
  /**
   * Per-row host-consequence label for the blocking demonstration — set only
   * when the keystroke was swallowed. Null otherwise.
   */
  hostConsequence: string | null;
}

export interface BuildDemoTraceRowsArgs {
  keys: DemoKey[];
  result: SimulationResult;
  /**
   * Maps a fired-rule trace to its IR rule via the compiled-ordinal →
   * source-line bridge (firedRuleMapping.ts). The pane builds it from the
   * working-copy IR and the compiled JS source.
   */
  resolveRule: FiredRuleResolver;
  hostLayout: HostLayoutId;
  /** Synchronous pattern-title lookup (cached async resolution in the pane). */
  patternTitle?: (patternId: string) => string | undefined;
  /**
   * Family name for a resolved IR rule (FR-018: the trace names the family as
   * well as the fired rule). Omitted in tests that don't build families.
   */
  familyNameFor?: (rule: IRRule) => string | undefined;
}

function vkeyLabelFor(key: DemoKey): string {
  return key.shift ? `Shift+${key.vkey}` : key.vkey;
}

export interface HostConsequenceInput {
  hostLayout: HostLayoutId;
  /** Display label of the selected host layout, e.g. "US International". */
  layoutLabel: string;
  /** Physical key id for the no-table-entry fallback, e.g. "K_A". */
  vkey: string;
  /**
   * What the host layout emits for this key: a character, "" for a dead-key
   * position, or null when the demo table has no entry.
   */
  hostChar: string | null;
}

/**
 * The per-row host-consequence label for a swallowed keystroke (spec 082
 * FR-003 / 1802 A2): plain description of what the keyboard did and what the
 * host would have done — never the retired "Allow means unpredictable;
 * Block means predictable" framing. Exported so the copy-absence test can
 * exercise every branch directly.
 */
export function hostConsequenceFor({
  hostLayout,
  layoutLabel,
  vkey,
  hostChar,
}: HostConsequenceInput): string {
  if (hostLayout === "blocked") {
    return "Blocked here — the keyboard emitted nothing, and this host layout would emit nothing either.";
  }
  if (hostChar === "") {
    return `Blocked here — the keyboard emitted nothing; on ${layoutLabel} this key is a dead-key position — it waits for the next press.`;
  }
  if (hostChar !== null) {
    return `Blocked here — the keyboard emitted nothing; on ${layoutLabel} this key would have typed “${hostChar}”.`;
  }
  return `Blocked here — the keyboard emitted nothing. (No host-table entry for ${vkey} — the demo table is approximate.)`;
}

/**
 * Build one row per keystroke. Defensive about trace/key length drift: rows
 * cover the overlap and never throw on a ragged result.
 */
export function buildDemoTraceRows(args: BuildDemoTraceRowsArgs): DemoTraceRow[] {
  const { keys, result, resolveRule, hostLayout, patternTitle, familyNameFor } = args;
  const enrichmentPresent = traceHasFiredRules(result.trace);
  const layoutLabel = hostLayoutById(hostLayout).label;
  const rows: DemoTraceRow[] = [];
  const count = Math.min(keys.length, result.trace.length);
  for (let i = 0; i < count; i++) {
    const key = keys[i]!;
    const step = result.trace[i]!;
    const before = i === 0 ? "" : (result.trace[i - 1]?.outputAfter ?? "");
    const after = step.outputAfter;
    const prevDeadkeys = i === 0 ? 0 : (result.trace[i - 1]?.pendingDeadkeys.length ?? 0);
    const deadkeyArmed = step.pendingDeadkeys.length > prevDeadkeys;
    const swallowed = after === before && !deadkeyArmed && !step.beep;
    const fired = extractFiredRule(step);
    const firedCaption =
      fired !== undefined
        ? firedRuleCaption(fired, resolveRule, patternTitle, familyNameFor)
        : null;
    const noRuleText = enrichmentPresent
      ? `No rule fired — ${swallowed ? "nothing was emitted" : deadkeyArmed ? "a deadkey was armed" : "the key fell through to default output"}.`
      : "Output only — the simulator did not name a rule for this keystroke.";
    // Host fall-through preview: the static table, falling back to the typed
    // character itself for U_XXXX unicode-key events (a unicode key event
    // types that character on any host).
    const hostChar =
      hostCharFor(hostLayout, key.vkey, { shift: key.shift }) ??
      (key.vkey.startsWith("U_") ? key.char : null);
    const hostConsequence = swallowed
      ? hostConsequenceFor({ hostLayout, layoutLabel, vkey: key.vkey, hostChar })
      : null;
    rows.push({
      index: i,
      typedChar: key.char,
      vkeyLabel: vkeyLabelFor(key),
      codePoints: codePointsOf(after),
      rendered: after,
      delta: describeDelta(before, after),
      deadkeyArmed,
      swallowed,
      firedCaption,
      noRuleText,
      hostChar,
      hostConsequence,
    });
  }
  return rows;
}

/**
 * Whether the run's trace carried any fired-rule enrichment. The pane uses
 * this to decide between "no rule fired" (enrichment present) and the
 * output-only fallback note (enrichment absent — the sibling workstream
 * hasn't landed yet).
 */
export function demoTraceHasFiredRules(result: SimulationResult): boolean {
  return traceHasFiredRules(result.trace);
}

/** Re-export for the pane's pattern-title prefetch. */
export { extractFiredRule };

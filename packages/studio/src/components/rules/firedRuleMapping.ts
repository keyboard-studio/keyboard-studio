// firedRuleMapping — map a fired rule's COMPILED ordinal back to its IR rule
// (spec 082, FR-002; workstream 1 follow-up).
//
// `SimulationStep.firedRule.ruleIndex` is the rule's 0-based ordinal WITHIN
// ITS GROUP IN COMPILED SOURCE ORDER — the k-th rule-match marker
// (`r=m=1;`, or `r=1;` for `nomatch`) in the compiled group function body.
// kmc REORDERS rules (verified: the deadkey-match rule is hoisted above the
// deadkey-setting rule), so indexing `ir.groups[i].rules[ruleIndex]` is
// WRONG — it silently names the wrong rule whenever kmc reorders.
//
// The correct bridge is the `// Line N` comment kmc-kmn emits after most
// markers (the KMN source line of the rule) paired with the codec parser's
// `IRRule.sourceLine` (the 1-based .kmn line the rule was parsed from).
// Both refer to the same .kmn text — the one the compile pipeline fed kmc —
// so the mapping is order-independent: marker ordinal k → `// Line N` → the
// IR rule with `sourceLine === N`, regardless of where kmc moved the rule.
//
// The marker enumeration below replicates the engine's
// `instrumentFiredRuleTracking` ordinal semantics
// (packages/engine/src/simulator/firedRuleTracker.ts) — markers counted per
// group function in source order, `nomatch` markers included — so the
// studio's ordinal k is the engine's ordinal k. The compiled shape is
// machine-generated stock kmc-kmn output; the engine's own docstring calls
// it stable across the kmc versions the studio ships.
//
// Graceful degradation: when the marker has no `// Line N`, when no IR rule
// carries that source line (e.g. a rule the re-emit path renumbered), or
// when several do, the resolver returns `undefined` and the caller falls
// back to the trace-context naming (`matchedContext`/`emittedOutput`) —
// never a misattributed owner, never a bare index.

import type { IRRule, KeyboardIR, OutputElement } from "@keyboard-studio/contracts";
import type { FiredRuleTrace } from "./demoSimulation.ts";

/** Matches `this.g_<name>_<n> = function(` — kmc-kmn's group function shape. */
const GROUP_FN_RE = /this\.(g_[A-Za-z0-9_]+)\s*=\s*function\s*\(/g;

/** Matches kmc-kmn's rule-match markers: `r=m=1;` and the `nomatch` form `r=1;`. */
const RULE_MARKER_RE = /\br\s*=\s*(?:m\s*=\s*)?1\s*;/g;

/** Matches the `// Line N` comment kmc-kmn emits after most markers. */
const LINE_COMMENT_RE = /\/\/\s*Line\s+(\d+)/;

/** Recovers the KMN group name from `g_<name>_<n>` — the engine's exact pattern. */
const GROUP_NAME_RE = /^g_(.+)_\d+$/;

/**
 * For every compiled group function, in source order: the group name and the
 * KMN source line (`// Line N`) of each rule-match marker, in marker order.
 * A `null` entry means the marker carried no line comment.
 *
 * Group boundaries are consecutive `this.g_… = function(` starts: kmc emits
 * group functions as sequential top-level assignments, so the markers
 * between one group start and the next belong to the earlier group. This
 * yields the same ordinals as the engine's balanced-brace scan without
 * re-implementing it.
 */
export function enumerateGroupRuleSrcLines(
  jsSource: string,
): Array<{ groupName: string; srcLines: Array<number | null> }> {
  const starts: Array<{ index: number; fnName: string }> = [];
  GROUP_FN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GROUP_FN_RE.exec(jsSource)) !== null) {
    starts.push({ index: m.index, fnName: m[1]! });
  }
  const result: Array<{ groupName: string; srcLines: Array<number | null> }> = [];
  for (let i = 0; i < starts.length; i++) {
    const nameMatch = GROUP_NAME_RE.exec(starts[i]!.fnName);
    if (!nameMatch) continue;
    const groupName = nameMatch[1]!;
    const regionEnd = i + 1 < starts.length ? starts[i + 1]!.index : jsSource.length;
    const region = jsSource.slice(starts[i]!.index, regionEnd);
    const srcLines: Array<number | null> = [];
    RULE_MARKER_RE.lastIndex = 0;
    let marker: RegExpExecArray | null;
    while ((marker = RULE_MARKER_RE.exec(region)) !== null) {
      const lineEnd = region.indexOf("\n", marker.index);
      const lineTail = region.slice(marker.index, lineEnd === -1 ? region.length : lineEnd);
      const lineMatch = LINE_COMMENT_RE.exec(lineTail);
      srcLines.push(lineMatch ? parseInt(lineMatch[1]!, 10) : null);
    }
    result.push({ groupName, srcLines });
  }
  return result;
}

/** True when the rule's output can produce text (vs `> nul`, beep, deadkey-only). */
function ruleEmitsText(rule: IRRule): boolean {
  return rule.output.some(
    (el: OutputElement) => el.kind === "char" || el.kind === "index" || el.kind === "outs",
  );
}

/**
 * Build a resolver mapping fired-rule traces to IR rules.
 *
 * The resolver is order-independent (see module docstring): it goes through
 * the compiled marker's `// Line N` → `IRRule.sourceLine`, never through
 * positional indexing. Returns `undefined` for any trace it cannot map
 * confidently — including when `jsSource` is absent, in which case every
 * trace is unresolvable and callers use the trace-context fallback.
 */
export function buildFiredRuleResolver(
  ir: KeyboardIR | null,
  jsSource: string | null,
): (fired: FiredRuleTrace) => IRRule | undefined {
  // (group name, ordinal) → KMN source line, mirroring the engine's ordinals.
  const srcLineByGroupOrdinal = new Map<string, Array<number | null>>();
  if (jsSource !== null) {
    for (const { groupName, srcLines } of enumerateGroupRuleSrcLines(jsSource)) {
      const existing = srcLineByGroupOrdinal.get(groupName);
      // kmc emits one function per group; concatenate defensively if not.
      srcLineByGroupOrdinal.set(
        groupName,
        existing !== undefined ? [...existing, ...srcLines] : srcLines,
      );
    }
  }

  return (fired: FiredRuleTrace): IRRule | undefined => {
    if (ir === null) return undefined;
    const srcLines = srcLineByGroupOrdinal.get(fired.group);
    if (srcLines === undefined) return undefined;
    if (fired.ruleIndex < 0 || fired.ruleIndex >= srcLines.length) return undefined;
    const srcLine = srcLines[fired.ruleIndex];
    if (srcLine === null) return undefined;
    const group = ir.groups.find((g) => g.name === fired.group);
    if (group === undefined) return undefined;
    const candidates = group.rules.filter((r) => r.sourceLine === srcLine);
    if (candidates.length !== 1) return undefined;
    const candidate = candidates[0]!;
    // Emit-profile consistency guard: a stale sourceLine (the re-emit path
    // can renumber lines) must not misattribute an owner. The fired trace
    // reports what the rule actually emitted — a `> nul` candidate for a
    // text-emitting hit (or vice versa) is rejected, not misnamed.
    if (fired.emittedOutput !== undefined) {
      const emittedText = fired.emittedOutput !== "";
      if (emittedText !== ruleEmitsText(candidate)) return undefined;
    }
    return candidate;
  };
}

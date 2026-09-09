// Probe enumeration and outcome classification.
//
// The harness deliberately enumerates its probes ITSELF rather than reading
// back what the transform decided to touch, for two reasons:
//
//  1. `resolveKeyPart` (validator/context-tolerance.ts) collapses an
//     `any(keyStore)` key part to its FIRST member. A harness that reused it
//     would press exactly the key the transform measured, and would therefore
//     never see the other members — which is precisely where the transform
//     bakes a literal output that is wrong. So `resolveAllKeys` below returns
//     every member.
//  2. Regressions do not respect rule boundaries. A generated rule with a
//     longer context can out-rank a rule the transform never looked at, so
//     the probe set includes NON-decomposable context characters too (an
//     unaccented vowel, not just an accented one): those are the pairs that
//     were already correct and must stay that way.

import type { ContextElement, KeyboardIR, SimKeyInput } from "@keyboard-studio/contracts";

// Import order matters. The vendored KeymanWeb modules have a static-init
// cycle (defaultLayouts <-> jsKeyboard) that only resolves when the
// simulator barrel is evaluated first; validator/context-tolerance.js pulls
// it in, and reverseUsLayout.js on its own does not. Loading these the other
// way round throws "Cannot read properties of undefined (reading
// 'DEFAULT_RAW_SPEC')" at module init.
import {
  resolveContextCandidates,
  splitRuleAtPlus,
} from "../../packages/engine/src/validator/context-tolerance.js";
import { reverseUsLayoutKey } from "../../packages/engine/src/simulator/reverseUsLayout.js";

import {
  HARMFUL_OUTCOMES,
  type Bucket,
  type ProbeCase,
  type ProbeOutcome,
} from "./types.js";

/** Render a string as `U+XXXX U+XXXX` so JSON and terminal output are unambiguous. */
export function codepoints(text: string): string {
  return [...text]
    .map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}

/** Stable identity for one keystroke, for de-duplication. */
function keyId(key: SimKeyInput): string {
  return `${key.vkey} ${[...key.modifiers].sort().join(",")} ${key.caps ?? false}`;
}

/** Stable identity for a probe pair, for de-duplication across rules. */
function probeKey(contextChar: string, key: SimKeyInput): string {
  return `${contextChar} ${keyId(key)}`;
}

/**
 * Collapse the transform's free-form `notAnalysedReason` strings into short,
 * stable gate ids so a run's refusals can be counted and compared. An
 * unrecognised reason is passed through verbatim rather than bucketed as
 * "other" — a new gate should show up in the report as itself, not vanish.
 *
 * Matching on prose is a symptom-level coupling; the durable fix is for the
 * diagnostic to carry a structured gate id on the finding. That is a contracts
 * change, out of scope for a measurement tool, so the pass-through above is
 * what keeps this honest in the meantime.
 */
export function gateIdFor(reason: string): string {
  if (reason.startsWith("compound preceding context")) return "compound-context";
  if (reason.startsWith("compound key part")) return "compound-key";
  if (reason.startsWith("keyboard failed to compile")) return "compile-failed";
  if (/^store ".*" has an unresolved index\(\) output pairing$/.test(reason)) {
    return "unresolved-index-pairing";
  }
  if (/^store ".*" is paired via index\(\) with more than one other store$/.test(reason)) {
    return "multi-store-pairing";
  }
  if (/^store ".*" not found$/.test(reason)) return "context-store-not-found";
  if (/^store ".*" has no character items$/.test(reason)) return "context-store-empty";
  if (/^key store ".*" has no character items$/.test(reason)) return "key-store-empty";
  if (reason.startsWith("no US-layout key produces character")) return "key-not-on-us-layout";
  if (reason.startsWith("modifier on key")) return "unrepresentable-modifier";
  const contextKind = /^preceding-context element kind "(.*)" not analysed$/.exec(reason);
  if (contextKind) return `context-element-kind:${contextKind[1]}`;
  const keyKind = /^key element kind "(.*)" not analysed$/.exec(reason);
  if (keyKind) return `key-element-kind:${keyKind[1]}`;
  return reason;
}

const VKEY_MODIFIERS: Record<string, SimKeyInput["modifiers"][number] | undefined> = {
  SHIFT: "shift",
  CTRL: "ctrl",
  ALT: "alt",
  LCTRL: "lctrl",
  RCTRL: "rctrl",
  LALT: "lalt",
  RALT: "ralt",
};

/**
 * Every keystroke a rule's key part can stand for.
 *
 * Mirrors `resolveKeyPart` for the `vkey` and `char` element kinds and
 * differs deliberately for `any`: where the engine takes `storeChars[0]`,
 * this returns one key per store member. Members with no US-layout key are
 * skipped rather than failing the whole key part, so a partially
 * unrepresentable store still yields the probes it can.
 */
export function resolveAllKeys(
  keyPart: ContextElement[],
  storeChars: Map<string, string[]>,
): SimKeyInput[] {
  if (keyPart.length !== 1) return [];
  const el = keyPart[0]!;

  if (el.kind === "vkey") {
    const modifiers: SimKeyInput["modifiers"] = [];
    let caps: boolean | undefined;
    for (const raw of el.modifiers) {
      const upper = raw.toUpperCase();
      if (upper === "CAPS") {
        caps = true;
        continue;
      }
      if (upper === "NCAPS") {
        caps = false;
        continue;
      }
      const mapped = VKEY_MODIFIERS[upper];
      if (mapped === undefined) return []; // e.g. RSHIFT — not representable by SimKeyInput
      modifiers.push(mapped);
    }
    return [caps === undefined ? { vkey: el.name, modifiers } : { vkey: el.name, modifiers, caps }];
  }

  if (el.kind === "char") {
    const key = reverseUsLayoutKey(el.value);
    return key ? [key] : [];
  }

  if (el.kind === "any") {
    const keys: SimKeyInput[] = [];
    const seen = new Set<string>();
    for (const member of storeChars.get(el.storeRef) ?? []) {
      const key = reverseUsLayoutKey(member);
      if (!key) continue;
      const id = keyId(key);
      if (seen.has(id)) continue;
      seen.add(id);
      keys.push(key);
    }
    return keys;
  }

  return [];
}

/**
 * Enumerate the (context character, keystroke) pairs to compare. Ordered
 * deterministically by rule order, then store order, then key order, and
 * truncated at `cap` so one pathological keyboard cannot dominate a corpus
 * run. Returns the truncation flag alongside, so the report can say so
 * rather than silently under-reporting.
 */
export function enumerateProbes(
  ir: KeyboardIR,
  storeChars: Map<string, string[]>,
  cap: number,
): { probes: ProbeCase[]; capReached: boolean } {
  const probes: ProbeCase[] = [];
  const seen = new Set<string>();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const split = splitRuleAtPlus(rule);
      // One-element preceding contexts only: the transform's own eligibility
      // window, and the only shape whose seed buffer is unambiguous. Wider
      // contexts are counted as refusals instead — see the README.
      if (split === undefined || split.before.length !== 1) continue;

      const candidates = resolveContextCandidates(split.before[0]!, storeChars);
      if ("reason" in candidates) continue;

      const keys = resolveAllKeys(split.keyPart, storeChars);
      if (keys.length === 0) continue;

      for (const contextChar of candidates.chars) {
        if ([...contextChar].length !== 1) continue; // seed must be one character
        for (const key of keys) {
          const id = probeKey(contextChar, key);
          if (seen.has(id)) continue;
          seen.add(id);
          if (probes.length >= cap) return { probes, capReached: true };
          probes.push({ ruleId: rule.nodeId, line: rule.sourceLine ?? 0, contextChar, key });
        }
      }
    }
  }

  return { probes, capReached: false };
}

/**
 * The four measured outputs -> one verdict. Exhaustive by construction:
 * the composed path is checked first (it must never move), then the two
 * baseline states (already tolerant / diverging) each split by whether the
 * transformed decomposed path agrees, was left alone, or moved somewhere new.
 */
export function classifyProbe(outputs: {
  baselinePrecomposed: string;
  baselineDecomposed: string;
  transformedPrecomposed: string;
  transformedDecomposed: string;
}): ProbeOutcome {
  const { baselinePrecomposed: bNFC, baselineDecomposed: bNFD } = outputs;
  const { transformedPrecomposed: fNFC, transformedDecomposed: fNFD } = outputs;

  if (fNFC !== bNFC) return "regressed-composed";
  if (bNFC === bNFD) return fNFD === fNFC ? "no-gap" : "regressed-decomposed";
  if (fNFD === fNFC) return "gap-fixed";
  if (fNFD === bNFD) return "gap-remaining";
  return "gap-miscorrected";
}

const ALL_OUTCOMES: readonly ProbeOutcome[] = [
  "no-gap",
  "gap-fixed",
  "gap-remaining",
  "gap-miscorrected",
  "regressed-composed",
  "regressed-decomposed",
];

/** Zeroed outcome tally — every key present, so JSON consumers need no defaulting. */
export function emptyProbeCounts(): Record<ProbeOutcome, number> {
  return Object.fromEntries(ALL_OUTCOMES.map((o) => [o, 0])) as Record<ProbeOutcome, number>;
}

/**
 * Worst-outcome precedence. Harm outranks everything a run can still learn
 * from: a keyboard that fixes forty pairs and corrupts one is `regressed`,
 * because the corrupted pair is the one a user will hit.
 */
export function bucketFor(
  counts: Record<ProbeOutcome, number>,
  probeCount: number,
  refusedRules: number,
): Bucket {
  if (HARMFUL_OUTCOMES.some((o) => counts[o] > 0)) return "regressed";
  if (counts["gap-remaining"] > 0) return "gap-remaining";
  if (counts["gap-fixed"] > 0) return "gap-fixed";
  // No behavioural evidence either way, and the transform declined rules that
  // might have carried a gap: report the unknown, do not imply a clean bill.
  if (probeCount === 0 && refusedRules > 0) return "refused";
  return "no-gap";
}

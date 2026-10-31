// Output-form seam (spec 106 US3, FR-020 to FR-023): every string the
// assignments emit follows the one keyboard-wide output form.
//
// Stored assignments are form-independent: the studio records a deadkey's
// pairs as `baseLetters`/`accentedForms` whatever form is chosen, so changing
// the output-form answer later never rewrites an assignment. The emitted
// shape is chosen here, at emit time, from the merged refs.
//
// Shapes (km-keyman ruling R5, specs/106-consistent-keyboard-output/research.md):
//   - S-02 pairs whose output is one code point stay in the parallel
//     bases/output store pair (`deadkey_single_tap`).
//   - S-02 pairs whose output is the base plus a mark sequence M share one
//     self-indexing store per M, with the mark as a literal:
//       dk(N) + any(dk_N_bases) > index(dk_N_bases, 2) U+030C
//     A group with only such pairs and one M is `deadkey_single_tap_nfd`.
//     Output stores never hold multi-code-point items (index alignment).
//   - Anything else (a precomposed base key) gets a rule of its own.
//   - S-08 keys whose output is more than one code point leave the
//     altgrKeys/altgrOutput pair for a rule of their own.
//   - S-01 and S-03 outputs are rewritten in place.
//   - Under ready-made, a key that types a lone mark composes it onto the
//     letter before it (`postfix_compose`), over the attachment matrix's
//     allowed bases only; the bare mark stays typeable after anything else.
//
// No output form recorded: every ref passes through untouched, so a keyboard
// whose author never reached the marks series emits exactly what it did.

import type { MechanismRef, OutputForm } from "@keyboard-studio/contracts";
import { toUPlusSequence } from "@keyboard-studio/contracts";
import { outputFormString } from "../marks/output-form-policy.js";

export const DEADKEY_PATTERN = "deadkey_single_tap";
export const DEADKEY_NFD_PATTERN = "deadkey_single_tap_nfd";
/** Both S-02 deadkey shapes; consumers that ask "is this a deadkey?" use this set. */
export const DEADKEY_PATTERNS: ReadonlySet<string> = new Set([DEADKEY_PATTERN, DEADKEY_NFD_PATTERN]);
export const LAYER_SWITCH_PATTERN = "modifier_as_layer_switch";
export const SWAP_PATTERN = "simple_swap";
export const SEQUENCE_PATTERN = "multi_char_sequence";
export const POSTFIX_COMPOSE_PATTERN = "postfix_compose";
/**
 * Patterns this seam may emit in place of a stored ref. Stored assignments
 * never name them, so every pattern resolver that feeds `applyAssignments`
 * must preload them.
 */
export const OUTPUT_FORM_SEAM_PATTERN_IDS: readonly string[] = [DEADKEY_NFD_PATTERN, POSTFIX_COMPOSE_PATTERN];

export interface OutputFormOptions {
  /** The keyboard-wide output form; `undefined` = no decision, no rewrite. */
  outputForm?: OutputForm | undefined;
  /**
   * Per lone combining mark, the bases the attachment matrix allows it on.
   * Drives postfix compose under ready-made; absent = no compose rules.
   */
  markAttachments?: Readonly<Record<string, readonly string[]>> | undefined;
}

/** What the injector emits, in order: a pattern ref, or generated rule text. */
export type EmitUnit =
  | { kind: "ref"; ref: MechanismRef }
  | {
      kind: "raw";
      patternId: string;
      text: string;
      /** Deadkey slots, when the text carries the trigger and its escapes. */
      escapeSlots?: Record<string, string>;
    };

const COMBINING_MARK = /^\p{M}+$/u;

const cps = (s: string): string[] => [...s];
const hexOf = (s: string): string =>
  cps(s)
    .map((c) => (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"))
    .join("_");

/** One deadkey pair: the key's character and what the deadkey makes of it. */
interface DeadkeyPair {
  base: string;
  output: string;
}

function deadkeyPairsOf(ref: MechanismRef): DeadkeyPair[] {
  const sv = ref.slotValues ?? {};
  const bases = cps(sv["baseLetters"] ?? "");
  if (ref.patternId === DEADKEY_NFD_PATTERN) {
    const marks = sv["markChars"] ?? "";
    return bases.map((base) => ({ base, output: base + marks }));
  }
  const forms = sv["accentedForms"] ?? "";
  // A single-pair ref carries its whole output, even when that output is a
  // base plus a mark with no single character of its own.
  if (bases.length === 1) return [{ base: bases[0]!, output: forms }];
  const outs = cps(forms);
  return bases.flatMap((base, i) => (outs[i] === undefined ? [] : [{ base, output: outs[i]! }]));
}

function escapeLines(name: string, trigger: string, accentChar: string): string[] {
  // U+ notation: the trigger's character may itself be a quote.
  const out = toUPlusSequence(accentChar);
  return [
    `dk(${name}) + [${trigger}] > ${out}`,
    `dk(${name}) + [K_SPACE] > ${out}`,
    `+ [${trigger}] > dk(${name})`,
  ];
}

/**
 * Re-plan one deadkey (every ref on one trigger + name) under `form`.
 * Returns the units that replace the group, in emit order.
 */
function planDeadkeyGroup(group: MechanismRef[], form: OutputForm): EmitUnit[] {
  const first = group[0]!;
  const sv = first.slotValues ?? {};
  const name = sv["deadkeyName"] ?? "";
  const trigger = sv["triggerKey"] ?? "";
  const accentChar = sv["accentChar"] ?? "";
  const escapes = group.find((r) => r.slotValues?.["escapes"] !== undefined)?.slotValues?.["escapes"];
  const common: Record<string, string> = {
    triggerKey: trigger,
    deadkeyName: name,
    accentChar,
    ...(escapes !== undefined ? { escapes } : {}),
  };

  // First pair on a base wins, as the first rule does at runtime.
  const pairs = new Map<string, string>();
  for (const ref of group) {
    for (const { base, output } of deadkeyPairsOf(ref)) {
      if (!pairs.has(base)) pairs.set(base, outputFormString(output, form));
    }
  }

  const singles: DeadkeyPair[] = [];
  const byMarks = new Map<string, string[]>();
  const residue: DeadkeyPair[] = [];
  for (const [base, output] of pairs) {
    const formBase = outputFormString(base, form);
    if (cps(output).length === 1) {
      singles.push({ base, output });
    } else if (formBase === base && cps(base).length === 1 && output.startsWith(base) && COMBINING_MARK.test(output.slice(base.length))) {
      const marks = output.slice(base.length);
      const bases = byMarks.get(marks) ?? [];
      bases.push(base);
      byMarks.set(marks, bases);
    } else {
      residue.push({ base, output });
    }
  }

  const units: EmitUnit[] = [];
  const extra: string[] = [];
  let escapeSlots: Record<string, string> | undefined;
  const markGroups = [...byMarks.entries()];
  if (singles.length > 0) {
    units.push({
      kind: "ref",
      ref: {
        ...first,
        patternId: DEADKEY_PATTERN,
        slotValues: {
          ...common,
          baseLetters: singles.map((p) => p.base).join(""),
          accentedForms: singles.map((p) => p.output).join(""),
        },
      },
    });
  } else if (markGroups.length > 0) {
    const [marks, bases] = markGroups.shift()!;
    units.push({
      kind: "ref",
      ref: {
        ...first,
        patternId: DEADKEY_NFD_PATTERN,
        slotValues: { ...common, baseLetters: bases.join(""), markChars: marks },
      },
    });
  } else {
    // Only precomposed-base pairs: no store to carry the trigger and its
    // escapes, so they are written out here (the injector applies `escapes`).
    extra.push(...escapeLines(name, trigger, accentChar));
    escapeSlots = common;
  }
  for (const [marks, bases] of markGroups) {
    const store = `dk_${name}_${hexOf(marks)}_bases`;
    extra.push(
      `store(${store}) '${bases.join("")}'`,
      `dk(${name}) + any(${store}) > index(${store}, 2) ${toUPlusSequence(marks)}`,
    );
  }
  for (const { base, output } of residue) {
    // U+ notation on both sides: the base may itself be a quote. The key
    // side stays as typed — `+ X` matches the keystroke's own character on
    // the OS layout, never a rule's output, so it is never decomposed.
    extra.push(`dk(${name}) + ${toUPlusSequence(base)} > ${toUPlusSequence(output)}`);
  }
  if (extra.length > 0) {
    units.push({
      kind: "raw",
      patternId: DEADKEY_PATTERN,
      text: extra.join("\n"),
      ...(escapeSlots !== undefined ? { escapeSlots } : {}),
    });
  }
  return units;
}

const KEY_SPEC = /\[[^\]]+\]/g;

/** Every AltGr key with its output, across all the layer-switch refs. */
function layerSwitchPairs(refs: readonly MechanismRef[]): Array<[string, string]> {
  return refs.flatMap((ref) => {
    const sv = ref.slotValues ?? {};
    const keys = (sv["altgrKeyList"] ?? "").match(KEY_SPEC) ?? [];
    const outputs = sv["altgrOutputList"] ?? "";
    // One key per ref (the studio's shape) carries its whole output.
    const outs = keys.length === 1 ? [outputs] : cps(outputs);
    return keys.flatMap((key, i): Array<[string, string]> => (outs[i] === undefined ? [] : [[key, outs[i]!]]));
  });
}

/** Re-plan every AltGr ref into one store pair plus per-key rules under `form`. */
function planLayerSwitch(refs: readonly MechanismRef[], form: OutputForm): EmitUnit[] {
  const ref = refs[0]!;
  const sv = ref.slotValues ?? {};
  const singleKeys: string[] = [];
  let singleOuts = "";
  const perKey: string[] = [];
  layerSwitchPairs(refs).forEach(([key, out]) => {
    const formed = outputFormString(out, form);
    if (cps(formed).length === 1) {
      singleKeys.push(key);
      singleOuts += formed;
    } else {
      perKey.push(`+ ${key} > ${toUPlusSequence(formed)}`);
    }
  });
  const units: EmitUnit[] = [];
  if (singleKeys.length > 0) {
    units.push({
      kind: "ref",
      ref: { ...ref, slotValues: { ...sv, altgrKeyList: singleKeys.join(" "), altgrOutputList: singleOuts } },
    });
  }
  if (perKey.length > 0) units.push({ kind: "raw", patternId: LAYER_SWITCH_PATTERN, text: perKey.join("\n") });
  return units;
}

const U_PLUS_RHS = /^((?:\s*U\+[0-9A-Fa-f]{4,6})+)\s*$/;

/** Rewrite every all-U+ right-hand side of an S-01 rule list under `form`. */
function rewriteSwapRules(rules: string, form: OutputForm): string {
  return rules
    .split("\n")
    .map((line) => {
      const gt = line.indexOf(">");
      if (gt === -1) return line;
      const rhs = line.slice(gt + 1);
      if (!U_PLUS_RHS.test(rhs)) return line;
      const text = rhs
        .trim()
        .split(/\s+/)
        .map((t) => String.fromCodePoint(parseInt(t.slice(2), 16)))
        .join("");
      return `${line.slice(0, gt + 1)} ${toUPlusSequence(outputFormString(text, form))}`;
    })
    .join("\n");
}

// Anchored without the m flag: a multi-line (CAPS-aware) rule list never
// matches, so only a single plain lone-mark rule is composed.
const LONE_MARK_RULE = /^\s*\+\s*\[([^\]]+)\]\s*>\s*U\+([0-9A-Fa-f]{4,6})\s*$/;

/**
 * Under ready-made, an S-01 key that types one lone mark composes it onto an
 * allowed base before it (R5: postfix compose). `null` when the ref is not a
 * single lone-mark rule or no allowed base has a single composed character.
 */
function planPostfixCompose(
  ref: MechanismRef,
  attachments: Readonly<Record<string, readonly string[]>>,
): MechanismRef | null {
  const m = LONE_MARK_RULE.exec(ref.slotValues?.["kmnRules"] ?? "");
  if (m === null) return null;
  const mark = String.fromCodePoint(parseInt(m[2]!, 16));
  const allowed = attachments[mark];
  if (allowed === undefined) return null;
  let bases = "";
  let composed = "";
  for (const base of allowed) {
    const c = (base + mark).normalize("NFC");
    if (cps(base).length === 1 && cps(c).length === 1) {
      bases += base;
      composed += c;
    }
  }
  if (bases === "") return null;
  return {
    patternId: POSTFIX_COMPOSE_PATTERN,
    ...(ref.strategyId !== undefined ? { strategyId: ref.strategyId } : {}),
    slotValues: {
      markName: hexOf(mark),
      markKey: m[1]!.trim(),
      markChar: mark,
      baseChars: bases,
      composedChars: composed,
      // No escape answer exists yet: the bare mark stays typeable, as before.
      escapes: "bare",
    },
  };
}

/**
 * Turn the deduplicated, merged refs into emit units under the output form.
 * With no form recorded every ref passes through unchanged.
 */
export function applyOutputFormSeam(refs: readonly MechanismRef[], options: OutputFormOptions = {}): EmitUnit[] {
  const form = options.outputForm;
  if (form === undefined) return refs.map((ref) => ({ kind: "ref", ref }));

  const deadkeyGroups = new Map<string, MechanismRef[]>();
  for (const ref of refs) {
    if (!DEADKEY_PATTERNS.has(ref.patternId)) continue;
    const k = `${ref.slotValues?.["triggerKey"] ?? ""}::${ref.slotValues?.["deadkeyName"] ?? ""}`;
    const g = deadkeyGroups.get(k) ?? [];
    g.push(ref);
    deadkeyGroups.set(k, g);
  }

  const units: EmitUnit[] = [];
  const planned = new Set<string>();
  for (const ref of refs) {
    const sv = ref.slotValues ?? {};
    if (DEADKEY_PATTERNS.has(ref.patternId)) {
      const k = `${sv["triggerKey"] ?? ""}::${sv["deadkeyName"] ?? ""}`;
      if (planned.has(k)) continue;
      planned.add(k);
      units.push(...planDeadkeyGroup(deadkeyGroups.get(k)!, form));
    } else if (ref.patternId === LAYER_SWITCH_PATTERN) {
      if (planned.has(LAYER_SWITCH_PATTERN)) continue;
      planned.add(LAYER_SWITCH_PATTERN);
      units.push(...planLayerSwitch(refs.filter((r) => r.patternId === LAYER_SWITCH_PATTERN), form));
    } else if (ref.patternId === SWAP_PATTERN && sv["kmnRules"] !== undefined) {
      const compose =
        form === "ready-made" && options.markAttachments !== undefined
          ? planPostfixCompose(ref, options.markAttachments)
          : null;
      units.push({
        kind: "ref",
        ref: compose ?? { ...ref, slotValues: { ...sv, kmnRules: rewriteSwapRules(sv["kmnRules"], form) } },
      });
    } else if (ref.patternId === SEQUENCE_PATTERN && sv["collapsedChar"] !== undefined) {
      units.push({
        kind: "ref",
        ref: { ...ref, slotValues: { ...sv, collapsedChar: outputFormString(sv["collapsedChar"], form) } },
      });
    } else {
      units.push({ kind: "ref", ref });
    }
  }
  return units;
}

// Shared KeyboardIR builders for the recognizer rule tests.
//
// The generated-vs-hand-written twin tests (generated/simple-swap.test.ts,
// generated/deadkey-single-tap.test.ts) run the S-01 / S-02 hand-written
// recognizers and their generated counterparts over these same fixtures.

import type { IRGroup, IRRule, IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// S-01 (simple swap)
// ---------------------------------------------------------------------------

/** A single `+ [MODS VKEY] > 'char'` rule — the S-01 shape. */
export function s01Rule(
  nodeId: string,
  vkey: string,
  modifiers: string[],
  charOut: string,
): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: charOut }],
  };
}

// ---------------------------------------------------------------------------
// S-02 (deadkey single tap)
// ---------------------------------------------------------------------------

const GRAVE_BASE = " aAeEiIoOuU";
const GRAVE_ACCENTED = "`àÀèÈìÌòÒùÙ";

function graveStores(): IRStore[] {
  return [
    makeCharStore("store#dkf0060", "dkf0060", GRAVE_BASE),
    makeCharStore("store#dkt0060", "dkt0060", GRAVE_ACCENTED),
  ];
}

function graveBodyRule(nodeId: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "deadkey", id: 0x0060 },
      { kind: "any", storeRef: "dkf0060" },
    ],
    output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
  };
}

function graveEscapeRule(nodeId: string, vkey: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "deadkey", id: 0x0060 },
      { kind: "vkey", name: vkey, modifiers: [] },
    ],
    output: [{ kind: "char", value: "`" }],
  };
}

function mainGroup(rules: IRRule[]): IRGroup {
  return { nodeId: "group#main", name: "main", usingKeys: true, readonly: false, rules };
}

function deadkeysGroup(rules: IRRule[]): IRGroup {
  return { nodeId: "group#deadkeys", name: "deadkeys", usingKeys: false, readonly: false, rules };
}

/**
 * basic_kbdfr grave family: RALT K_7 trigger + fan-out body, optionally with
 * an escape rule. The generated S-02 rule requires the escape rule; the
 * hand-written s02Recognizer treats it as optional.
 */
export function buildGraveIR(opts: { escape: boolean }): {
  ir: KeyboardIR;
  triggerNodeId: string;
  bodyNodeId: string;
  escapeNodeId: string;
} {
  const triggerNodeId = "rule#trigger-0060";
  const bodyNodeId = "rule#body-0060";
  const escapeNodeId = "rule#escape-0060";

  const main = mainGroup([
    {
      // trigger: RALT K_7 -> dk(0x0060)
      nodeId: triggerNodeId,
      context: [{ kind: "vkey", name: "K_7", modifiers: ["RALT"] }],
      output: [{ kind: "deadkey", id: 0x0060 }],
    },
  ]);
  const deadkeys = deadkeysGroup(
    opts.escape
      ? [graveBodyRule(bodyNodeId), graveEscapeRule(escapeNodeId, "K_7")]
      : [graveBodyRule(bodyNodeId)],
  );

  return {
    ir: makeTestIR([main, deadkeys], graveStores()),
    triggerNodeId,
    bodyNodeId,
    escapeNodeId,
  };
}

/** Complete S-02 grave cluster (trigger + fan-out + escape), so both rules match. */
export function buildCompleteGraveIR() {
  return buildGraveIR({ escape: true });
}

// ---------------------------------------------------------------------------
// S-03 (sequence replace)
// ---------------------------------------------------------------------------

// sil_ipa equalD/equalU subset: base b/d/g → hooked ɓ/ɗ/ɠ (U+0253/U+0257/
// U+0260). These pairs are related by Unicode name extension (the marked
// letters have no decomposition mapping), which is exactly why the
// production detector carries the name-extension signal.
const IPA_BASE = "bdg";
const IPA_MARKED = "ɓɗɠ";

function ipaStores(): IRStore[] {
  return [
    makeCharStore("store#equalD", "equalD", IPA_BASE),
    makeCharStore("store#equalU", "equalU", IPA_MARKED),
  ];
}

/**
 * One sil_ipa-shaped sequence-replace rule:
 *   unguarded: any(equalD) + "=" > index(equalU, 1)
 *   guarded:   if(option_key='') any(equalD) + "=" > index(equalU, 2)
 * The codec's inline "+" survives as a raw context element; include it so
 * the fixtures pin the engine's stripping behaviour. `withPlus: false`
 * builds the same rule without the artifact.
 */
export function ipaSequenceRule(
  nodeId: string,
  opts: { guarded: boolean; offset?: number; withPlus?: boolean },
): IRRule {
  const guard: IRRule["context"] = opts.guarded
    ? [{ kind: "if", store: "option_key", value: "" }]
    : [];
  const plus: IRRule["context"] =
    opts.withPlus === false ? [] : [{ kind: "raw", text: "+" }];
  return {
    nodeId,
    context: [
      ...guard,
      { kind: "any", storeRef: "equalD" },
      ...plus,
      { kind: "char", value: "=" },
    ],
    output: [
      {
        kind: "index",
        storeRef: "equalU",
        offset: opts.offset ?? (opts.guarded ? 2 : 1),
      },
    ],
  };
}

/** Single-pair sil_ipa IR (one rule, equalD/equalU stores), guarded or not. */
export function buildIpaSequenceIR(opts: { guarded: boolean }): {
  ir: KeyboardIR;
  ruleNodeId: string;
} {
  const ruleNodeId = "rule#ipa-equal";
  const ir = makeTestIR(
    [mainGroup([ipaSequenceRule(ruleNodeId, opts)])],
    ipaStores(),
  );
  return { ir, ruleNodeId };
}

/**
 * Unguarded decomposition-flavoured pair: bases aeiou → áéíóú (NFD of each
 * marked form is base + U+0301), trigger "'". Exercises the relation check's
 * decomposition signal (the IPA pair exercises name extension).
 */
export function buildAcuteSequenceIR(): { ir: KeyboardIR; ruleNodeId: string } {
  const ruleNodeId = "rule#acute-seq";
  const stores = [
    makeCharStore("store#bases", "bases", "aeiou"),
    makeCharStore("store#marked", "marked", "áéíóú"),
  ];
  const rule: IRRule = {
    nodeId: ruleNodeId,
    context: [
      { kind: "any", storeRef: "bases" },
      { kind: "raw", text: "+" },
      { kind: "char", value: "'" },
    ],
    output: [{ kind: "index", storeRef: "marked", offset: 1 }],
  };
  return { ir: makeTestIR([mainGroup([rule])], stores), ruleNodeId };
}

/**
 * Unguarded parallel remap whose stores are NOT base→marked related
 * (aeiou → vwxyz): the S-04/S-05-territory shape the evidence gate must
 * refuse as S-03.
 */
export function buildUnrelatedRemapIR(): { ir: KeyboardIR } {
  const stores = [
    makeCharStore("store#bases", "bases", "aeiou"),
    makeCharStore("store#other", "other", "vwxyz"),
  ];
  const rule: IRRule = {
    nodeId: "rule#unrelated",
    context: [
      { kind: "any", storeRef: "bases" },
      { kind: "raw", text: "+" },
      { kind: "char", value: "'" },
    ],
    output: [{ kind: "index", storeRef: "other", offset: 1 }],
  };
  return { ir: makeTestIR([mainGroup([rule])], stores) };
}

/**
 * basic_kbdca grave family: two triggers (unshifted + shifted K_QUOTE) sharing
 * one fan-out body, plus an escape rule.
 */
export function buildTwoTriggerGraveIR(): {
  ir: KeyboardIR;
  trigger1: string;
  trigger2: string;
  bodyNodeId: string;
  escapeNodeId: string;
} {
  const trigger1 = "rule#trigger-0060-a";
  const trigger2 = "rule#trigger-0060-b";
  const bodyNodeId = "rule#body-0060";
  const escapeNodeId = "rule#escape-0060";

  const main = mainGroup([
    {
      nodeId: trigger1,
      context: [{ kind: "vkey", name: "K_QUOTE", modifiers: [] }],
      output: [{ kind: "deadkey", id: 0x0060 }],
    },
    {
      nodeId: trigger2,
      context: [{ kind: "vkey", name: "K_QUOTE", modifiers: ["SHIFT"] }],
      output: [{ kind: "deadkey", id: 0x0060 }],
    },
  ]);
  const deadkeys = deadkeysGroup([
    graveBodyRule(bodyNodeId),
    graveEscapeRule(escapeNodeId, "K_QUOTE"),
  ]);

  return {
    ir: makeTestIR([main, deadkeys], graveStores()),
    trigger1,
    trigger2,
    bodyNodeId,
    escapeNodeId,
  };
}

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

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
 * vietnamese_vni shape (#2225): ONE base store (`vowels`) with a distinct
 * output store per tone trigger — `any(vowels) + "1" > index(vowels_sac, 1)`
 * and `any(vowels) + "2" > index(vowels_huyen, 1)`. Two clusters share the
 * base store, so a patternId keyed on the base store alone collides and
 * recognizePatterns throws "Ownership drift". Both output stores are
 * base→marked remaps (acute / grave decompositions), so the unguarded
 * evidence gate passes.
 */
export function buildVniSequenceIR(): {
  ir: KeyboardIR;
  sacRuleNodeId: string;
  huyenRuleNodeId: string;
} {
  const sacRuleNodeId = "rule#vni-sac";
  const huyenRuleNodeId = "rule#vni-huyen";
  const stores = [
    makeCharStore("store#vowels", "vowels", "aeiou"),
    makeCharStore("store#vowels_sac", "vowels_sac", "áéíóú"),
    makeCharStore("store#vowels_huyen", "vowels_huyen", "àèìòù"),
  ];
  const toneRule = (
    nodeId: string,
    trigger: string,
    outStore: string,
  ): IRRule => ({
    nodeId,
    context: [
      { kind: "any", storeRef: "vowels" },
      { kind: "raw", text: "+" },
      { kind: "char", value: trigger },
    ],
    output: [{ kind: "index", storeRef: outStore, offset: 1 }],
  });
  return {
    ir: makeTestIR(
      [mainGroup([toneRule(sacRuleNodeId, "1", "vowels_sac"), toneRule(huyenRuleNodeId, "2", "vowels_huyen")])],
      stores,
    ),
    sacRuleNodeId,
    huyenRuleNodeId,
  };
}

/**
 * vietnamese_telex shape (#2225): ONE (base store, output store) pair whose
 * cluster carries TWO triggers — `any(vowels) + "s" > index(vowels_sac, 1)`
 * and the uppercase twin `+ "S"`. The pair is a single cluster (clusters key
 * on the store pair, never the trigger), so it must lift as exactly one
 * pattern — the case a trigger-keyed patternId cannot express.
 */
export function buildTelexMultiTriggerIR(): {
  ir: KeyboardIR;
  ruleNodeIds: string[];
} {
  const ruleNodeIds = ["rule#telex-sac-lower", "rule#telex-sac-upper"];
  const stores = [
    makeCharStore("store#vowels", "vowels", "aeiou"),
    makeCharStore("store#vowels_sac", "vowels_sac", "áéíóú"),
  ];
  const rules: IRRule[] = ruleNodeIds.map((nodeId, i) => ({
    nodeId,
    context: [
      { kind: "any", storeRef: "vowels" },
      { kind: "raw", text: "+" },
      { kind: "char", value: i === 0 ? "s" : "S" },
    ],
    output: [{ kind: "index", storeRef: "vowels_sac", offset: 1 }],
  }));
  return { ir: makeTestIR([mainGroup(rules)], stores), ruleNodeIds };
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

// ---------------------------------------------------------------------------
// S-07 (diacritic cycling)
// ---------------------------------------------------------------------------

// vietnamese_telex subset: vowels aeiou → vowels_sac áéíóú (each marked form
// is the base + combining acute, canonically composed), tone key "s".
// vietnamese_vni carries the same stores with digit tone keys ("1" = acute).
const TELEX_PLAIN = "aeiou";
const TELEX_MARKED = "áéíóú";

function telexStores(): IRStore[] {
  return [
    makeCharStore("store#vowels", "vowels", TELEX_PLAIN),
    makeCharStore("store#vowels_sac", "vowels_sac", TELEX_MARKED),
  ];
}

/**
 * One telex-shaped cancel rule:
 *   any(vowels_sac) + "s" > index(vowels, 1) "s"
 * Options build the negative variants (guarded, wrong offset, output char
 * differing from the trigger, index into the context store itself). The
 * codec's inline "+" is included as a raw element, as in the S-03 fixtures.
 */
export function telexCancelRule(
  nodeId: string,
  opts: {
    trigger?: string;
    outChar?: string;
    offset?: number;
    indexStore?: string;
    guarded?: boolean;
  } = {},
): IRRule {
  const trigger = opts.trigger ?? "s";
  const guard: IRRule["context"] = opts.guarded
    ? [{ kind: "if", store: "option_toneplace", value: "" }]
    : [];
  return {
    nodeId,
    context: [
      ...guard,
      { kind: "any", storeRef: "vowels_sac" },
      { kind: "raw", text: "+" },
      { kind: "char", value: trigger },
    ],
    output: [
      {
        kind: "index",
        storeRef: opts.indexStore ?? "vowels",
        offset: opts.offset ?? 1,
      },
      { kind: "char", value: opts.outChar ?? trigger },
    ],
  };
}

/** The paired apply rule: any(vowels) + "s" > index(vowels_sac, 1). */
export function telexApplyRule(
  nodeId: string,
  opts: { trigger?: string } = {},
): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: "vowels" },
      { kind: "raw", text: "+" },
      { kind: "char", value: opts.trigger ?? "s" },
    ],
    output: [{ kind: "index", storeRef: "vowels_sac", offset: 1 }],
  };
}

/** Apply + cancel pair in one group over the telex stores (trigger "s"). */
export function buildTelexCycleIR(): {
  ir: KeyboardIR;
  cancelNodeId: string;
  applyNodeId: string;
} {
  const cancelNodeId = "rule#telex-cancel-sac";
  const applyNodeId = "rule#telex-apply-sac";
  const ir = makeTestIR(
    [
      mainGroup([
        telexApplyRule(applyNodeId),
        telexCancelRule(cancelNodeId),
      ]),
    ],
    telexStores(),
  );
  return { ir, cancelNodeId, applyNodeId };
}

/** Same pair with the VNI digit cycle key ("1"). */
export function buildVniCycleIR(): {
  ir: KeyboardIR;
  cancelNodeId: string;
  applyNodeId: string;
} {
  const cancelNodeId = "rule#vni-cancel-sac";
  const applyNodeId = "rule#vni-apply-sac";
  const ir = makeTestIR(
    [
      mainGroup([
        telexApplyRule(applyNodeId, { trigger: "1" }),
        telexCancelRule(cancelNodeId, { trigger: "1" }),
      ]),
    ],
    telexStores(),
  );
  return { ir, cancelNodeId, applyNodeId };
}

/** Cancel rule alone, no paired apply (cluster must still form). */
export function buildTelexCancelOnlyIR(): {
  ir: KeyboardIR;
  cancelNodeId: string;
} {
  const cancelNodeId = "rule#telex-cancel-only";
  const ir = makeTestIR(
    [mainGroup([telexCancelRule(cancelNodeId)])],
    telexStores(),
  );
  return { ir, cancelNodeId };
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

// ---------------------------------------------------------------------------
// S-09 (retroactive reph)
// ---------------------------------------------------------------------------

export const REPH_RA = "\u0930"; // र — Devanagari ra
export const REPH_VIRAMA = "\u094D"; // ् — Devanagari virama

/** sil_devanagari_phonetic stores (subset strings, full membership). */
export function devanagariRephStores(): IRStore[] {
  return [
    makeCharStore(
      "store#ConsonantsU",
      "ConsonantsU",
      "कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह",
    ),
    makeCharStore("store#MatraVsU", "MatraVsU", "ािीुूृेैोौ"),
  ];
}

/** The base reph rule, sil_devanagari_phonetic:116 verbatim in IR form. */
export function rephBaseRule(nodeId: string, trigger = "R"): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: "ConsonantsU" },
      { kind: "raw", text: "+" },
      { kind: "char", value: trigger },
    ],
    output: [
      { kind: "char", value: REPH_RA },
      { kind: "char", value: REPH_VIRAMA },
      { kind: "index", storeRef: "ConsonantsU", offset: 1 },
    ],
  };
}

/**
 * The sil_devanagari_phonetic reph family (lines 116-118): the base rule
 * plus the matra and nukta+matra scaled variants, one cluster.
 */
export function buildPhoneticRephIR(): {
  ir: KeyboardIR;
  baseNodeId: string;
  matraNodeId: string;
  nuktaNodeId: string;
} {
  const baseNodeId = "rule#reph-base";
  const matraNodeId = "rule#reph-matra";
  const nuktaNodeId = "rule#reph-nukta";
  const ir = makeTestIR(
    [
      mainGroup([
        rephBaseRule(baseNodeId),
        {
          // :117 — any(ConsonantsU) any(MatraVsU) + "R" > ra virama
          // index(ConsonantsU,1) index(MatraVsU,2)
          nodeId: matraNodeId,
          context: [
            { kind: "any", storeRef: "ConsonantsU" },
            { kind: "any", storeRef: "MatraVsU" },
            { kind: "raw", text: "+" },
            { kind: "char", value: "R" },
          ],
          output: [
            { kind: "char", value: REPH_RA },
            { kind: "char", value: REPH_VIRAMA },
            { kind: "index", storeRef: "ConsonantsU", offset: 1 },
            { kind: "index", storeRef: "MatraVsU", offset: 2 },
          ],
        },
        {
          // :118 — any(ConsonantsU) U+093C any(MatraVsU) + "R" > ra
          // virama index(ConsonantsU,1) U+093C index(MatraVsU,3)
          nodeId: nuktaNodeId,
          context: [
            { kind: "any", storeRef: "ConsonantsU" },
            { kind: "char", value: "\u093C" },
            { kind: "any", storeRef: "MatraVsU" },
            { kind: "raw", text: "+" },
            { kind: "char", value: "R" },
          ],
          output: [
            { kind: "char", value: REPH_RA },
            { kind: "char", value: REPH_VIRAMA },
            { kind: "index", storeRef: "ConsonantsU", offset: 1 },
            { kind: "char", value: "\u093C" },
            { kind: "index", storeRef: "MatraVsU", offset: 3 },
          ],
        },
      ]),
    ],
    devanagariRephStores(),
  );
  return { ir, baseNodeId, matraNodeId, nuktaNodeId };
}

/**
 * The hindi_modular form witness (lines 181, 184): the same mechanism
 * with the re-emission spelled as one bare `context`.
 */
export function buildHindiRephIR(): {
  ir: KeyboardIR;
  baseNodeId: string;
  ikarNodeId: string;
} {
  const baseNodeId = "rule#hindi-reph-base";
  const ikarNodeId = "rule#hindi-reph-ikar";
  const stores = [
    makeCharStore(
      "store#cl",
      "cl",
      "कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह",
    ),
  ];
  const ir = makeTestIR(
    [
      mainGroup([
        {
          // :181 — any(cl) + "'" > U+0930 U+094D context
          nodeId: baseNodeId,
          context: [
            { kind: "any", storeRef: "cl" },
            { kind: "raw", text: "+" },
            { kind: "char", value: "'" },
          ],
          output: [
            { kind: "char", value: REPH_RA },
            { kind: "char", value: REPH_VIRAMA },
            { kind: "context", offset: 0 },
          ],
        },
        {
          // :184 — any(cl) U+093F + "'" > U+0930 U+094D context
          nodeId: ikarNodeId,
          context: [
            { kind: "any", storeRef: "cl" },
            { kind: "char", value: "\u093F" },
            { kind: "raw", text: "+" },
            { kind: "char", value: "'" },
          ],
          output: [
            { kind: "char", value: REPH_RA },
            { kind: "char", value: REPH_VIRAMA },
            { kind: "context", offset: 0 },
          ],
        },
      ]),
    ],
    stores,
  );
  return { ir, baseNodeId, ikarNodeId };
}

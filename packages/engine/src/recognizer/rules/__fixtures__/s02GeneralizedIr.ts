// Synthetic IR fixtures for the generalised S-02 shapes (#2233), replicating
// the real corpus keyboards that grounded the ruling (queue-2233-ruling.md):
// sil_pan_africa_mnemonic (any-store triggers, codec '+' separators in the
// fan-out contexts, shared triggers, no escape) and sil_euro_latin (postfix
// fan-outs, self-triggering families, postfix escapes), plus a chain-store
// positive control (basic_kbdrum / sil_cameroon store idioms). The corpus
// test (recognizer/s02-corpus.test.ts) pins the counts on the real files;
// these fixtures pin the shapes deterministically in CI.

import type { IRGroup, IRRule, IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";

function group(nodeId: string, name: string, usingKeys: boolean, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys, readonly: false, rules };
}

function store(nodeId: string, name: string, items: IRStore["items"]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

const PLUS: IRRule["context"][number] = { kind: "raw", text: "+" };

// ---------------------------------------------------------------------------
// sil_pan_africa_mnemonic: everything in one `using keys` group; triggers are
// any() over single-char stores; fan-out contexts carry the codec '+' raw
// element; dk(1) serves 2 families, dk(2) serves 3 (shared triggers); no
// escape; one [index, use] body that must NOT be claimed; one beep rule.
// ---------------------------------------------------------------------------

export function buildPanAfricaIR(): { ir: KeyboardIR } {
  const fanOut = (
    nodeId: string,
    dkId: number,
    base: string,
    out: string,
  ): IRRule => ({
    nodeId,
    context: [{ kind: "deadkey", id: dkId }, PLUS, { kind: "any", storeRef: base }],
    output: [{ kind: "index", storeRef: out, offset: 2 }],
  });

  const mainU = group("group#MainU", "MainU", true, [
    {
      nodeId: "rule#trig-1",
      context: [{ kind: "any", storeRef: "K_1" }],
      output: [{ kind: "deadkey", id: 1 }],
    },
    {
      nodeId: "rule#trig-2",
      context: [{ kind: "any", storeRef: "K_2" }],
      output: [{ kind: "deadkey", id: 2 }],
    },
    fanOut("rule#body-1a", 1, "dkfA", "dktA"),
    fanOut("rule#body-1b", 1, "dkfB", "dktB"),
    fanOut("rule#body-2a", 2, "dkfC", "dktC"),
    fanOut("rule#body-2b", 2, "dkfD", "dktD"),
    fanOut("rule#body-2c", 2, "dkfE", "dktE"),
    {
      // dk(1) + any(K_diacritics2) > index(diacritics2, 2) use(NFC):
      // two-element output — two-mechanism behaviour, NOT S-02.
      nodeId: "rule#body-nfc",
      context: [{ kind: "deadkey", id: 1 }, PLUS, { kind: "any", storeRef: "K_diacritics2" }],
      output: [
        { kind: "index", storeRef: "diacritics2", offset: 2 },
        { kind: "useGroup", groupName: "NFC" },
      ],
    },
    {
      // dk(2) + any(unused2) > beep — a fallback, never cluster evidence.
      nodeId: "rule#beep-2",
      context: [{ kind: "deadkey", id: 2 }, PLUS, { kind: "any", storeRef: "unused2" }],
      output: [{ kind: "beep" }],
    },
  ]);

  const stores: IRStore[] = [
    makeCharStore("store#K_1", "K_1", "["),
    makeCharStore("store#K_2", "K_2", "]"),
    makeCharStore("store#dkfA", "dkfA", " aei"),
    makeCharStore("store#dktA", "dktA", "àáēī"),
    makeCharStore("store#dkfB", "dkfB", " ou"),
    makeCharStore("store#dktB", "dktB", "ōōū"),
    makeCharStore("store#dkfC", "dkfC", " bcd"),
    makeCharStore("store#dktC", "dktC", "ƀƈɗƍ"),
    makeCharStore("store#dkfD", "dkfD", " fgh"),
    makeCharStore("store#dktD", "dktD", "ƒɠɦɨ"),
    makeCharStore("store#dkfE", "dkfE", " jkl"),
    makeCharStore("store#dktE", "dktE", "ʄƙƖƚ"),
    store("store#K_diacritics2", "K_diacritics2", [
      { kind: "char", value: "a" },
      { kind: "char", value: "e" },
    ]),
    store("store#diacritics2", "diacritics2", [
      { kind: "any" },
      { kind: "any" },
    ]),
    makeCharStore("store#unused2", "unused2", "z"),
  ];

  return { ir: makeTestIR([mainU], stores) };
}

// ---------------------------------------------------------------------------
// sil_euro_latin: postfix families in one `using keys` group, all dk(1),
// no trigger rule at all. Each family: "X" dk(1) + any(K) > index(O, 3)
// and a postfix escape "X" dk(1) + "X" > "X".
// ---------------------------------------------------------------------------

export function buildEuroLatinIR(): { ir: KeyboardIR } {
  const family = (prefix: string, base: string, out: string, tag: string): IRRule[] => [
    {
      nodeId: `rule#body-${tag}`,
      context: [
        { kind: "char", value: prefix },
        { kind: "deadkey", id: 1 },
        PLUS,
        { kind: "any", storeRef: base },
      ],
      output: [{ kind: "index", storeRef: out, offset: 3 }],
    },
    {
      nodeId: `rule#escape-${tag}`,
      context: [
        { kind: "char", value: prefix },
        { kind: "deadkey", id: 1 },
        PLUS,
        { kind: "char", value: prefix },
      ],
      output: [{ kind: "char", value: prefix }],
    },
  ];

  const main = group("group#Main", "Main", true, [
    ...family("x", "Kx", "Ox", "x"),
    ...family("q", "Kq", "Oq", "q"),
    {
      // Not an escape for the x family: third element differs from the prefix.
      nodeId: "rule#not-escape",
      context: [
        { kind: "char", value: "x" },
        { kind: "deadkey", id: 1 },
        PLUS,
        { kind: "char", value: "y" },
      ],
      output: [{ kind: "char", value: "x" }],
    },
    {
      // No deadkey element: a plain any->index rule, not an S-02 fan-out.
      nodeId: "rule#not-fanout",
      context: [{ kind: "char", value: "z" }, PLUS, { kind: "any", storeRef: "Kx" }],
      output: [{ kind: "index", storeRef: "Ox", offset: 2 }],
    },
  ]);

  const stores: IRStore[] = [
    makeCharStore("store#Kx", "Kx", "aei"),
    makeCharStore("store#Ox", "Ox", "áéí"),
    makeCharStore("store#Kq", "Kq", "ou"),
    makeCharStore("store#Oq", "Oq", "óú"),
  ];

  return { ir: makeTestIR([main], stores) };
}

// ---------------------------------------------------------------------------
// Chain-store positive control (basic_kbdrum / sil_cameroon idiom): the
// fan-out's stores are NOT char-only — the base store carries a deadkey item
// (two-level chain) and the output store carries `nul` padding — yet the
// item counts are parallel and the family must be claimed by both matchers
// (ruling D6: no char-only store guard).
// ---------------------------------------------------------------------------

export function buildChainStoreIR(): { ir: KeyboardIR } {
  const main = group("group#main", "main", true, [
    {
      nodeId: "rule#trig",
      context: [{ kind: "vkey", name: "K_X", modifiers: [] }],
      output: [{ kind: "deadkey", id: 7 }],
    },
  ]);
  const deadkeys = group("group#deadkeys", "deadkeys", false, [
    {
      nodeId: "rule#body",
      context: [{ kind: "deadkey", id: 7 }, PLUS, { kind: "any", storeRef: "base" }],
      output: [{ kind: "index", storeRef: "out", offset: 2 }],
    },
  ]);
  const stores: IRStore[] = [
    store("store#base", "base", [
      { kind: "char", value: " " },
      { kind: "deadkey", id: 1094 },
      { kind: "char", value: "a" },
    ]),
    store("store#out", "out", [
      { kind: "char", value: "^" },
      { kind: "raw", text: "nul" },
      { kind: "char", value: "á" },
    ]),
  ];
  return { ir: makeTestIR([main, deadkeys], stores) };
}

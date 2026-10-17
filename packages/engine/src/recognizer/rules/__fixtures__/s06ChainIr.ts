// Synthetic IR fixtures for the S-06 two-trigger chain finder (#2235),
// replicating the admitted corpus keyboard's shape (sil_cameroon_azerty,
// census on #2235): family F = dk(0x21) armed by two vkey rules, six pure
// edges to five tier-2 deadkeys, one tier-2 resolution per tier-2 deadkey,
// a tier-1 direct resolution, and a [dk(F), dk(F)] double-press. The corpus
// test (recognizer/s06-corpus.test.ts) pins the admission on the real file;
// these fixtures pin the predicate deterministically in CI.

import type { IRGroup, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";

function group(nodeId: string, name: string, usingKeys: boolean, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys, readonly: false, rules };
}

export const S06_F = 0x21;
export const S06_TIERS = [0x60, 0xb4, 0x5e, 0x7e, 0xa8] as const;

const dkName = (id: number) => id.toString(16).padStart(4, "0");

/** A minimal numeric two-tier chain: one family, `tiers.length` sub-clusters. */
export function buildChainIR(tiers: readonly number[] = S06_TIERS): { ir: KeyboardIR } {
  const main = group("group#main", "main", true, [
    {
      nodeId: "rule#arm-1",
      context: [{ kind: "vkey", name: "K_SLASH", modifiers: ["NCAPS"] }],
      output: [{ kind: "deadkey", id: S06_F }],
    },
    {
      nodeId: "rule#arm-2",
      context: [{ kind: "vkey", name: "K_SLASH", modifiers: ["CAPS"] }],
      output: [{ kind: "deadkey", id: S06_F }],
    },
  ]);
  const edgeChars = [".", ";", "ç", "é", "̌"];
  const deadkeysRules: IRRule[] = [];
  tiers.forEach((t, i) => {
    deadkeysRules.push({
      nodeId: `rule#edge-${dkName(t)}`,
      context: [
        { kind: "deadkey", id: S06_F },
        { kind: "char", value: edgeChars[i] ?? "." },
      ],
      output: [{ kind: "deadkey", id: t }],
    });
  });
  deadkeysRules.push({
    nodeId: "rule#double-press",
    context: [
      { kind: "deadkey", id: S06_F },
      { kind: "deadkey", id: S06_F },
    ],
    output: [{ kind: "char", value: "!" }],
  });
  tiers.forEach((t) => {
    deadkeysRules.push({
      nodeId: `rule#res-${dkName(t)}`,
      context: [
        { kind: "deadkey", id: t },
        { kind: "any", storeRef: `dkf${dkName(t)}` },
      ],
      output: [{ kind: "index", storeRef: `dkt${dkName(t)}`, offset: 2 }],
    });
  });
  deadkeysRules.push({
    nodeId: "rule#res-tier1",
    context: [
      { kind: "deadkey", id: S06_F },
      { kind: "any", storeRef: `dkf${dkName(S06_F)}` },
    ],
    output: [{ kind: "index", storeRef: `dkt${dkName(S06_F)}`, offset: 2 }],
  });
  const deadkeys = group("group#deadkeys", "deadkeys", false, deadkeysRules);

  const stores = [
    ...tiers.map((t) =>
      makeCharStore(`store#dkf${dkName(t)}`, `dkf${dkName(t)}`, " ae"),
    ),
    ...tiers.map((t) =>
      makeCharStore(`store#dkt${dkName(t)}`, `dkt${dkName(t)}`, " àè"),
    ),
    makeCharStore(`store#dkf${dkName(S06_F)}`, `dkf${dkName(S06_F)}`, " ae"),
    makeCharStore(`store#dkt${dkName(S06_F)}`, `dkt${dkName(S06_F)}`, "!àè"),
  ];
  return { ir: makeTestIR([main, deadkeys], stores) };
}

/** The library pattern's own scaffolded shape: a fully NAMED chain. */
export function buildNamedChainIR(): { ir: KeyboardIR } {
  const main = group("group#main", "main", true, [
    {
      nodeId: "rule#arm-named",
      context: [{ kind: "vkey", name: "K_GRAVE", modifiers: [] }],
      output: [{ kind: "namedDeadkey", name: "grave_family" }],
    },
  ]);
  const deadkeys = group("group#deadkeys", "deadkeys", false, [
    {
      nodeId: "rule#edge-named",
      context: [
        { kind: "namedDeadkey", name: "grave_family" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_QUOTE", modifiers: [] },
      ],
      output: [{ kind: "namedDeadkey", name: "grave_acute_chain" }],
    },
    {
      nodeId: "rule#res-named",
      context: [
        { kind: "namedDeadkey", name: "Grave_Acute_Chain" },
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "dk_chain_bases" },
      ],
      output: [{ kind: "index", storeRef: "dk_chain_out", offset: 2 }],
    },
    {
      nodeId: "rule#fallback-named",
      context: [
        { kind: "namedDeadkey", name: "grave_acute_chain" },
        { kind: "raw", text: "+" },
        { kind: "notany", storeRef: "dk_chain_bases" },
      ],
      output: [
        { kind: "char", value: "'" },
        { kind: "context", offset: 2 },
      ],
    },
  ]);
  const stores = [
    makeCharStore("store#bases", "dk_chain_bases", "aeiou"),
    makeCharStore("store#out", "dk_chain_out", "àèìòù"),
  ];
  return { ir: makeTestIR([main, deadkeys], stores) };
}

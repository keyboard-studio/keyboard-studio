// A decision-point fixture whose carved-layout decision really removes
// characters (spec 106 US1, FR-001), cut at every point from `assignments` on.
//
// The recorded Bafut/Cameroon QWERTY walk carves nothing (allow-host
// dispositions only), so carve suppression was never exercised by the gates.
// This derives a variant from that record: same base, same decisions, but
// carved-layout removes store slots in the two positionally paired shapes the
// keyboard has --
//   composed / comp-dia   tied by `any(composed) + [K_BKSP] > index(comp-dia, 1)`
//   dkf003b / dkt003b     a deadkey from/to pair, `dk(003b) any(dkf003b) > index(dkt003b, 2)`
// -- carving the same indices in both stores of a pair.
//
// It is derived rather than recorded: no walk zip carved these slots. The
// removals are item ids (`<storeNodeId>#<index>`), the shape the carve gallery
// records for a store slot.
//
// Reads the sibling ../keyboards corpus, so it runs under vitest.corpus.config.ts.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContextElement, FallbackPolicy, IRRule, KeyboardIR, OutputElement } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import type { CarvedLayoutValue } from "../survey/carve/carveValue.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { buildDecisionPointFixture, type DecisionPointFixture } from "./decisionPointFixture.ts";
import {
  DECISION_POINT_BASES,
  DECISION_POINT_FIXTURE_DIR,
  fixtureRelPath,
  type DecisionPoint,
} from "./decisionPointBases.ts";
import { announceSc004Skip, loadVfs, sc004GatesEnabled } from "./sc004Harness.ts";

announceSc004Skip("carving decision-point fixture", (name) => it.skip(name, () => {}));

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "..", "..", DECISION_POINT_FIXTURE_DIR);
const camqwerty = DECISION_POINT_BASES.find((b) => b.profile === "p4-unwrap-bafut-camqwerty")!;
const POINTS: readonly DecisionPoint[] = ["assignments", "caps", "tolerance"];

/**
 * The positionally paired store pairs, and the indices carved in BOTH stores of
 * each pair. In dkt003b the carved slots hold U+025B, U+0190, U+0181 and U+00D8.
 */
const PAIRS = [
  { from: "composed", to: "comp-dia", indices: [0, 1, 2, 9, 20, 43, 80] },
  { from: "dkf003b", to: "dkt003b", indices: [10, 11, 13, 40] },
] as const;

const NFC = (s: string): string => s.normalize("NFC");

/** Every character an emitted rule mentions literally, in context or output. */
function literalChars(rule: IRRule): string[] {
  const out: string[] = [];
  for (const e of rule.context as ContextElement[]) if (e.kind === "char") out.push(e.value);
  for (const e of rule.output as OutputElement[]) if (e.kind === "char") out.push(e.value);
  return out;
}

interface Carved {
  /** `<storeNodeId>#<index>` for each carved slot. */
  itemIds: string[];
  /**
   * Each pair's store contents with the carved indices filtered out of both
   * stores: what the emitted stores must equal if the pairing stayed aligned.
   */
  expectedStores: Map<string, string[]>;
  /**
   * Composed characters the keyboard mentions nowhere but the carved slot, so
   * the carve makes them untypable. (Characters typed another way survive a slot
   * carve, and rules naming them are correct.)
   */
  chars: Set<string>;
}

const charsOf = (items: readonly { kind: string; value?: string }[]): string[] =>
  items.map((i) => (i.kind === "char" ? NFC(i.value!) : `<${i.kind}>`));

function planCarve(): Carved {
  const vfs = loadVfs({ id: camqwerty.base, group: camqwerty.group });
  const kmn = readVfsText(vfs, `source/${camqwerty.base}.kmn`)!;
  const ir = parseKmn(kmn, camqwerty.base).ir;
  const store = (name: string) => {
    const s = ir.stores.find((x) => x.name === name);
    if (s === undefined) throw new Error(`store ${name} missing from ${camqwerty.base}`);
    return s;
  };

  const mentions = new Map<string, number>();
  const note = (c: string): void => void mentions.set(NFC(c), (mentions.get(NFC(c)) ?? 0) + 1);
  for (const s of ir.stores) for (const item of s.items) if (item.kind === "char") note(item.value);
  for (const g of ir.groups) for (const r of g.rules) for (const c of literalChars(r)) note(c);

  const itemIds: string[] = [];
  const expectedStores = new Map<string, string[]>();
  for (const pair of PAIRS) {
    for (const name of [pair.from, pair.to]) {
      const s = store(name);
      for (const i of pair.indices) itemIds.push(`${s.nodeId}#${i}`);
      expectedStores.set(
        name,
        charsOf(s.items).filter((_, i) => !(pair.indices as readonly number[]).includes(i)),
      );
    }
  }
  const chars = new Set<string>();
  for (const i of PAIRS[0].indices) {
    const item = store("composed").items[i];
    if (item?.kind === "char" && mentions.get(NFC(item.value)) === 1) chars.add(NFC(item.value));
  }
  return { itemIds, expectedStores, chars };
}

const carved: Carved = sc004GatesEnabled
  ? planCarve()
  : { itemIds: [], expectedStores: new Map(), chars: new Set<string>() };

function decisionsAt(point: DecisionPoint): DecisionSet {
  const set = JSON.parse(
    readFileSync(resolve(fixtureRoot, fixtureRelPath(camqwerty, point)), "utf-8"),
  ) as DecisionSet;
  const value: CarvedLayoutValue = {
    removals: [...carved.itemIds]
      .sort()
      .map((id) => ({ kind: "item" as const, id, provenance: "asked" as const })),
  };
  return { ...set, "carved-layout": { ...set["carved-layout"]!, value } };
}

/** Every character a rule can match or emit through a store it names. */
function storeChars(ir: KeyboardIR, rule: IRRule): string[] {
  const refs = [...rule.context, ...rule.output].flatMap((e) =>
    "storeRef" in e ? [e.storeRef] : [],
  );
  return [...new Set(refs)].flatMap((name) =>
    (ir.stores.find((s) => s.name === name)?.items ?? []).flatMap((i) => (i.kind === "char" ? [i.value] : [])),
  );
}

describe.skipIf(!sc004GatesEnabled)("carving fixture (Bafut on Cameroon QWERTY)", () => {
  it("carves slots from both pairs", () => {
    expect(carved.itemIds.length).toBe(2 * (PAIRS[0].indices.length + PAIRS[1].indices.length));
    expect(carved.chars.size).toBe(PAIRS[0].indices.length);
  });

  const RUNS: { point: DecisionPoint; policy?: FallbackPolicy }[] = [
    ...POINTS.map((point) => ({ point })),
    { point: "assignments", policy: "pass-through" },
  ];
  for (const { point, policy } of RUNS) {
    describe(`at ${point}${policy === undefined ? "" : `, ${policy}`}`, () => {
      let fx: DecisionPointFixture;
      let out: KeyboardIR;
      beforeAll(async () => {
        fx = await buildDecisionPointFixture({
          ...camqwerty,
          point,
          decisions: decisionsAt(point),
          ...(policy !== undefined ? { fallbackPolicy: policy } : {}),
        });
        out = parseKmn(readVfsText(fx.vfs, `source/${fx.keyboardId}.kmn`)!, fx.keyboardId).ir;
      }, 240_000);

      it("G1 holds: no unreachable rule", () => {
        const r = fx.gates.find((g) => g.gate === "G1");
        expect(r, "no G1 result").toBeDefined();
        expect(r!.pass, `G1: ${r!.detail.join("; ")}`).toBe(true);
      });

      it("both stores of each pair lose exactly the carved slots, staying aligned", () => {
        for (const [name, expected] of carved.expectedStores) {
          const got = out.stores.find((x) => x.name === name);
          expect(got, `store ${name} in the output`).toBeDefined();
          expect(charsOf(got!.items), `store ${name}`).toEqual(expected);
        }
      });

      it("no emitted rule references a carved character in context or output", () => {
        const offenders: string[] = [];
        for (const g of out.groups) {
          for (const rule of g.rules) {
            const hit = [...literalChars(rule), ...storeChars(out, rule)].filter((c) => carved.chars.has(NFC(c)));
            if (hit.length > 0) offenders.push(`${rule.nodeId}: ${[...new Set(hit)].join(" ")}`);
          }
        }
        expect(offenders, offenders.slice(0, 20).join("\n")).toEqual([]);
      });
    });
  }
});

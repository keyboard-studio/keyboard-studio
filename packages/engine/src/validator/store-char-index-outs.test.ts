/**
 * buildStoreCharIndex before and after `StoreItem.outs` (spec 116 phase 6): a pure
 * `outs()` store resolves to the same characters whether the IR holds the typed store
 * (what the codec produces now) or the `outs-expansion` fragment a persisted draft still
 * holds. A store that mixes `outs()` with other items stays unresolved either way.
 */

import { describe, expect, it } from "vitest";
import type { IRStore, KeyboardIR, RawKmnFragment, StoreItem } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { buildStoreCharIndex } from "./context-tolerance.js";

const HEADER = [
  "store(&NAME) 'T'",
  "store(&VERSION) '14.0'",
  "store(&TARGETS) 'any'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "store(lower) 'ab'",
  "store(upper) 'AB'",
].join("\n");

/** The IR a draft saved before the typed member holds: pure-outs stores as fragments. */
function asFragments(ir: KeyboardIR, names: string[]): KeyboardIR {
  const stores: IRStore[] = [];
  const raw: RawKmnFragment[] = [...ir.raw];
  for (const s of ir.stores) {
    if (!names.includes(s.name)) {
      stores.push(s);
      continue;
    }
    const body = s.items.map((i: StoreItem) => (i.kind === "outs" ? `outs(${i.storeRef})` : "?")).join(" ");
    raw.push({
      nodeId: s.nodeId,
      origin: "imported",
      sourceText: `store(${s.name}) ${body}`,
      reason: "outs-expansion",
    });
  }
  return { ...ir, stores, raw };
}

describe("buildStoreCharIndex: typed outs store and outs-expansion fragment agree", () => {
  const src = `${HEADER}\nstore(all) outs(lower) outs(upper)\nstore(chain) outs(all) outs(lower)\n`;

  it("resolves a pure outs() store, recursively and in declaration order", () => {
    const typed = parse(src, "kb").ir;
    expect(typed.raw).toEqual([]);
    const index = buildStoreCharIndex(typed);
    expect(index.get("all")).toEqual(["a", "b", "A", "B"]);
    expect(index.get("chain")).toEqual(["a", "b", "A", "B", "a", "b"]);
  });

  it("gives the same index from the fragment form", () => {
    const typed = parse(src, "kb").ir;
    const before = buildStoreCharIndex(asFragments(typed, ["all", "chain"]));
    const after = buildStoreCharIndex(typed);
    expect([...after].sort()).toEqual([...before].sort());
  });

  it("leaves a mixed outs()-and-literal store unresolved, as the fragment was", () => {
    const mixed = parse(`${HEADER}\nstore(mix) outs(lower) 'z'\n`, "kb").ir;
    expect(buildStoreCharIndex(mixed).has("mix")).toBe(false);
  });

  it("does not loop on a cycle", () => {
    const cyc = parse(`${HEADER}\nstore(p) outs(q)\nstore(q) outs(p)\n`, "kb").ir;
    const index = buildStoreCharIndex(cyc);
    expect(index.has("p")).toBe(false);
    expect(index.has("q")).toBe(false);
  });
});

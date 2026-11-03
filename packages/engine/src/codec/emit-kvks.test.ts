/**
 * Round-trip tests for the .kvks emitter.
 * parseKvks(emitKvks(ir)) must deep-equal ir (modulo nodeIds, re-minted on parse).
 */

import { describe, expect, it } from "vitest";
import { parseKvks } from "./parse-kvks.js";
import { emitKvks } from "./emit-kvks.js";
import type { KvksIR } from "@keyboard-studio/contracts";

function stripNodeIds(ir: KvksIR): Omit<KvksIR, "nodeIds"> {
  const { nodeIds: _nodeIds, ...rest } = ir;
  return rest;
}

describe("emitKvks round-trip", () => {
  it("round-trips a minimal keyboard", () => {
    const ir: KvksIR = {
      layers: [
        {
          shift: "",
          keys: [
            { vkey: "K_A", label: "a", chars: "a" },
            { vkey: "K_B", label: "b" },
          ],
        },
        {
          shift: "S",
          keys: [{ vkey: "K_A", label: "A", chars: "A" }],
        },
      ],
      usealtgr: false,
      nodeIds: [],
    };
    const xml = emitKvks(ir);
    const back = parseKvks(xml);
    expect(stripNodeIds(back)).toEqual(stripNodeIds(ir));
  });

  it("round-trips header fields and flags", () => {
    const ir: KvksIR = {
      kvksVersion: "10.0",
      kbdname: "test_kbd",
      fontFamily: "Arial",
      layers: [{ shift: "", keys: [] }],
      usealtgr: true,
      key102: true,
      displayUnderlying: true,
      nodeIds: [],
    };
    const xml = emitKvks(ir);
    expect(xml).toContain("<key102/>");
    expect(xml).toContain("<displayunderlying/>");
    expect(xml).toContain("<usealtgr/>");
    const back = parseKvks(xml);
    expect(stripNodeIds(back)).toEqual(stripNodeIds(ir));
  });

  it("escapes XML entities in labels and attributes", () => {
    const ir: KvksIR = {
      layers: [
        {
          shift: "",
          keys: [{ vkey: "K_A", label: "a<b>&\"'", chars: "x&y" }],
        },
      ],
      usealtgr: false,
      nodeIds: [],
    };
    const xml = emitKvks(ir);
    const back = parseKvks(xml);
    expect(back.layers[0]?.keys[0]?.label).toBe("a<b>&\"'");
    expect(back.layers[0]?.keys[0]?.chars).toBe("x&y");
  });

  it("round-trips a real fixture file", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = dirname(fileURLToPath(import.meta.url));
    // Walk up to the repo root's studio fixtures.
    const fixture = join(
      dir,
      "..",
      "..",
      "..",
      "studio",
      "tests",
      "fixtures",
      "walkBases",
      "release",
      "basic",
      "basic_kbdus",
      "source",
      "basic_kbdus.kvks",
    );
    const xml = await readFile(fixture, "utf-8");
    const ir = parseKvks(xml);
    const back = parseKvks(emitKvks(ir));
    expect(stripNodeIds(back)).toEqual(stripNodeIds(ir));
  });
});

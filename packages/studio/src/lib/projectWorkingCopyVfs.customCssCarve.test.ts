// #2578 regression: the CSS step's `&KMW_EMBEDCSS` store line is dropped
// from the projected `.kmn` whenever a carve forces a full re-emit.
//
// `projectWorkingCopyVfs` applies the CSS at step 0b (text-level, before the
// step-1 carve projection). A slot removal sets `irRewritten`, so step 1
// re-emits the `.kmn` from the (startIr-derived) IR, rebuilding the header
// from the IR's own stores and dropping the text-level `&KMW_EMBEDCSS` line
// 0b had just added. The `.css` file survives (files are not re-derived),
// so the download ships an orphaned stylesheet that nothing references.
//
// The fix re-applies the CSS after the step-4 id rename — the last `.kmn`
// writer in the projection — so any intermediate full re-emit (carve,
// caps, tolerance, guards, rename) cannot strand the line. The re-apply is
// idempotent: when the line survived, it is a no-op.
//
// This file must remain free of vi.mock("@keyboard-studio/engine", ...) so
// the real emission pipeline runs.

import { describe, it, expect } from "vitest";
import { charStore, irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule, IRStore, StoreItem } from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";
import { stubKmnVfs } from "../test/workingCopy.ts";

// ---------------------------------------------------------------------------
// Fixture helpers (same parallel-store shape as projectWorkingCopyVfs.store-slots.test.ts)
// ---------------------------------------------------------------------------

function makeParallelRule(
  nodeId: string,
  dkId: number,
  inputStoreName: string,
  outputStoreName: string,
): IRRule {
  return {
    nodeId,
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "any", storeRef: inputStoreName },
    ],
    output: [{ kind: "index", storeRef: outputStoreName, offset: 2 }],
  };
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return irGroup({ nodeId, name, rules });
}

function makeOutputStore(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return charStore({ nodeId, name, items });
}

function makeInputStore(nodeId: string, name: string, chars: string[]): IRStore {
  return charStore({ nodeId, name, chars });
}

/**
 * Minimal parallel-store IR for #2578.
 * Output store dktX: ['À', 'ε', raw(nul)]
 * Input store dkfX: ['a', 'b', 'c']
 * Group main: dk(003b) any(dkfX) > index(dktX, 2)
 */
function makeParallelIr() {
  const outputItems: StoreItem[] = [
    { kind: "char", value: "À" },
    { kind: "char", value: "ε" },
    { kind: "raw", text: "nul" },
  ];
  const outputStore = makeOutputStore("store#dkt", "dktX", outputItems);
  const inputStore = makeInputStore("store#dkf", "dkfX", ["a", "b", "c"]);
  const rules: IRRule[] = [makeParallelRule("rule#dk", 0x003b, "dkfX", "dktX")];
  const group = makeGroup("group#main", "main", rules);
  return makeTestIR([group], [outputStore, inputStore]);
}

/** A base `.kmn` with a real header + `begin`, like a fetched keyboard has. */
const KMN_WITH_BEGIN =
  "store(&NAME) 'kb'\n\nbegin Unicode > use(main)\ngroup(main) using keys\n";

const CUSTOM_CSS = "body { color: red; }";

describe("projectWorkingCopyVfs #2578 — custom CSS survives a carve re-emit", () => {
  it("repro: customCss + slot deletion keeps the &KMW_EMBEDCSS line in the emitted .kmn", () => {
    const ir = makeParallelIr();
    const vfs = stubKmnVfs("kb", KMN_WITH_BEGIN);

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "kb",
      startIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#dkt#1"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      customCss: CUSTOM_CSS,
    });

    expect(warnings).toHaveLength(0);

    // The stylesheet file itself is written (this already held pre-fix).
    const css = vfs.get("source/kb.css")?.content;
    expect(css).toBe(CUSTOM_CSS);

    // The carve still happened: the slot is nulled in the re-emitted .kmn.
    const content = vfs.get("source/kb.kmn")?.content as string;
    expect(typeof content).toBe("string");
    expect(content).toMatch(/store\(dktX\)[^\n]*nul/);

    // #2578: the store line naming the stylesheet must survive the re-emit.
    expect(content).toContain("store(&KMW_EMBEDCSS) 'kb.css'");
  });

  it("control: customCss with no carve keeps the line (the step-0b path)", () => {
    const ir = makeParallelIr();
    const vfs = stubKmnVfs("kb", KMN_WITH_BEGIN);

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "kb",
      startIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      customCss: CUSTOM_CSS,
    });

    const css = vfs.get("source/kb.css")?.content;
    expect(css).toBe(CUSTOM_CSS);
    const content = vfs.get("source/kb.kmn")?.content as string;
    expect(content).toContain("store(&KMW_EMBEDCSS) 'kb.css'");
  });

  it("whole-node carve: customCss + a deleted rule keeps the line (splice path)", () => {
    const extraRule = vkeyRule({ nodeId: "rule#simple", vkey: "K_A", output: "x" });
    const outputItems: StoreItem[] = [
      { kind: "char", value: "À" },
      { kind: "char", value: "ε" },
      { kind: "raw", text: "nul" },
    ];
    const ir = makeTestIR(
      [makeGroup("group#main", "main", [makeParallelRule("rule#dk", 0x003b, "dkfX", "dktX"), extraRule])],
      [makeOutputStore("store#dkt", "dktX", outputItems), makeInputStore("store#dkf", "dkfX", ["a", "b", "c"])],
    );
    const vfs = stubKmnVfs("kb", KMN_WITH_BEGIN);

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "kb",
      startIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["rule#simple"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      customCss: CUSTOM_CSS,
    });

    const content = vfs.get("source/kb.kmn")?.content as string;
    expect(content).not.toContain("K_A");
    expect(content).toContain("store(&KMW_EMBEDCSS) 'kb.css'");
  });

  it("rename: customCss + slot deletion + a new id names the renamed stylesheet", () => {
    const ir = makeParallelIr();
    const vfs = stubKmnVfs("kb", KMN_WITH_BEGIN);

    const { effectiveKeyboardId } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "kb",
      targetKeyboardId: "kb2",
      startIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#dkt#1"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      customCss: CUSTOM_CSS,
    });

    expect(effectiveKeyboardId).toBe("kb2");

    const css = vfs.get("source/kb2.css")?.content;
    expect(css).toBe(CUSTOM_CSS);
    expect(vfs.get("source/kb.css")).toBeUndefined();

    const content = vfs.get("source/kb2.kmn")?.content as string;
    expect(typeof content).toBe("string");
    expect(content).toMatch(/store\(dktX\)[^\n]*nul/);
    expect(content).toContain("store(&KMW_EMBEDCSS) 'kb2.css'");
  });
});

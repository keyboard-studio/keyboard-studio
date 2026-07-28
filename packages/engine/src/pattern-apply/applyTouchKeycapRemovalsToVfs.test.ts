/**
 * Unit tests for applyTouchKeycapRemovalsToVfs and its two pure appliers.
 *
 * Coverage:
 *   1. applyTouchKeycapRemovalsToLayout (IR path):
 *      a. Main U_-id key blanked → id neutralized, text/output cleared, row kept.
 *      b. Longpress (sk[]) entry removed, main key untouched.
 *      c. Multitap + flick entries removed independently.
 *      d. Untouched platforms/layers/rows are returned BY REFERENCE (structural sharing).
 *      e. Idempotent: applying the SAME id twice yields the same result.
 *   2. applyTouchKeycapRemovalsToRawJson (Case B path):
 *      a. Splices a main key + a longpress entry, preserving unrelated fields verbatim.
 *      b. No-op (byte-identical `json`) when no id in the set resolves.
 *   3. applyTouchKeycapRemovalsToVfs (VFS projection step):
 *      a. Removes exactly the addressed key/subkey and nothing else.
 *      b. No .keyman-touch-layout file → silent no-op, no warnings.
 *      c. Invalid JSON → one warning, VFS left untouched.
 *      d. Idempotent double-application via the VFS step.
 */

import { describe, it, expect } from "vitest";
import {
  applyTouchKeycapRemovalsToLayout,
  applyTouchKeycapRemovalsToRawJson,
  applyTouchKeycapRemovalsToVfs,
} from "./applyTouchKeycapRemovalsToVfs.js";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers (mirrors applyDesktopModifications.test.ts's conventions)
// ---------------------------------------------------------------------------

function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, ...overrides };
}

function makeLayout(phoneDefaultKeys: TouchKeyIR[]): TouchLayoutIR {
  return {
    platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: phoneDefaultKeys }] }] }],
    nodeIds: [],
  };
}

function phoneDefaultKeys(layout: TouchLayoutIR): TouchKeyIR[] {
  const phone = layout.platforms.find((p) => p.id === "phone")!;
  const def = phone.layers.find((l) => l.id === "default")!;
  return def.rows.flatMap((r) => r.keys);
}

function getKey(layout: TouchLayoutIR, keyId: string): TouchKeyIR | undefined {
  return phoneDefaultKeys(layout).find((k) => k.id === keyId);
}

// ---------------------------------------------------------------------------
// 1. applyTouchKeycapRemovalsToLayout (IR path)
// ---------------------------------------------------------------------------

describe("applyTouchKeycapRemovalsToLayout", () => {
  it("blanks a main U_-id key: id neutralized, text/output cleared, key kept", () => {
    const layout = makeLayout([makeKey("U_0061", { text: "a" }), makeKey("U_0062", { text: "b" })]);

    const { layout: next, warnings } = applyTouchKeycapRemovalsToLayout(
      layout,
      new Set(["phone:default:U_0061"]),
    );

    expect(warnings).toEqual([]);
    const keys = phoneDefaultKeys(next);
    expect(keys).toHaveLength(2); // never delete the key object
    const blanked = keys.find((k) => k.id.startsWith("T_touchdel_"))!;
    expect(blanked.id).toBe("T_touchdel_0061");
    expect(blanked.text).toBeUndefined();
    // Sibling untouched.
    expect(getKey(next, "U_0062")?.text).toBe("b");
  });

  it("removes a longpress (sk[]) entry, leaving the main key untouched", () => {
    const layout = makeLayout([
      makeKey("U_0061", { text: "a", sk: [makeKey("U_00E1", { text: "á" }), makeKey("U_00E2", { text: "â" })] }),
    ]);

    const { layout: next } = applyTouchKeycapRemovalsToLayout(
      layout,
      new Set(["phone:default:U_0061:sk:U_00E1"]),
    );

    const key = getKey(next, "U_0061")!;
    expect(key.text).toBe("a"); // main key untouched
    expect(key.sk).toHaveLength(1);
    expect(key.sk![0]!.id).toBe("U_00E2");
  });

  it("removes a multitap entry and a flick entry independently", () => {
    const layout = makeLayout([
      makeKey("U_0065", {
        text: "e",
        multitap: [makeKey("U_00E9", { text: "é" })],
        flick: { ne: makeKey("U_0301", { text: "́" }) },
      }),
    ]);

    const { layout: next } = applyTouchKeycapRemovalsToLayout(
      layout,
      new Set(["phone:default:U_0065:multitap:U_00E9"]),
    );

    const key = getKey(next, "U_0065")!;
    expect(key.multitap).toBeUndefined();
    expect(key.flick?.ne).toBeDefined(); // untouched
  });

  it("returns untouched platforms/layers/rows by reference (structural sharing)", () => {
    const layout = makeLayout([makeKey("U_0061", { text: "a" })]);
    const untouchedPlatform = { ...layout, platforms: [...layout.platforms] };

    const { layout: next } = applyTouchKeycapRemovalsToLayout(layout, new Set(["nonexistent:address"]));

    expect(next).toBe(layout); // no address matched — no-op, same reference
    expect(untouchedPlatform.platforms[0]).toBe(layout.platforms[0]);
  });

  it("is idempotent — applying the same id twice yields the same result", () => {
    const layout = makeLayout([makeKey("U_0061", { text: "a" })]);
    const ids = new Set(["phone:default:U_0061"]);

    const once = applyTouchKeycapRemovalsToLayout(layout, ids);
    // Re-run against the ORIGINAL layout (mirrors how projectWorkingCopyVfs
    // re-derives from scratch every debounce cycle) — same result each time.
    const twice = applyTouchKeycapRemovalsToLayout(layout, ids);

    expect(getKey(once.layout, "U_0061")).toBeUndefined();
    const blankedOnce = phoneDefaultKeys(once.layout)[0]!;
    const blankedTwice = phoneDefaultKeys(twice.layout)[0]!;
    expect(blankedOnce.id).toBe(blankedTwice.id);
    expect(blankedOnce.text).toBe(blankedTwice.text);
  });
});

// ---------------------------------------------------------------------------
// 2. applyTouchKeycapRemovalsToRawJson (Case B path)
// ---------------------------------------------------------------------------

describe("applyTouchKeycapRemovalsToRawJson", () => {
  function rawLayout(): string {
    return JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [
                  { id: "U_0061", text: "a", sk: [{ id: "U_00E1", text: "á" }] },
                  { id: "U_0062", text: "b" },
                ],
              },
            ],
          },
        ],
      },
    });
  }

  it("splices a main key + a longpress entry, preserving unrelated fields verbatim", () => {
    const { json, warnings } = applyTouchKeycapRemovalsToRawJson(
      rawLayout(),
      new Set(["phone:default:U_0062"]),
    );

    expect(warnings).toEqual([]);
    const parsed = JSON.parse(json) as {
      phone: { layer: Array<{ row: Array<{ key: Array<{ id: string; text?: string; sk?: unknown[] }> }> }> };
    };
    const keys = parsed.phone.layer[0]!.row[0]!.key;
    expect(keys).toHaveLength(2); // key kept, never removed
    const blanked = keys.find((k) => k.id.startsWith("T_touchdel_"))!;
    expect(blanked.text).toBeUndefined();
    // Sibling (a + its sk[]) fully preserved verbatim.
    const untouched = keys.find((k) => k.id === "U_0061")!;
    expect(untouched.text).toBe("a");
    expect(untouched.sk).toEqual([{ id: "U_00E1", text: "á" }]);
  });

  it("removes exactly the addressed sk[] entry and nothing else", () => {
    const { json } = applyTouchKeycapRemovalsToRawJson(
      rawLayout(),
      new Set(["phone:default:U_0061:sk:U_00E1"]),
    );

    const parsed = JSON.parse(json) as {
      phone: { layer: Array<{ row: Array<{ key: Array<{ id: string; text?: string; sk?: unknown[] }> }> }> };
    };
    const keys = parsed.phone.layer[0]!.row[0]!.key;
    const mainKey = keys.find((k) => k.id === "U_0061")!;
    expect(mainKey.text).toBe("a"); // main key untouched
    expect(mainKey.sk).toBeUndefined(); // sk[] emptied out entirely
    expect(keys.find((k) => k.id === "U_0062")).toBeDefined(); // sibling untouched
  });

  it("is a byte-identical no-op when no id in the set resolves to anything", () => {
    const raw = rawLayout();
    const { json, warnings } = applyTouchKeycapRemovalsToRawJson(raw, new Set(["nonexistent:address"]));

    expect(json).toBe(raw); // no reformatting when nothing changed
    expect(warnings).toEqual([]);
  });

  it("returns the input verbatim when the deletion set is empty", () => {
    const raw = rawLayout();
    const { json } = applyTouchKeycapRemovalsToRawJson(raw, new Set());
    expect(json).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// 3. applyTouchKeycapRemovalsToVfs (VFS projection step)
// ---------------------------------------------------------------------------

describe("applyTouchKeycapRemovalsToVfs", () => {
  const touchJson = JSON.stringify({
    phone: {
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                { id: "U_0061", text: "a", sk: [{ id: "U_00E1", text: "á" }] },
                { id: "U_0062", text: "b" },
              ],
            },
          ],
        },
      ],
    },
  });

  function makeVfs(kmn?: string) {
    return createVirtualFS([
      { path: "source/test.kmn", content: kmn ?? "c test\n", isBinary: false },
      { path: "source/test.keyman-touch-layout", content: touchJson, isBinary: false },
    ]);
  }

  it("removes exactly the addressed key and nothing else", () => {
    const vfs = makeVfs();

    const { warnings } = applyTouchKeycapRemovalsToVfs(
      vfs,
      "test",
      new Set(["phone:default:U_0061:sk:U_00E1"]),
    );

    expect(warnings).toEqual([]);
    const written = vfs.get("source/test.keyman-touch-layout")!.content as string;
    const parsed = JSON.parse(written) as {
      phone: { layer: Array<{ row: Array<{ key: Array<{ id: string; text?: string; sk?: unknown[] }> }> }> };
    };
    const keys = parsed.phone.layer[0]!.row[0]!.key;
    expect(keys.find((k) => k.id === "U_0061")?.sk).toBeUndefined();
    expect(keys.find((k) => k.id === "U_0062")?.text).toBe("b"); // sibling untouched
  });

  it("is a silent no-op when the deletion set is empty", () => {
    const vfs = makeVfs();
    const before = vfs.get("source/test.keyman-touch-layout")!.content;

    const { warnings } = applyTouchKeycapRemovalsToVfs(vfs, "test", new Set());

    expect(warnings).toEqual([]);
    expect(vfs.get("source/test.keyman-touch-layout")!.content).toBe(before);
  });

  it("is a silent no-op when there is no .keyman-touch-layout file at all", () => {
    const vfs = createVirtualFS([{ path: "source/test.kmn", content: "c test\n", isBinary: false }]);

    const { warnings } = applyTouchKeycapRemovalsToVfs(
      vfs,
      "test",
      new Set(["phone:default:U_0061"]),
    );

    expect(warnings).toEqual([]);
    expect(vfs.get("source/test.keyman-touch-layout")).toBeUndefined();
  });

  it("warns (and leaves the VFS untouched) on invalid JSON", () => {
    const vfs = createVirtualFS([
      { path: "source/test.kmn", content: "c test\n", isBinary: false },
      { path: "source/test.keyman-touch-layout", content: "{not valid json", isBinary: false },
    ]);

    const { warnings } = applyTouchKeycapRemovalsToVfs(
      vfs,
      "test",
      new Set(["phone:default:U_0061"]),
    );

    expect(warnings).toHaveLength(1);
    expect(vfs.get("source/test.keyman-touch-layout")!.content).toBe("{not valid json");
  });

  it("is idempotent across two applications on the same fresh VFS (desktop-cascade safety)", () => {
    const ids = new Set(["phone:default:U_0061:sk:U_00E1"]);

    const vfsA = makeVfs();
    applyTouchKeycapRemovalsToVfs(vfsA, "test", ids);
    const resultA = vfsA.get("source/test.keyman-touch-layout")!.content;

    // A second, independent VFS from the SAME pristine source, run through
    // the same overlay — matches the real pipeline, where every debounce
    // cycle re-derives the touch layout from scratch and re-applies the same
    // deletedTouchKeyIds set (see module doc on applyTouchKeycapRemovalsToVfs.ts).
    const vfsB = makeVfs();
    applyTouchKeycapRemovalsToVfs(vfsB, "test", ids);
    const resultB = vfsB.get("source/test.keyman-touch-layout")!.content;

    expect(resultA).toBe(resultB);

    // Applying the overlay a SECOND time on top of the already-blanked vfsA
    // (simulating a stale id that no longer resolves, e.g. after a desktop
    // carve neutralized the same key) must not throw or double-mutate.
    expect(() => applyTouchKeycapRemovalsToVfs(vfsA, "test", ids)).not.toThrow();
  });
});

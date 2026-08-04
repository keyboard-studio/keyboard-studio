/**
 * 0x05A routing tests (spec 058 T043 / FR-040).
 *
 * The point of this suite is as much about WHERE the finding lives as what it
 * says: 0x05A is a validity concern, so it is a Layer A′ import-fidelity finding
 * and must NOT have become the first error-severity code in Layer C.
 */

import { describe, expect, it } from "vitest";

import type { KeyboardIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  checkTouchLayoutIdentifiers,
  TOUCH_LAYOUT_INVALID_IDENTIFIER_CODE,
} from "./layer-a-prime.js";
import { runImportFidelityParseChecks } from "./index-import-fidelity.js";
import type { ParseResult } from "../codec/parse.js";

function irWithLayout(layout?: TouchLayoutIR): KeyboardIR {
  const ir: KeyboardIR = {
    origin: "imported",
    header: {
      keyboardId: "kbd",
      name: "Kbd",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [{ nodeId: "g1", name: "Main", usingKeys: true, readonly: false, rules: [] }],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
  if (layout) ir.touchLayout = layout;
  return ir;
}

function layoutWithIds(ids: string[]): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [{ keys: ids.map((id, i) => ({ nodeId: `n${i}`, id, text: "x" })) }],
          },
        ],
      },
    ],
    nodeIds: [],
  };
}

function result(layout?: TouchLayoutIR): ParseResult {
  return { ir: irWithLayout(layout), opaqueFeatures: [] };
}

describe("checkTouchLayoutIdentifiers — 0x05A as a Layer A' validity finding", () => {
  it("accepts valid identifiers", () => {
    expect(
      checkTouchLayoutIdentifiers(result(layoutWithIds(["T_MYKEY", "U_00E9", "K_A", "_x1"]))),
    ).toEqual([]);
  });

  it("rejects an id starting with a digit", () => {
    const findings = checkTouchLayoutIdentifiers(result(layoutWithIds(["1BAD"])));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(TOUCH_LAYOUT_INVALID_IDENTIFIER_CODE);
  });

  it("rejects ids containing whitespace, punctuation, or a hyphen", () => {
    for (const id of ["T MY KEY", "T_MY.KEY", "T-MY-KEY", "T_MY:KEY"]) {
      expect(checkTouchLayoutIdentifiers(result(layoutWithIds([id])))).toHaveLength(1);
    }
  });

  it("rejects an empty id with its own wording, naming the layer", () => {
    // `""` in a message tells the author nothing; the layer locates it.
    const findings = checkTouchLayoutIdentifiers(result(layoutWithIds([""])));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("no id");
    expect(findings[0]?.message).toContain("default");
  });

  it("is an ERROR at layer A — this is validity, not hygiene", () => {
    // The whole routing decision in two assertions. If either of these changes,
    // 0x05A has drifted out of Layer A′ and the layer boundary is no longer where
    // the contract says it is.
    const findings = checkTouchLayoutIdentifiers(result(layoutWithIds(["1BAD"])));
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.layer).toBe("A");
  });

  it("descends into sk, multitap, and flick sub-keys", () => {
    // An invalid id on a longpress entry fails the compile exactly as one on a
    // main key does.
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    {
                      nodeId: "n0",
                      id: "T_HOST",
                      text: "h",
                      sk: [{ nodeId: "n1", id: "1BADSK", text: "s" }],
                      multitap: [{ nodeId: "n2", id: "2BADMT", text: "m" }],
                      flick: { n: { nodeId: "n3", id: "3BADFL", text: "f" } },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    const findings = checkTouchLayoutIdentifiers(result(layout));
    expect(findings).toHaveLength(3);
  });

  it("reports one finding per DISTINCT invalid id, not per occurrence", () => {
    // An id repeated across layers is one authoring mistake with one fix.
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: [{ keys: [{ nodeId: "a", id: "1BAD", text: "x" }] }] },
            { id: "shift", rows: [{ keys: [{ nodeId: "b", id: "1BAD", text: "X" }] }] },
          ],
        },
      ],
      nodeIds: [],
    };
    expect(checkTouchLayoutIdentifiers(result(layout))).toHaveLength(1);
  });

  it("returns nothing when there is no touch layout at all", () => {
    // The common case for a desktop-only keyboard.
    expect(checkTouchLayoutIdentifiers(result())).toEqual([]);
  });
});

describe("0x05A is wired into the PARSE-stage import-fidelity suite", () => {
  it("appears in runImportFidelityParseChecks output", () => {
    // Placement matters: the parse stage runs once on import, outside the 300 ms
    // debounce cycle. Layer A′ must never be reached from runAllChecks.
    const findings = runImportFidelityParseChecks(result(layoutWithIds(["1BAD"])), "");
    expect(findings.some((f) => f.code === TOUCH_LAYOUT_INVALID_IDENTIFIER_CODE)).toBe(true);
  });

  it("emits nothing for a valid layout, so a clean import stays clean", () => {
    const findings = runImportFidelityParseChecks(result(layoutWithIds(["T_OK"])), "");
    expect(findings.some((f) => f.code === TOUCH_LAYOUT_INVALID_IDENTIFIER_CODE)).toBe(false);
  });
});

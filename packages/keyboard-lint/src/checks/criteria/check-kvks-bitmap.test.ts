import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRStore, KeyboardIR, KvksIR } from "@keyboard-studio/contracts";
import { checkKvksBlank, checkRaltMissingUsealtgr } from "./check-kvks.js";
import { checkBitmapPlaceholder } from "./check-bitmap.js";

const KVKS_PATH = "source/demo.kvks";

function kvks(layers: KvksIR["layers"], usealtgr = false): KvksIR {
  return { layers, usealtgr, nodeIds: [] };
}

function irWithRalt(): KeyboardIR {
  return makeTestIR({
    header: { keyboardId: "demo" },
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [{ kind: "vkey", name: "K_1", modifiers: ["RALT"] }],
            output: [{ kind: "char", value: "¡" }],
          },
        ],
      },
    ],
  });
}

function irPlain(): KeyboardIR {
  return makeTestIR({ header: { keyboardId: "demo" } });
}

describe("checkRaltMissingUsealtgr (7.5)", () => {
  it("flags RALT chords when the .kvks lacks usealtgr", () => {
    const { findings } = checkRaltMissingUsealtgr(
      irWithRalt(),
      kvks([{ shift: "", keys: [{ vkey: "K_A", label: "a" }] }], false),
      KVKS_PATH,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_RALT_MISSING_USEALTGR");
  });

  it("passes when the .kvks carries usealtgr", () => {
    expect(
      checkRaltMissingUsealtgr(
        irWithRalt(),
        kvks([{ shift: "", keys: [{ vkey: "K_A", label: "a" }] }], true),
        KVKS_PATH,
      ).findings,
    ).toEqual([]);
  });

  it("passes when no rule uses RALT, and when there is no .kvks at all", () => {
    expect(
      checkRaltMissingUsealtgr(irPlain(), kvks([], false), KVKS_PATH).findings,
    ).toEqual([]);
    expect(
      checkRaltMissingUsealtgr(irWithRalt(), undefined, undefined).findings,
    ).toEqual([]);
  });
});

describe("checkKvksBlank (7.16)", () => {
  it("passes a populated .kvks", () => {
    expect(
      checkKvksBlank(
        kvks([{ shift: "", keys: [{ vkey: "K_A", label: "a" }] }]),
        KVKS_PATH,
      ).findings,
    ).toEqual([]);
  });

  it("flags a .kvks with zero layers", () => {
    const { findings } = checkKvksBlank(kvks([]), KVKS_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KVKS_BLANK");
    expect(findings[0]!.message).toContain("blank");
  });

  it("flags a .kvks whose layers hold no keys", () => {
    const { findings } = checkKvksBlank(kvks([{ shift: "", keys: [] }]), KVKS_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("0 key(s)");
  });

  it("flags a present-but-unparseable .kvks as blank/unreadable, distinctly worded", () => {
    const { findings } = checkKvksBlank(undefined, KVKS_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("could not be parsed");
  });
});

function bitmapStore(value: string): IRStore {
  return {
    nodeId: "s-bitmap",
    name: "BITMAP",
    isSystem: true,
    items: [...value].map((c) => ({ kind: "char" as const, value: c })),
  };
}

describe("checkBitmapPlaceholder (7.9)", () => {
  it("flags the qaa.ico template placeholder", () => {
    const ir = makeTestIR({
      header: { keyboardId: "demo" },
      stores: [bitmapStore("qaa.ico")],
    });
    const { findings } = checkBitmapPlaceholder(ir, ["source/demo.ico"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_BITMAP_PLACEHOLDER");
    expect(findings[0]!.message).toContain("placeholder");
  });

  it("flags a referenced .ico missing from the package", () => {
    const ir = makeTestIR({
      header: { keyboardId: "demo" },
      stores: [bitmapStore("demo.ico")],
    });
    const { findings } = checkBitmapPlaceholder(ir, ["source/demo.kmn"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("no such .ico");
  });

  it("passes when the referenced .ico ships in the package", () => {
    const ir = makeTestIR({
      header: { keyboardId: "demo" },
      stores: [bitmapStore("demo.ico")],
    });
    expect(
      checkBitmapPlaceholder(ir, ["source/demo.kmn", "source/demo.ico"]).findings,
    ).toEqual([]);
  });

  it("is silent when the keyboard declares no &BITMAP", () => {
    expect(checkBitmapPlaceholder(irPlain(), []).findings).toEqual([]);
  });
});

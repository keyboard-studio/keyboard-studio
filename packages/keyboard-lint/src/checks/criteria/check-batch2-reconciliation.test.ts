import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  checkPuaFontDisplayMap,
  checkPuaNotInExperimental,
  displayMapReference,
} from "./check-produced-set.js";
import { checkRedundantTouchLayouts } from "./check-touch-layouts.js";
import { checkKpsTargetsMatch } from "./check-kps-targets.js";

function irWithOutput(value: string): KeyboardIR {
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
            context: [],
            output: [{ kind: "char", value }],
          },
        ],
      },
    ],
  });
}

describe("checkPuaNotInExperimental (7.12)", () => {
  it("flags PUA output in release/ placement", () => {
    const { findings } = checkPuaNotInExperimental(
      irWithOutput("\u{E001}"),
      "release",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_PUA_NOT_IN_EXPERIMENTAL");
  });

  it("passes PUA output in experimental/, naming the codepoints", () => {
    const { findings, verified } = checkPuaNotInExperimental(
      irWithOutput("\u{E001}"),
      "experimental",
    );
    expect(findings).toEqual([]);
    expect(verified).toEqual(["In experimental/; PUA codepoints: U+E001."]);
  });

  it("passes non-PUA output anywhere, noting the absence", () => {
    const { findings, verified } = checkPuaNotInExperimental(
      irWithOutput("a"),
      "release",
    );
    expect(findings).toEqual([]);
    expect(verified).toEqual(["No PUA codepoints in the produced output."]);
  });
});

describe("checkPuaFontDisplayMap (7.14)", () => {
  it("flags PUA output + bundled font + no &DISPLAYMAP", () => {
    const { findings } = checkPuaFontDisplayMap(irWithOutput("\u{E001}"), {
      hasBundledFont: true,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_PUA_FONT_NO_DISPLAYMAP");
  });

  it("passes when a &DISPLAYMAP store is declared, naming it", () => {
    const ir = makeTestIR({
      header: { keyboardId: "demo" },
      stores: [
        {
          nodeId: "s1",
          name: "DISPLAYMAP",
          isSystem: true,
          items: [{ kind: "char", value: "demo.json" }],
        },
      ],
      groups: [
        {
          nodeId: "g1",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            {
              nodeId: "r1",
              context: [],
              output: [{ kind: "char", value: "\u{E001}" }],
            },
          ],
        },
      ],
    });
    expect(displayMapReference(ir)).toBe("demo.json");
    const { findings, verified } = checkPuaFontDisplayMap(ir, {
      hasBundledFont: true,
    });
    expect(findings).toEqual([]);
    expect(verified).toEqual(["Found: store(&DISPLAYMAP) -> demo.json."]);
  });

  it("is moot without PUA output, and without a bundled font", () => {
    const noPua = checkPuaFontDisplayMap(irWithOutput("a"), {
      hasBundledFont: true,
    });
    expect(noPua.findings).toEqual([]);
    expect(noPua.verified).toEqual([
      "No PUA codepoints in the produced output.",
    ]);
    const noFont = checkPuaFontDisplayMap(irWithOutput("\u{E001}"), {
      hasBundledFont: false,
    });
    expect(noFont.findings).toEqual([]);
    expect(noFont.verified).toEqual(["No bundled font."]);
  });
});

function platform(
  id: "phone" | "tablet",
  layerIds: string[],
  text = "a",
): TouchLayoutIR["platforms"][number] {
  return {
    id,
    layers: layerIds.map((layerId) => ({
      id: layerId,
      rows: [{ keys: [{ nodeId: `n-${layerId}`, id: "K_A", text }] }],
    })),
  };
}

describe("checkRedundantTouchLayouts (7.19)", () => {
  const TL: TouchLayoutIR = {
    platforms: [platform("phone", ["default", "shift"]), platform("tablet", ["default", "shift"])],
    nodeIds: [],
  };

  it("flags identical phone and tablet layouts", () => {
    const { findings } = checkRedundantTouchLayouts(TL, "source/demo.keyman-touch-layout");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_REDUNDANT_TOUCH_LAYOUTS");
  });

  it("passes when the layers differ (ids or key text)", () => {
    const byId: TouchLayoutIR = {
      platforms: [platform("phone", ["default"]), platform("tablet", ["default", "shift"])],
      nodeIds: [],
    };
    expect(checkRedundantTouchLayouts(byId, "x").findings).toEqual([]);
    const byText: TouchLayoutIR = {
      platforms: [platform("phone", ["default"], "a"), platform("tablet", ["default"], "b")],
      nodeIds: [],
    };
    expect(checkRedundantTouchLayouts(byText, "x").findings).toEqual([]);
  });

  it("is silent when only one platform exists", () => {
    const phoneOnly: TouchLayoutIR = {
      platforms: [platform("phone", ["default"])],
      nodeIds: [],
    };
    expect(checkRedundantTouchLayouts(phoneOnly, "x").findings).toEqual([]);
  });
});

describe("checkKpsTargetsMatch (8.13)", () => {
  function irWithTargets(targets: string[]): KeyboardIR {
    return makeTestIR({ header: { keyboardId: "demo", targets } });
  }
  const KPS = "source/demo.kps";

  it("passes when .kmn targets, .kps targets, and compiled files agree", () => {
    expect(
      checkKpsTargetsMatch({
        ir: irWithTargets(["windows", "web"]),
        kpsTargets: ["windows", "web"],
        kpsFileNames: ["..\\build\\demo.kmx", "..\\build\\demo.js"],
        kpsPath: KPS,
      }).findings,
    ).toEqual([]);
  });

  it("expands 'any' in either declared set before comparing", () => {
    expect(
      checkKpsTargetsMatch({
        ir: irWithTargets(["any"]),
        kpsTargets: ["windows", "macosx", "linux", "web", "mobile", "tablet"],
        kpsFileNames: [],
        kpsPath: KPS,
      }).findings,
    ).toEqual([]);
  });

  it("flags a declared-target disagreement in each direction", () => {
    const { findings } = checkKpsTargetsMatch({
      ir: irWithTargets(["windows", "web"]),
      kpsTargets: ["windows", "mobile"],
      kpsFileNames: [],
      kpsPath: KPS,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_TARGETS_MISMATCH");
    expect(findings[0]!.message).toContain("web");
    expect(findings[0]!.message).toContain("mobile");
  });

  it("skips only the declared-set comparison when the .kps declares no targets", () => {
    expect(
      checkKpsTargetsMatch({
        ir: irWithTargets(["windows", "web"]),
        kpsTargets: [],
        kpsFileNames: ["..\\build\\demo.kmx", "..\\build\\demo.js"],
        kpsPath: KPS,
      }).findings,
    ).toEqual([]);
    const { findings } = checkKpsTargetsMatch({
      ir: irWithTargets(["windows"]),
      kpsTargets: [],
      kpsFileNames: ["..\\build\\demo.js"],
      kpsPath: KPS,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain(".js");
  });

  it("flags a shipped .js with no web-capable target declared", () => {
    const { findings } = checkKpsTargetsMatch({
      ir: irWithTargets(["windows"]),
      kpsTargets: ["windows"],
      kpsFileNames: ["..\\build\\demo.js"],
      kpsPath: KPS,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain(".js");
  });

  it("flags a shipped .kmx with no desktop target declared", () => {
    const { findings } = checkKpsTargetsMatch({
      ir: irWithTargets(["web"]),
      kpsTargets: ["web"],
      kpsFileNames: ["..\\build\\demo.kmx"],
      kpsPath: KPS,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain(".kmx");
  });
});

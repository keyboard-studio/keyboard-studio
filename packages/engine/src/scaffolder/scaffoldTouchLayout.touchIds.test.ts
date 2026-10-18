/**
 * Spec 104 FR-022 (T019) — the scaffolder reuses existing ruled T_ ids.
 *
 * Before this change, a keyboard whose .kmn defines ruled T_ keys but which
 * has no touch layout got a scaffold in which those characters were
 * re-minted as U_ longpresses/extras (audit gap 4): T_0300's guarded grave
 * became an UNGUARDED U_0300 longpress on K_E (the diablock guard silently
 * lost), and no T_ key appeared anywhere. The scaffold now places the
 * ruled T_ ids as keys on the layers their rules belong to, with rule
 * linkage intact — proven by tap simulation against the compiled fixture
 * (the guard still swallows the mark after a space).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS, type CompileResult, type KeyboardIR, type TouchLayoutIR } from "@keyboard-studio/contracts";
import { parse as parseKmn } from "../codec/index.js";
import { parseTouchLayout, emitTouchLayout } from "../codec/parse-touch.js";
import { compile } from "../compiler/index.js";
import { TouchTapSession } from "../simulator/tapSimulation.js";
import { scaffoldTouchLayout } from "./scaffoldTouchLayout.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, "../pattern-apply/__fixtures__/touch-id/sil_cameroon_qwerty");
const FIXTURE_KMN = readFileSync(resolve(fixtureDir, "sil_cameroon_qwerty.kmn"), "utf8");
const FIXTURE_LAYOUT = readFileSync(
  resolve(fixtureDir, "sil_cameroon_qwerty.keyman-touch-layout"),
  "utf8",
);

function cameroonIr(withShippedLayout: boolean): KeyboardIR {
  const { ir } = parseKmn(FIXTURE_KMN, "sil_cameroon_qwerty");
  if (!withShippedLayout) return ir;
  return { ...ir, touchLayout: parseTouchLayout(FIXTURE_LAYOUT) };
}

function allKeys(layout: TouchLayoutIR): Array<{ layerId: string; key: TouchLayoutIR["platforms"][number]["layers"][number]["rows"][number]["keys"][number] }> {
  const out: Array<{ layerId: string; key: TouchLayoutIR["platforms"][number]["layers"][number]["rows"][number]["keys"][number] }> = [];
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) out.push({ layerId: layer.id, key });
      }
    }
  }
  return out;
}

function mainKey(layout: TouchLayoutIR, platformId: string, layerId: string, keyId: string) {
  const platform = layout.platforms.find((p) => p.id === platformId);
  const layer = platform?.layers.find((l) => l.id === layerId);
  return layer?.rows.flatMap((r) => r.keys).find((k) => k.id === keyId);
}

describe("scaffoldTouchLayout — spec 104 T019 ruled T_ identity (Case A: no touch layout)", () => {
  const layout = scaffoldTouchLayout(cameroonIr(false));

  it("places the ruled T_ ids as keys on the layers their rules belong to", () => {
    expect(mainKey(layout, "phone", "default", "T_0300")?.text).toBe("̀");
    expect(mainKey(layout, "phone", "default", "T_030D")?.text).toBe("̍");
    expect(mainKey(layout, "phone", "default", "T_002E")?.text).toBe(".");
    // T_030D carries a SHIFT rule form; T_0300 does not.
    expect(mainKey(layout, "phone", "shift", "T_030D")?.text).toBe("̍");
    expect(mainKey(layout, "phone", "shift", "T_0300")).toBeUndefined();
  });

  it("never re-mints a ruled T_ character under a new U_ id (no U_0300/U_030D longpress spill)", () => {
    const reminted = allKeys(layout).filter(
      ({ key }) =>
        key.id === "U_0300" ||
        key.id === "U_030D" ||
        (key.sk ?? []).some((s) => s.id === "U_0300" || s.id === "U_030D"),
    );
    expect(reminted).toEqual([]);
  });
});

describe("scaffoldTouchLayout — spec 104 T019 phone-from-tablet reseed (Case B: tablet-only layout)", () => {
  const layout = scaffoldTouchLayout(cameroonIr(true));

  it("carries the shipped tablet platform through untouched", () => {
    expect(mainKey(layout, "tablet", "default", "T_0300")).toBeDefined();
    expect(mainKey(layout, "tablet", "default", "T_002E")).toBeDefined();
  });

  it("the synthesized phone platform places the ruled T_ ids with their linkage", () => {
    expect(mainKey(layout, "phone", "default", "T_0300")?.text).toBe("̀");
    expect(mainKey(layout, "phone", "default", "T_030D")?.text).toBe("̍");
    expect(mainKey(layout, "phone", "default", "T_002E")?.text).toBe(".");
  });
});

/**
 * Compile a scaffolded layout against the fixture .kmn and tap it. The
 * tap harness drives a tablet-form-factor device, so the platform under
 * test is relabelled "tablet" in the test VFS only.
 */
async function compileScaffolded(layout: TouchLayoutIR, platformId: string): Promise<CompileResult> {
  const platform = layout.platforms.find((p) => p.id === platformId)!;
  const relabelled: TouchLayoutIR = {
    platforms: [{ ...platform, id: "tablet" }],
    nodeIds: [],
  };
  const vfs = createVirtualFS([
    { path: "source/sil_cameroon_qwerty.kmn", content: FIXTURE_KMN, isBinary: false },
    {
      path: "source/sil_cameroon_qwerty.keyman-touch-layout",
      content: emitTouchLayout(relabelled),
      isBinary: false,
    },
  ]);
  const compiled = await compile(vfs, "sil_cameroon_qwerty");
  expect(
    compiled.success,
    `scaffolded layout must compile: ${JSON.stringify(compiled.diagnostics)}`,
  ).toBe(true);
  return compiled;
}

describe("scaffoldTouchLayout — spec 104 T019 tap proof (production preserved, guard intact)", () => {
  let caseA: TouchTapSession;
  let caseB: TouchTapSession;

  beforeAll(async () => {
    caseA = TouchTapSession.fromCompiled(
      await compileScaffolded(scaffoldTouchLayout(cameroonIr(false)), "phone"),
    );
    caseB = TouchTapSession.fromCompiled(
      await compileScaffolded(scaffoldTouchLayout(cameroonIr(true)), "phone"),
    );
  }, 120_000);

  it("Case A scaffold: the T_ keys produce through their rules, diablock guard included", () => {
    expect(caseA.tap("default", "T_0300", "a").buffer).toBe("à");
    // The guard survived scaffolding: after a space the mark is swallowed.
    // (The pre-fix U_0300 longpress spill produced the mark unguarded.)
    expect(caseA.tap("default", "T_0300", " ").buffer).toBe(" ");
    expect(caseA.tap("default", "T_002E").buffer).toBe(".");
    expect(caseA.tap("shift", "T_030D").buffer).toBe("̍");
  });

  it("Case B phone reseed: the phone platform's T_ keys produce identically", () => {
    expect(caseB.tap("default", "T_0300", "a").buffer).toBe("à");
    expect(caseB.tap("default", "T_0300", " ").buffer).toBe(" ");
    expect(caseB.tap("default", "T_002E").buffer).toBe(".");
  });
});

// runCriteriaChecks wiring (spec 084 Batch 1): the checks run through
// lintWithContext only when the caller assembled a CriteriaLintInput —
// the locked phase-gate path never sets one, so its findings cannot
// change — and they read the context's parsed IR.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { CriteriaLintInput } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { lintWithContext } from "./lintContext.js";

const ID = "demo";

const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Demo'",
  "store(&KEYBOARDVERSION) 'v1.02'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
].join("\n");

function fixtureVfs() {
  return createVirtualFS([
    { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${ID}.woff`, content: new Uint8Array([0]), isBinary: true },
  ]);
}

function fixtureInput(
  over: Partial<CriteriaLintInput> = {},
): CriteriaLintInput {
  return {
    kpsFileNames: [],
    kpsFontRefs: [],
    kpsLanguages: [],
    kpsTargets: [],
    placement: "release",
    deprecationInPlay: false,
    scratchScan: false,
    ...over,
  };
}

function fixtureIR() {
  return makeTestIR({
    header: { keyboardId: ID, name: "Demo", version: "v1.02" },
  });
}

describe("runCriteriaChecks via lintWithContext", () => {
  it("emits nothing extra when no CriteriaLintInput was assembled", async () => {
    const findings = await lintWithContext(fixtureVfs(), ID, {
      keyboardIR: fixtureIR(),
    });
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_LINT_VERSION_FORMAT");
    expect(codes).not.toContain("KM_LINT_WOFF_FONT_IN_PACKAGE");
  });

  it("runs the Batch 1 checks when a CriteriaLintInput is present", async () => {
    const findings = await lintWithContext(fixtureVfs(), ID, {
      keyboardIR: fixtureIR(),
      criteriaInput: fixtureInput(),
    });
    const codes = findings.map((f) => f.code);
    // v1.02 fails all three version rows through the real runner.
    expect(codes).toContain("KM_LINT_VERSION_FORMAT");
    expect(codes).toContain("KM_LINT_VERSION_LEADING_ZERO");
    expect(codes).toContain("KM_LINT_VERSION_V_PREFIX");
    // The .woff in the VFS inventory is caught by 9.6.
    expect(codes).toContain("KM_LINT_WOFF_FONT_IN_PACKAGE");
  });

  it("Batch 2: 1.9 fires on duplicate files only with a CriteriaLintInput", async () => {
    const vfs = createVirtualFS([
      { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
      { path: "source/help/kb.css", content: "img { width: 100%; }", isBinary: false },
      { path: "source/welcome/kb.css", content: "img { width: 100%; }", isBinary: false },
    ]);
    const withInput = await lintWithContext(vfs, ID, {
      keyboardIR: fixtureIR(),
      criteriaInput: fixtureInput(),
    });
    expect(withInput.map((f) => f.code)).toContain(
      "KM_LINT_DUPLICATE_SOURCE_FILES",
    );
    const without = await lintWithContext(vfs, ID, { keyboardIR: fixtureIR() });
    expect(without.map((f) => f.code)).not.toContain(
      "KM_LINT_DUPLICATE_SOURCE_FILES",
    );
  });

  it("Batch 2: 8.13 fires when declared .kps targets disagree with the IR, and stays silent with none supplied", async () => {
    const ir = makeTestIR({
      header: { keyboardId: ID, targets: ["windows", "web"] },
    });
    const fired = await lintWithContext(fixtureVfs(), ID, {
      keyboardIR: ir,
      criteriaInput: fixtureInput({ kpsTargets: ["windows"] }),
    });
    expect(fired.map((f) => f.code)).toContain("KM_LINT_KPS_TARGETS_MISMATCH");
    const silent = await lintWithContext(fixtureVfs(), ID, {
      keyboardIR: ir,
      criteriaInput: fixtureInput({ kpsTargets: [] }),
    });
    expect(silent.map((f) => f.code)).not.toContain(
      "KM_LINT_KPS_TARGETS_MISMATCH",
    );
  });

  it("Batch 2: 7.19 fires on identical phone and tablet touch layouts", async () => {
    const layout = JSON.stringify({
      phone: { layer: [{ id: "default", row: [{ key: [{ id: "K_A", text: "a" }] }] }] },
      tablet: { layer: [{ id: "default", row: [{ key: [{ id: "K_A", text: "a" }] }] }] },
    });
    const vfs = createVirtualFS([
      { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
      { path: `source/${ID}.keyman-touch-layout`, content: layout, isBinary: false },
    ]);
    const findings = await lintWithContext(vfs, ID, {
      keyboardIR: fixtureIR(),
      criteriaInput: fixtureInput(),
    });
    expect(findings.map((f) => f.code)).toContain(
      "KM_LINT_REDUNDANT_TOUCH_LAYOUTS",
    );
  });

  it("Batch 2: 7.12 and 7.14 fire on PUA output in release placement with a bundled font", async () => {
    const ir = makeTestIR({
      header: { keyboardId: ID },
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
    const findings = await lintWithContext(fixtureVfs(), ID, {
      keyboardIR: ir,
      criteriaInput: fixtureInput({ kpsFontRefs: ["..\\shared\\F.ttf"] }),
    });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_LINT_PUA_NOT_IN_EXPERIMENTAL");
    expect(codes).toContain("KM_LINT_PUA_FONT_NO_DISPLAYMAP");
  });

  it("runs the scratch scan only when the input asks for it (foreign arm)", async () => {
    const vfs = createVirtualFS([
      { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
      { path: "notes.txt.bak", content: "x", isBinary: false },
    ]);
    const authored = await lintWithContext(vfs, ID, {
      criteriaInput: fixtureInput({ scratchScan: false }),
    });
    expect(authored.map((f) => f.code)).not.toContain(
      "KM_LINT_STRAY_SCRATCH_FILES",
    );
    const foreign = await lintWithContext(vfs, ID, {
      criteriaInput: fixtureInput({ scratchScan: true }),
    });
    expect(foreign.map((f) => f.code)).toContain("KM_LINT_STRAY_SCRATCH_FILES");
  });
});

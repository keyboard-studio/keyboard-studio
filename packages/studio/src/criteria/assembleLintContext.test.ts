// Tests for the authored lint assembly (spec 084, Phase 2, T2.1/T2.3).
//
// Fixture: a small VFS with a parseable .kmn, a phone touch layout with
// only 2 rows (§18.2 KM_WARN_TOUCH_ROW_COUNT territory), and a HISTORY.md
// whose newest entry is NOT at the top. The HISTORY failure is deliberate:
// doc findings must NOT appear in an engine run over the assembled
// context, because assembleLintContext never sets docLintInput — the doc
// band arrives via useDocumentationFindings() instead (plan §4). The test
// pins that separation, plus the §18.6 degradation contract: without an
// inventory, contextMissing names KM_LINT_INVENTORY_UNCOVERED and the
// engine emits no §18.6 finding, while the touch findings still appear.

import { describe, expect, it } from "vitest";

import { createVirtualFS, makeLinguistInventory } from "@keyboard-studio/contracts";
import type { LinguistInventory, VirtualFS } from "@keyboard-studio/contracts";
import { KeyboardLintEngine } from "@keymanapp/keyboard-lint";

import {
  assembleLintContext,
  INVENTORY_UNCOVERED_CODE,
} from "./assembleLintContext.ts";
import { mergeLintFindings } from "../hooks/useCriteriaFindings.ts";
import type { LintFinding } from "@keyboard-studio/contracts";

const KEYBOARD_ID = "criteria_fixture";

const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Criteria Fixture'",
  "store(&KEYBOARDVERSION) '1.0'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "",
].join("\n");

// Phone with a single layer of 2 rows: §18.2 expects 4-5 rows on phone.
const TOUCH_LAYOUT = JSON.stringify({
  phone: {
    layer: [
      {
        id: "default",
        row: [
          { id: 1, key: [{ id: "K_A", text: "a" }] },
          { id: 2, key: [{ id: "K_B", text: "b" }] },
        ],
      },
    ],
  },
});

// Newest version (2.0) is below the top entry (1.0): KM_LINT_HISTORY_ORDER
// territory — for the DOC path, not for the engine run below.
const HISTORY_MD = [
  "# Criteria Fixture Change History",
  "",
  "## 1.0 (2026-01-01)",
  "",
  "* Initial release.",
  "",
  "## 2.0 (2026-02-01)",
  "",
  "* A newer entry that is not at the top.",
  "",
].join("\n");

function fixtureVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
    {
      path: `source/${KEYBOARD_ID}.keyman-touch-layout`,
      content: TOUCH_LAYOUT,
      isBinary: false,
    },
    { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
  ]);
}

function fixtureInventory(): LinguistInventory {
  return makeLinguistInventory({
    language: "en",
    script: "Latin",
    alphabetCore: { lowercase: ["a", "b", "z"], uppercase: ["A", "B", "Z"] },
    mandatoryDiacriticsAndLigatures: [],
    languageSpecificPunctuation: [],
    numerals: [],
  });
}

describe("assembleLintContext", () => {
  it("parses the .kmn from the VFS into ctx.keyboardIR", () => {
    const { ctx } = assembleLintContext({ vfs: fixtureVfs(), keyboardId: KEYBOARD_ID });
    expect(ctx.keyboardIR).toBeDefined();
    expect(ctx.keyboardIR?.header.name).toBe("Criteria Fixture");
  });

  it("never sets docLintInput (doc findings arrive via the existing path)", () => {
    const { ctx } = assembleLintContext({ vfs: fixtureVfs(), keyboardId: KEYBOARD_ID });
    expect(ctx.docLintInput).toBeUndefined();
    expect("docLintInput" in ctx).toBe(false);
  });

  it("without an inventory, names KM_LINT_INVENTORY_UNCOVERED as context-missing", () => {
    const { ctx, contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.inventory).toBeUndefined();
    expect(contextMissing[INVENTORY_UNCOVERED_CODE]).toContain("linguist inventory");
  });

  it("with an inventory, passes it through and reports nothing missing", () => {
    const inventory = fixtureInventory();
    const { ctx, contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
      inventory,
    });
    expect(ctx.inventory).toBe(inventory);
    expect(contextMissing).toEqual({});
  });

  it("without a .kmn, degrades: no IR and the missing input is named", () => {
    const vfs = createVirtualFS([
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const { ctx, contextMissing } = assembleLintContext({ vfs, keyboardId: KEYBOARD_ID });
    expect(ctx.keyboardIR).toBeUndefined();
    expect(contextMissing[INVENTORY_UNCOVERED_CODE]).toContain("parsed keyboard source");
    expect(contextMissing[INVENTORY_UNCOVERED_CODE]).toContain("linguist inventory");
  });
});

describe("engine run over the assembled context (fixture VFS)", () => {
  it("yields the §18 touch finding, but no §18.6 and no doc findings", async () => {
    const vfs = fixtureVfs();
    const { ctx, contextMissing } = assembleLintContext({ vfs, keyboardId: KEYBOARD_ID });

    const findings = await new KeyboardLintEngine().lintWithContext(vfs, KEYBOARD_ID, ctx);
    const codes = findings.map((f) => f.code);

    // The touch checks run from the VFS itself.
    expect(codes).toContain("KM_WARN_TOUCH_ROW_COUNT");
    // §18.6 did not run (no inventory): no finding, and the absence is
    // named in contextMissing instead of silently passing.
    expect(codes).not.toContain(INVENTORY_UNCOVERED_CODE);
    expect(contextMissing[INVENTORY_UNCOVERED_CODE]).toContain("linguist inventory");
    // The out-of-order HISTORY.md produces NO doc finding here: the doc
    // band never goes through the engine in authored mode (plan §4).
    expect(codes).not.toContain("KM_LINT_HISTORY_ORDER");
  });

  it("with an inventory supplied, §18.6 is no longer context-missing", async () => {
    const vfs = fixtureVfs();
    const { ctx, contextMissing } = assembleLintContext({
      vfs,
      keyboardId: KEYBOARD_ID,
      inventory: fixtureInventory(),
    });
    expect(contextMissing).toEqual({});

    const findings = await new KeyboardLintEngine().lintWithContext(vfs, KEYBOARD_ID, ctx);
    // The touch finding still runs alongside.
    expect(findings.map((f) => f.code)).toContain("KM_WARN_TOUCH_ROW_COUNT");
    // Note: no KM_LINT_INVENTORY_UNCOVERED is asserted either way here —
    // the §18.6 check scope-guards to scaffolded IRs and parseKmn yields
    // an imported IR, so on this fixture it emits nothing. What Phase 2
    // owns is the assembly contract: both inputs present, nothing named
    // missing.
  });
});

describe("mergeLintFindings (doc + engine dedupe)", () => {
  const docFinding: LintFinding = {
    code: "KM_LINT_HISTORY_ORDER",
    severity: "warning",
    layer: "C",
    message: "HISTORY.md's top entry is version 1.0, but 2.0 is newer.",
    origin: "upstream",
  };

  it("keeps each (code, message) at most once, first occurrence winning", () => {
    const engineDuplicate: LintFinding = { ...docFinding, origin: undefined };
    const engineOnly: LintFinding = {
      code: "KM_WARN_TOUCH_ROW_COUNT",
      severity: "warning",
      layer: "C",
      message: "Platform \"phone\" layer \"default\" has 2 row(s); expected 4-5.",
    };
    const merged = mergeLintFindings([docFinding], [engineDuplicate, engineOnly]);
    expect(merged).toHaveLength(2);
    // The doc copy wins, preserving its upstream reclassification.
    expect(merged[0]).toBe(docFinding);
    expect(merged[1]).toBe(engineOnly);
  });

  it("does not dedupe the same code with different messages", () => {
    const other: LintFinding = { ...docFinding, message: "A different problem." };
    expect(mergeLintFindings([docFinding], [other])).toHaveLength(2);
  });
});

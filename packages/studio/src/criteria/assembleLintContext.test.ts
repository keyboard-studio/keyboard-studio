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

import {
  createVirtualFS,
  makeLinguistInventory,
} from "@keyboard-studio/contracts";
import type { LinguistInventory, VirtualFS } from "@keyboard-studio/contracts";
import { KeyboardLintEngine } from "@keymanapp/keyboard-lint";

import {
  applyInventoryOutcome,
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

// A populated .kvks (one layer, one key) with a neutral font: §7.16
// judges it not-blank, and §8.12 has nothing to say about it.
const KVKS = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<visualkeyboard>",
  "  <header><version>10.0</version><flags></flags></header>",
  '  <encoding name="unicode" fontname="Charis SIL" fontsize="-12">',
  '    <layer shift=""><key vkey="K_A">a</key></layer>',
  "  </encoding>",
  "</visualkeyboard>",
].join("\n");

const KPS = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<Package>",
  "  <System><KeymanDeveloperVersion>10.0</KeymanDeveloperVersion></System>",
  "  <Options><Version>1.0</Version></Options>",
  "  <Info><Name>Criteria Fixture</Name></Info>",
  "  <Files>",
  "    <File><Name>..\\source\\criteria_fixture.kmn</Name><Description></Description><FileType>.kmn</FileType></File>",
  "  </Files>",
  "  <Keyboards>",
  "    <Keyboard><ID>criteria_fixture</ID><Name>Criteria Fixture</Name><Version>1.0</Version>",
  '      <Languages><Language ID="en">English</Language></Languages>',
  "    </Keyboard>",
  "  </Keyboards>",
  "</Package>",
].join("\n");

/** A minimal TTF binary whose name table carries one family record (ID 1, Windows). */
function buildMinimalFont(family: string): Uint8Array {
  const str: number[] = [];
  for (const c of family) str.push(0, c.charCodeAt(0));
  const headerSize = 6 + 12;
  const nameTable: number[] = [
    0, 0, 0, 1,
    (headerSize >> 8) & 0xff, headerSize & 0xff,
    0, 3, 0, 9, 0, 0, 0, 1,
    (str.length >> 8) & 0xff, str.length & 0xff, 0, 0,
    ...str,
  ];
  const nameOffset = 28;
  return new Uint8Array([
    0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
    0x6e, 0x61, 0x6d, 0x65, // "name"
    0, 0, 0, 0,
    0, 0, 0, nameOffset,
    (nameTable.length >> 24) & 0xff, (nameTable.length >> 16) & 0xff,
    (nameTable.length >> 8) & 0xff, nameTable.length & 0xff,
    ...nameTable,
  ]);
}

function fixtureVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
    {
      path: `source/${KEYBOARD_ID}.keyman-touch-layout`,
      content: TOUCH_LAYOUT,
      isBinary: false,
    },
    { path: `source/${KEYBOARD_ID}.kvks`, content: KVKS, isBinary: false },
    { path: `source/${KEYBOARD_ID}.kps`, content: KPS, isBinary: false },
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
    const { ctx } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.keyboardIR).toBeDefined();
    expect(ctx.keyboardIR?.header.name).toBe("Criteria Fixture");
  });

  it("Batch 3 §8.7: extracts the family of a .kps-listed font present in the VFS", () => {
    const font = buildMinimalFont("Fixture Sans");
    const kpsWithFont = KPS.replace(
      "</Files>",
      "    <File><Name>..\\\\source\\\\FixtureSans.ttf</Name><Description></Description><FileType>.ttf</FileType></File>\n  </Files>",
    );
    const vfs = createVirtualFS([
      { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
      { path: `source/${KEYBOARD_ID}.kps`, content: kpsWithFont, isBinary: false },
      { path: "source/FixtureSans.ttf", content: font, isBinary: true },
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const { ctx } = assembleLintContext({ vfs, keyboardId: KEYBOARD_ID });
    expect(ctx.criteriaInput?.kpsFontFamilies).toEqual(["Fixture Sans"]);
    expect(ctx.criteriaInput?.kpsFontRefs.some((r) => r.includes("FixtureSans"))).toBe(true);
  });

  it("Batch 3 §8.7: a listed font absent from the VFS contributes no family", () => {
    const kpsWithFont = KPS.replace(
      "</Files>",
      "    <File><Name>..\\\\source\\\\Missing.ttf</Name><Description></Description><FileType>.ttf</FileType></File>\n  </Files>",
    );
    const vfs = createVirtualFS([
      { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
      { path: `source/${KEYBOARD_ID}.kps`, content: kpsWithFont, isBinary: false },
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const { ctx } = assembleLintContext({ vfs, keyboardId: KEYBOARD_ID });
    expect(ctx.criteriaInput?.kpsFontFamilies).toEqual([]);
  });

  it("Batch 3 §18.7: a region with no CLDR currency entry is named context-missing", () => {
    const kpsWithRegion = KPS.replace(
      '<Language ID="en">English</Language>',
      '<Language ID="und-XX">Nowhere</Language>',
    );
    const vfs = createVirtualFS([
      { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
      { path: `source/${KEYBOARD_ID}.kps`, content: kpsWithRegion, isBinary: false },
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const { contextMissing } = assembleLintContext({ vfs, keyboardId: KEYBOARD_ID });
    expect(contextMissing.KM_LINT_MANDATED_CHAR_MISSING).toContain("XX");
  });

  it("Batch 3 §12.3: the contrastive attestation option crosses into the criteria input", () => {
    const attested = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
      contrastiveRegionAttested: true,
    });
    expect(attested.ctx.criteriaInput?.contrastiveRegionAttested).toBe(true);
    const plain = assembleLintContext({ vfs: fixtureVfs(), keyboardId: KEYBOARD_ID });
    expect(plain.ctx.criteriaInput?.contrastiveRegionAttested).toBe(false);
  });

  it("Batch 2 §8.13: a .kps with no <Targets> element contributes no declared targets and and is not a missing input", () => {
    const { ctx, contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.criteriaInput?.kpsTargets).toEqual([]);
    expect(contextMissing.KM_LINT_KPS_TARGETS_MISMATCH).toBeUndefined();
  });

  it("Batch 2 §8.13: a declared <Targets> list crosses into the criteria input and clears the gap", () => {
    const withTargets = KPS.replace(
      "</Keyboards>",
      "  <Targets>windows web</Targets>\n  </Keyboards>",
    );
    const vfs = createVirtualFS([
      { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
      { path: `source/${KEYBOARD_ID}.kps`, content: withTargets, isBinary: false },
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const { ctx, contextMissing } = assembleLintContext({
      vfs,
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.criteriaInput?.kpsTargets).toEqual(["windows", "web"]);
    expect(contextMissing.KM_LINT_KPS_TARGETS_MISMATCH).toBeUndefined();
  });

  it("KPJ pair: a root .kpj crosses into the criteria input and names nothing missing", () => {
    const kpj =
      "<KeymanDeveloperProject><Options><Version>2.0</Version></Options></KeymanDeveloperProject>";
    const vfs = createVirtualFS([
      { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
      { path: `${KEYBOARD_ID}.kpj`, content: kpj, isBinary: false },
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const { ctx, contextMissing } = assembleLintContext({
      vfs,
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.criteriaInput?.kpjPath).toBe(`${KEYBOARD_ID}.kpj`);
    expect(ctx.criteriaInput?.kpjText).toBe(kpj);
    expect(contextMissing.KM_LINT_KPJ_FORMAT_OUTDATED).toBeUndefined();
    expect(contextMissing.KM_LINT_KPJ_VERSION_BUMPED).toBeUndefined();
  });

  it("KPJ pair: a VFS with no .kpj names both codes context-missing (never a silent pass)", () => {
    const { ctx, contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.criteriaInput?.kpjPath).toBeUndefined();
    expect(contextMissing.KM_LINT_KPJ_FORMAT_OUTDATED).toBe(
      "the .kpj project file",
    );
    expect(contextMissing.KM_LINT_KPJ_VERSION_BUMPED).toBe(
      "the .kpj project file",
    );
  });

  it("KPJ pair: an outdated .kpj produces the 1.10b finding through the engine run, not 2.7", async () => {
    const vfs = createVirtualFS([
      { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
      {
        path: `${KEYBOARD_ID}.kpj`,
        content:
          "<KeymanDeveloperProject><Options><Version>1.0</Version></Options></KeymanDeveloperProject>",
        isBinary: false,
      },
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const { ctx } = assembleLintContext({ vfs, keyboardId: KEYBOARD_ID });
    const { findings: findings } = await new KeyboardLintEngine().lintWithContext(
      vfs,
      KEYBOARD_ID,
      ctx,
    );
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_LINT_KPJ_FORMAT_OUTDATED");
    expect(codes).not.toContain("KM_LINT_KPJ_VERSION_BUMPED");
  });

  it("never sets docLintInput (doc findings arrive via the existing path)", () => {
    const { ctx } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.docLintInput).toBeUndefined();
    expect("docLintInput" in ctx).toBe(false);
  });

  it("without an inventory, names KM_LINT_INVENTORY_UNCOVERED as context-missing", () => {
    const { ctx, contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.inventory).toBeUndefined();
    expect(contextMissing[INVENTORY_UNCOVERED_CODE]).toContain(
      "linguist inventory",
    );
  });

  it("with an inventory, passes it through and reports nothing missing", () => {
    const inventory = fixtureInventory();
    const { ctx, contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
      inventory,
    });
    expect(ctx.inventory).toBe(inventory);
    expect(contextMissing).toEqual({
      // The fixture VFS carries no .kpj, so both KPJ-pair inputs are
      // honestly named missing (spec 084 KPJ pair).
      KM_LINT_KPJ_FORMAT_OUTDATED: "the .kpj project file",
      KM_LINT_KPJ_VERSION_BUMPED: "the .kpj project file",
      // The fixture VFS carries no LICENSE.md, so both copyright-text
      // twin inputs are honestly named missing (Group A2 Batch 4).
      KM_LINT_COPYRIGHT_ABSENT: "LICENSE.md",
      KM_LINT_COPYRIGHT_SYNTAX: "LICENSE.md",
      // The fixture VFS carries no README.md / readme.htm /
      // welcome.htm / .php, so the doc-text twin inputs are honestly
      // named missing (Group A2 Batch 4).
      KM_LINT_VERSION_IN_DOCS: "the documentation files",
      KM_LINT_COPYRIGHT_IN_DOCS: "the documentation files",
      KM_LINT_README_KEYMAN_LINK_ABSENT: "README.md",
      KM_LINT_README_HELP_LINK_ABSENT: "README.md",
      KM_LINT_WELCOME_LANG_MISMATCH: "source/welcome.htm",
      // The fixture VFS carries no help .php, so the .php-content twin
      // inputs are honestly named missing (11.1b's existence check is
      // the finding itself, not a missing input).
      KM_LINT_PHP_STYLE_OUTSIDE: "the help .php",
      KM_LINT_PHP_CLOSING_TAGS: "the help .php",
      // The fixture passes no reviewContext (/review-only), so the six
      // repo-context codes are honestly named missing (Group A2 Batch 5
      // + Group C + 1.5/2.6). The §19 rows are applicability-gated, not
      // input-gated.
      KM_LINT_REPO_PLACEMENT_BAD:
        "the repository context (repo path and file list)",
      KM_LINT_REPO_NO_ORGANIZING_FOLDER:
        "the repository context (repo path and file list)",
      KM_LINT_REPO_ROOT_SOURCE:
        "the repository context (repo path and file list)",
      KM_LINT_FILES_OUTSIDE_FOLDER:
        "the repository context (repo path and file list)",
      KM_LINT_DUPLICATE_KEYBOARD_ID:
        "the repository context (repo path and file list)",
      KM_LINT_VERSION_NOT_INCREMENTED:
        "the repository context (repo path and file list)",
      KM_LINT_VERSION_NOT_BUMPED:
        "the repository context (repo path and file list)",
      KM_LINT_SPURIOUS_VERSION_BUMP:
        "the repository context (repo path and file list)",
    });
  });

  it("1.5: a PR reviewContext without the base lookup names it context-missing", () => {
    const { contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
      reviewContext: {
        repoPath: "experimental/c/criteria_fixture",
        treePaths: ["experimental/c/criteria_fixture/source/criteria_fixture.kmn"],
        isPr: true,
      },
    });
    expect(contextMissing["KM_LINT_DUPLICATE_KEYBOARD_ID"]).toBe(
      "the PR base-commit keyboard-ID lookup",
    );
  });

  it("1.5: a PR reviewContext with the base lookup names nothing missing for 1.5", () => {
    const { contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
      reviewContext: {
        repoPath: "experimental/c/criteria_fixture",
        treePaths: ["experimental/c/criteria_fixture/source/criteria_fixture.kmn"],
        isPr: true,
        idConflictAtBase: { baseSha: "abc1234", existingTiers: [] },
      },
    });
    expect(contextMissing["KM_LINT_DUPLICATE_KEYBOARD_ID"]).toBeUndefined();
  });

  it("1.5: a non-PR reviewContext needs no base lookup", () => {
    const { contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
      reviewContext: {
        repoPath: "release/c/criteria_fixture",
        treePaths: ["release/c/criteria_fixture/source/criteria_fixture.kmn"],
        isPr: false,
      },
    });
    expect(contextMissing["KM_LINT_DUPLICATE_KEYBOARD_ID"]).toBeUndefined();
  });

  it("2.6: a PR reviewContext without the base version names it context-missing", () => {
    const { contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
      reviewContext: {
        repoPath: "experimental/c/criteria_fixture",
        treePaths: ["experimental/c/criteria_fixture/source/criteria_fixture.kmn"],
        isPr: true,
        idConflictAtBase: { baseSha: "abc1234", existingTiers: [] },
      },
    });
    expect(contextMissing["KM_LINT_VERSION_NOT_INCREMENTED"]).toBe(
      "the PR base-commit .kmn version",
    );
  });

  it("2.6: a PR reviewContext with the base version names nothing missing for 2.6", () => {
    const { contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
      reviewContext: {
        repoPath: "experimental/c/criteria_fixture",
        treePaths: ["experimental/c/criteria_fixture/source/criteria_fixture.kmn"],
        isPr: true,
        idConflictAtBase: { baseSha: "abc1234", existingTiers: [] },
        baseKmnVersion: { baseSha: "abc1234", version: "1.0" },
      },
    });
    expect(contextMissing["KM_LINT_VERSION_NOT_INCREMENTED"]).toBeUndefined();
    expect(contextMissing["KM_LINT_VERSION_NOT_BUMPED"]).toBeUndefined();
    expect(contextMissing["KM_LINT_SPURIOUS_VERSION_BUMP"]).toBeUndefined();
  });

  it("2.1/2.2: a PR reviewContext without the base folder lookup names it context-missing", () => {
    const { contextMissing } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
      reviewContext: {
        repoPath: "experimental/c/criteria_fixture",
        treePaths: ["experimental/c/criteria_fixture/source/criteria_fixture.kmn"],
        isPr: true,
        baseKmnVersion: { baseSha: "abc1234", version: "1.0" },
      },
    });
    expect(contextMissing["KM_LINT_VERSION_NOT_BUMPED"]).toBe(
      "the PR base-commit keyboard-folder lookup",
    );
    expect(contextMissing["KM_LINT_VERSION_NOT_INCREMENTED"]).toBeUndefined();
  });

  it("without a .kmn, degrades: no IR and the missing input is named", () => {
    const vfs = createVirtualFS([
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const { ctx, contextMissing } = assembleLintContext({
      vfs,
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.keyboardIR).toBeUndefined();
    expect(contextMissing[INVENTORY_UNCOVERED_CODE]).toContain(
      "parsed keyboard source",
    );
    expect(contextMissing[INVENTORY_UNCOVERED_CODE]).toContain(
      "linguist inventory",
    );
  });

  it("assembles the Batch 1 CriteriaLintInput from the VFS's .kvks and .kps", () => {
    const { ctx } = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    const ci = ctx.criteriaInput;
    expect(ci).toBeDefined();
    expect(ci?.kvksPath).toBe(`source/${KEYBOARD_ID}.kvks`);
    expect(ci?.kvks?.layers.length).toBeGreaterThan(0);
    expect(ci?.kpsText).toContain("<Package>");
    expect(ci?.kpsFileNames.length).toBeGreaterThan(0);
    expect(ci?.kpsLanguages).toContain("en");
    // Authored defaults: release placement, no scratch scan, no
    // deprecation in play.
    expect(ci?.placement).toBe("release");
    expect(ci?.scratchScan).toBe(false);
    expect(ci?.deprecationInPlay).toBe(false);
  });

  it("without a .kvks, names KM_LINT_KVKS_BLANK as context-missing (absent is not blank)", () => {
    const vfs = createVirtualFS([
      { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
    ]);
    const { ctx, contextMissing } = assembleLintContext({
      vfs,
      keyboardId: KEYBOARD_ID,
    });
    expect(ctx.criteriaInput?.kvksPath).toBeUndefined();
    expect(contextMissing["KM_LINT_KVKS_BLANK"]).toContain(".kvks");
  });

  it("without a parsed IR, names every IR-dependent Batch 1 code as context-missing", () => {
    const vfs = createVirtualFS([
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const { contextMissing } = assembleLintContext({
      vfs,
      keyboardId: KEYBOARD_ID,
    });
    for (const code of [
      "KM_LINT_VERSION_FORMAT",
      "KM_LINT_TARGETS_ANY_NOT_ALONE",
      "KM_LINT_PUA_KEYBOARD_PLACEMENT",
      "KM_LINT_MATH_LATIN_LOOKALIKE",
    ]) {
      expect(contextMissing[code]).toContain("parsed keyboard source");
    }
  });
});

describe("engine run over the assembled context (fixture VFS)", () => {
  it("yields the §18 touch finding, but no §18.6 and no doc findings", async () => {
    const vfs = fixtureVfs();
    const { ctx, contextMissing } = assembleLintContext({
      vfs,
      keyboardId: KEYBOARD_ID,
    });

    const { findings: findings } = await new KeyboardLintEngine().lintWithContext(
      vfs,
      KEYBOARD_ID,
      ctx,
    );
    const codes = findings.map((f) => f.code);

    // The touch checks run from the VFS itself.
    expect(codes).toContain("KM_WARN_TOUCH_ROW_COUNT");
    // §18.6 did not run (no inventory): no finding, and the absence is
    // named in contextMissing instead of silently passing.
    expect(codes).not.toContain(INVENTORY_UNCOVERED_CODE);
    expect(contextMissing[INVENTORY_UNCOVERED_CODE]).toContain(
      "linguist inventory",
    );
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
    expect(contextMissing).toEqual({
      // The fixture VFS carries no .kpj, so both KPJ-pair inputs are
      // honestly named missing (spec 084 KPJ pair).
      KM_LINT_KPJ_FORMAT_OUTDATED: "the .kpj project file",
      KM_LINT_KPJ_VERSION_BUMPED: "the .kpj project file",
      // The fixture VFS carries no LICENSE.md / README.md / readme.htm /
      // welcome.htm / .php, so the Group A2 Batch 4 text-twin inputs are
      // honestly named missing (11.1b's existence check is the finding).
      KM_LINT_COPYRIGHT_ABSENT: "LICENSE.md",
      KM_LINT_COPYRIGHT_SYNTAX: "LICENSE.md",
      KM_LINT_VERSION_IN_DOCS: "the documentation files",
      KM_LINT_COPYRIGHT_IN_DOCS: "the documentation files",
      KM_LINT_README_KEYMAN_LINK_ABSENT: "README.md",
      KM_LINT_README_HELP_LINK_ABSENT: "README.md",
      KM_LINT_WELCOME_LANG_MISMATCH: "source/welcome.htm",
      KM_LINT_PHP_STYLE_OUTSIDE: "the help .php",
      KM_LINT_PHP_CLOSING_TAGS: "the help .php",
      // The fixture passes no reviewContext (/review-only), so the six
      // repo-context codes are honestly named missing (Group A2 Batch 5
      // + Group C + 1.5/2.6). The §19 rows are applicability-gated, not
      // input-gated.
      KM_LINT_REPO_PLACEMENT_BAD:
        "the repository context (repo path and file list)",
      KM_LINT_REPO_NO_ORGANIZING_FOLDER:
        "the repository context (repo path and file list)",
      KM_LINT_REPO_ROOT_SOURCE:
        "the repository context (repo path and file list)",
      KM_LINT_FILES_OUTSIDE_FOLDER:
        "the repository context (repo path and file list)",
      KM_LINT_DUPLICATE_KEYBOARD_ID:
        "the repository context (repo path and file list)",
      KM_LINT_VERSION_NOT_INCREMENTED:
        "the repository context (repo path and file list)",
      KM_LINT_VERSION_NOT_BUMPED:
        "the repository context (repo path and file list)",
      KM_LINT_SPURIOUS_VERSION_BUMP:
        "the repository context (repo path and file list)",
    });

    const { findings: findings } = await new KeyboardLintEngine().lintWithContext(
      vfs,
      KEYBOARD_ID,
      ctx,
    );
    // The touch finding still runs alongside.
    expect(findings.map((f) => f.code)).toContain("KM_WARN_TOUCH_ROW_COUNT");
    // §18.6 RUNS on this fixture now (spec 084 Batch 4 deleted the
    // origin guard that made it unreachable for any parseKmn-produced
    // IR): the inventory requires a, b, z, A, B, Z and the fixture .kmn
    // produces only a and b, so the four uncovered characters report.
    const uncovered = findings.filter(
      (f) => f.code === INVENTORY_UNCOVERED_CODE,
    );
    expect(uncovered).toHaveLength(4);
    expect(uncovered.map((f) => f.message).join("\n")).toContain('"z"');
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
      message: 'Platform "phone" layer "default" has 2 row(s); expected 4-5.',
    };
    const merged = mergeLintFindings(
      [docFinding],
      [engineDuplicate, engineOnly],
    );
    expect(merged).toHaveLength(2);
    // The doc copy wins, preserving its upstream reclassification.
    expect(merged[0]).toBe(docFinding);
    expect(merged[1]).toBe(engineOnly);
  });

  it("does not dedupe the same code with different messages", () => {
    const other: LintFinding = {
      ...docFinding,
      message: "A different problem.",
    };
    expect(mergeLintFindings([docFinding], [other])).toHaveLength(2);
  });
});

describe("applyInventoryOutcome (§18.6 Batch 4)", () => {
  // The fixture .kmn plus one opaque `if(...)` rule: the codec keeps the
  // rule as a raw fragment, which is the check's surviving skip.
  const KMN_WITH_RAW = [
    KMN.replace(
      "+ [K_B] > 'b'",
      "+ [K_B] > 'b'\nif(&VERSION > '1.0') + [K_C] > 'c'",
    ),
  ].join("\n");

  function rawVfs(): VirtualFS {
    return createVirtualFS([
      { path: `source/${KEYBOARD_ID}.kmn`, content: KMN_WITH_RAW, isBinary: false },
      {
        path: `source/${KEYBOARD_ID}.keyman-touch-layout`,
        content: TOUCH_LAYOUT,
        isBinary: false,
      },
    ]);
  }

  it("built + fragment-free: inventory joins the context and §18.6 is no longer missing", () => {
    const assembled = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    const inventory = fixtureInventory();
    const result = applyInventoryOutcome(assembled, {
      kind: "built",
      inventory,
    });
    expect(result.ctx.inventory).toBe(inventory);
    expect(result.contextMissing[INVENTORY_UNCOVERED_CODE]).toBeUndefined();
  });

  it("built + raw fragments: §18.6 stays missing, naming the raw fragments", () => {
    const assembled = assembleLintContext({
      vfs: rawVfs(),
      keyboardId: KEYBOARD_ID,
    });
    expect(assembled.ctx.keyboardIR?.raw.length).toBeGreaterThan(0);
    const result = applyInventoryOutcome(assembled, {
      kind: "built",
      inventory: fixtureInventory(),
    });
    expect(result.ctx.inventory).toBeDefined();
    expect(result.contextMissing[INVENTORY_UNCOVERED_CODE]).toContain(
      "raw fragment",
    );
  });

  it("a directly-passed inventory over a fragment-bearing IR is likewise named missing", () => {
    const { contextMissing } = assembleLintContext({
      vfs: rawVfs(),
      keyboardId: KEYBOARD_ID,
      inventory: fixtureInventory(),
    });
    expect(contextMissing[INVENTORY_UNCOVERED_CODE]).toContain("raw fragment");
  });

  it("skipped: the reason names the target with no CLDR/SLDR entry", () => {
    const assembled = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    const result = applyInventoryOutcome(assembled, {
      kind: "skipped",
      missingTag: "ewo",
    });
    expect(result.ctx.inventory).toBeUndefined();
    expect(result.contextMissing[INVENTORY_UNCOVERED_CODE]).toContain(
      "no CLDR/SLDR entry for ewo",
    );
  });

  it("skipped with no target: the reason says so", () => {
    const assembled = assembleLintContext({
      vfs: fixtureVfs(),
      keyboardId: KEYBOARD_ID,
    });
    const result = applyInventoryOutcome(assembled, {
      kind: "skipped",
      missingTag: null,
    });
    expect(result.contextMissing[INVENTORY_UNCOVERED_CODE]).toContain(
      "no language target is recorded",
    );
  });

  it("no parsed IR: the assembly is returned untouched (missing source dominates)", () => {
    const vfs = createVirtualFS([
      { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    ]);
    const assembled = assembleLintContext({ vfs, keyboardId: KEYBOARD_ID });
    const result = applyInventoryOutcome(assembled, {
      kind: "built",
      inventory: fixtureInventory(),
    });
    expect(result).toBe(assembled);
    expect(result.contextMissing[INVENTORY_UNCOVERED_CODE]).toContain(
      "parsed keyboard source",
    );
  });
});

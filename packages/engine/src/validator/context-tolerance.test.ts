import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import {
  computeContextTolerance,
  resolveKeyPart,
  resolveKeyPartCandidates,
} from "./context-tolerance.js";

const HEADER = [
  "store(&NAME) 'ContextTolerance'",
  "store(&VERSION) '14.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "store(&mnemoniclayout) '1'",
  "",
  "begin Unicode > use(main)",
  "",
].join("\n");

describe("computeContextTolerance (spec 062, US2)", () => {
  it("reports a diagnosed gap with concrete failing keystrokes and both outputs (Acceptance Scenario 1)", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(acute) U+00E2",
      "store(key.act) ']'",
      "",
      "any(base) + any(key.act) > index(acute,1)",
      "+ ']' > U+00B4",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "gap_fixture");

    const report = await computeContextTolerance(ir);

    const gapFinding = report.findings.find((f) => f.failingKeystrokes !== undefined);
    expect(gapFinding).toBeDefined();
    expect(gapFinding?.status).toBe("not-analysed");
    expect(gapFinding?.failingKeystrokes).toEqual([{ vkey: "K_RBRKT", modifiers: [] }]);
    expect(gapFinding?.precedingText).toBe("à"); // U+00E0, the precomposed candidate that diverged
    expect(gapFinding?.precomposedOutput).toBe("â");
    expect(gapFinding?.decomposedOutput).not.toBe(gapFinding?.precomposedOutput);
    expect(report.findings.length + report.notAnalysedCount).toBe(
      ir.groups.reduce((n, g) => n + g.rules.length, 0) + ir.raw.length,
    );
  }, 30_000);

  it("reports zero gaps for a keyboard whose rules already accept both forms (Acceptance Scenario 2)", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(acute) U+00E2",
      "store(key.act) ']'",
      "",
      "any(base) + any(key.act) > index(acute,1)",
      "'a' U+0300 + any(key.act) > index(acute,1)",
      "+ ']' > U+00B4",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "tolerant_fixture");

    const report = await computeContextTolerance(ir);

    const gapFinding = report.findings.find((f) => f.failingKeystrokes !== undefined);
    expect(gapFinding).toBeUndefined();
  }, 30_000);

  it("reports an opaque rule as not-analysed via notAnalysedCount, never inspected (Acceptance Scenario 3)", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "U+1F600 + 'y' > 'z'",
      "+ 'a' > 'a'",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "opaque_fixture");
    expect(ir.raw.length).toBe(1);

    const report = await computeContextTolerance(ir);

    expect(report.notAnalysedCount).toBe(1);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.status).toBe("tolerant");
  }, 30_000);

  it("reports a rule backed by an unresolved index() pairing as not-analysed, never treated as fixable", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(mystore) U+00E2",
      "store(key.act) ']'",
      "",
      "'x' + any(key.act) > index(mystore,1)",
      "any(mystore) + any(key.act) > 'q'",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "pairing_fixture");

    const report = await computeContextTolerance(ir);

    const pairingFinding = report.findings.find((f) =>
      f.notAnalysedReason?.includes("index() output pairing"),
    );
    expect(pairingFinding).toBeDefined();
    expect(pairingFinding?.status).toBe("not-analysed");
    expect(pairingFinding?.failingKeystrokes).toBeUndefined();
  }, 30_000);

  it("still runs the behavioural comparison for a keyboard declaring &LAYOUTFILE (#1754)", async () => {
    // Regression for #1754: computeContextTolerance's own compile VFS only
    // ever contains the one .kmn file, so a keyboard naming a sibling
    // touch-layout file (965 of 1,044 real corpus keyboards do) previously
    // failed the internal compile outright and every pending rule was
    // reported "keyboard failed to compile" rather than actually diagnosed.
    const kmn = [
      "store(&NAME) 'ContextTolerance'",
      "store(&VERSION) '14.0'",
      "store(&KEYBOARDVERSION) '1.0'",
      "store(&TARGETS) 'any'",
      "store(&mnemoniclayout) '1'",
      "store(&LAYOUTFILE) 'layoutfile_fixture.keyman-touch-layout'",
      "",
      "begin Unicode > use(main)",
      "",
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(acute) U+00E2",
      "store(key.act) ']'",
      "",
      "any(base) + any(key.act) > index(acute,1)",
      "+ ']' > U+00B4",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "layoutfile_fixture");

    const report = await computeContextTolerance(ir);

    // A gap actually diagnosed via simulate() carries failingKeystrokes; the
    // "keyboard failed to compile" fallback never does (see simulatePending
    // vs. computeContextTolerance's compile-failure branch) — so finding one
    // here proves the compile succeeded despite &LAYOUTFILE.
    const gapFinding = report.findings.find((f) => f.failingKeystrokes !== undefined);
    expect(gapFinding).toBeDefined();
    expect(gapFinding?.precomposedOutput).toBe("â");
  }, 30_000);

  it("SC-006 invariant: findings.length + notAnalysedCount always equals the total rule count", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(acute) U+00E2",
      "store(key.act) ']'",
      "",
      "U+1F600 + 'y' > 'z'",
      "any(base) + any(key.act) > index(acute,1)",
      "+ ']' > U+00B4",
      "+ 'a' > 'a'",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "sweep_fixture");
    const totalRuleCount = ir.groups.reduce((n, g) => n + g.rules.length, 0) + ir.raw.length;

    const report = await computeContextTolerance(ir);

    expect(report.findings.length + report.notAnalysedCount).toBe(totalRuleCount);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Touch-only T_ keys (#2363): the desktop simulator's buildKeyEvent throws
// `simulate: unknown virtual key "T_0300"` on anything that is not a physical
// key code, so resolveKeyPart must refuse a T_-keyed rule with a not-analysed
// reason instead of handing simulate() an unpressable key. The candidates
// variant must agree, or the diagnosis and the fix generator would disagree
// about what "this rule's key" means.
// ---------------------------------------------------------------------------

describe("resolveKeyPart — touch-only T_ keys (#2363)", () => {
  it("refuses a touch-only T_ key with a not-analysed reason, never a simulatable key", () => {
    const res = resolveKeyPart([{ kind: "vkey", name: "T_0300", modifiers: [] }], new Map());
    expect("reason" in res).toBe(true);
    if ("reason" in res) {
      expect(res.reason).toBe(
        "touch-only key T_0300 cannot be pressed by the desktop simulator; not analysed",
      );
    }
  });

  it("refuses a shifted touch-only key too (unpressable dominates unrepresentable modifiers)", () => {
    const res = resolveKeyPart([{ kind: "vkey", name: "T_030D", modifiers: ["SHIFT"] }], new Map());
    expect("reason" in res).toBe(true);
    if ("reason" in res) expect(res.reason).toMatch(/touch-only key T_030D/);
  });

  it("still resolves physical K_ keys and U_ character keys", () => {
    const k = resolveKeyPart([{ kind: "vkey", name: "K_A", modifiers: [] }], new Map());
    expect("key" in k).toBe(true);
    if ("key" in k) expect(k.key).toEqual({ vkey: "K_A", modifiers: [] });

    const u = resolveKeyPart([{ kind: "vkey", name: "U_0041", modifiers: [] }], new Map());
    expect("key" in u).toBe(true);
    if ("key" in u) expect(u.key).toEqual({ vkey: "U_0041", modifiers: [] });
  });

  it("resolveKeyPartCandidates forwards the touch-only refusal so the generator agrees with the diagnosis", () => {
    const res = resolveKeyPartCandidates([{ kind: "vkey", name: "T_0300", modifiers: [] }], new Map());
    expect("reason" in res).toBe(true);
    if ("reason" in res) expect(res.reason).toMatch(/touch-only key T_0300/);
  });
});

describe("computeContextTolerance — rule keyed to a touch-only T_ key (#2363)", () => {
  it("skips the T_-keyed rule with a not-analysed reason and analyses the rest of the keyboard normally", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(acute) U+00E2",
      "store(key.act) ']'",
      "store(diablock) 'è' 'é' 'ç' 'à' 'ù'",
      "",
      "any(base) + any(key.act) > index(acute,1)",
      "any(diablock) + [T_0300] > context",
      "+ ']' > U+00B4",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "touch_key_fixture");

    // Before the fix this threw `simulate: unknown virtual key "T_0300"`.
    const report = await computeContextTolerance(ir);

    const touchFinding = report.findings.find((f) => f.notAnalysedReason?.includes("T_0300"));
    expect(touchFinding).toBeDefined();
    expect(touchFinding?.status).toBe("not-analysed");
    expect(touchFinding?.failingKeystrokes).toBeUndefined();

    // The rest of the keyboard is analysed normally: the gap rule from the
    // first fixture is still diagnosed via the both-forms comparison.
    const gapFinding = report.findings.find((f) => f.failingKeystrokes !== undefined);
    expect(gapFinding).toBeDefined();
    expect(gapFinding?.failingKeystrokes).toEqual([{ vkey: "K_RBRKT", modifiers: [] }]);
    expect(gapFinding?.precomposedOutput).toBe("â");
  }, 30_000);
});

// ---------------------------------------------------------------------------
// The simulation compile forces &TARGETS 'any'. For a mnemonic keyboard that
// adds KeymanWeb-only kmcmplib errors (virtual keys are not valid in mnemonic
// layouts, 0x502058) which its own build may never hit. The analysis must
// still run off the .js kmcmplib produced, carry the diagnostics on the
// report, and hold back only the virtual-key rules those errors drop.
// ---------------------------------------------------------------------------

describe("computeContextTolerance — web-only compile errors from the forced targets", () => {
  const kmn = [
    HEADER.replace("store(&TARGETS) 'any'", "store(&TARGETS) 'desktop'"),
    "group(main) using keys",
    "",
    "store(base) U+00E0",
    "store(acute) U+00E2",
    "store(key.act) ']'",
    "",
    "any(base) + any(key.act) > index(acute,1)",
    "any(base) + [K_QUOTE] > U+00E1",
    "'x' + [K_BKSP] > nul",
    "+ ']' > U+00B4",
    "",
  ].join("\n");

  it("still analyses character-key rules and reports the compile diagnostics", async () => {
    const { ir } = parse(kmn, "web_only_errors");
    const report = await computeContextTolerance(ir);

    expect(report.compileDiagnostics?.some((d) => d.code === `KM_ERROR_KMCMP_${0x502058}` && d.severity === "error")).toBe(true);
    const gap = report.findings.find((f) => f.failingKeystrokes !== undefined);
    expect(gap?.failingKeystrokes).toEqual([{ vkey: "K_RBRKT", modifiers: [] }]);
    expect(report.findings.some((f) => /failed to compile/.test(f.notAnalysedReason ?? ""))).toBe(false);
  }, 30_000);

  it("holds back a virtual-key rule the errors may have dropped from the .js", async () => {
    const { ir } = parse(kmn, "web_only_errors");
    const report = await computeContextTolerance(ir);
    const vkeyRule = report.findings.find((f) => /virtual-key rule/.test(f.notAnalysedReason ?? ""));
    expect(vkeyRule?.status).toBe("not-analysed");
    expect(vkeyRule?.failingKeystrokes).toBeUndefined();
  }, 30_000);
});

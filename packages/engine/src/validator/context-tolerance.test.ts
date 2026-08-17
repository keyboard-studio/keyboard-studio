import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { computeContextTolerance } from "./context-tolerance.js";

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

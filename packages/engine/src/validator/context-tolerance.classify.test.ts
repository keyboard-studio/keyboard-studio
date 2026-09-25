import { describe, it, expect } from "vitest";
import type { RuleToleranceFinding } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { classifyToleranceFinding, computeContextTolerance, type ToleranceClassification } from "./context-tolerance.js";

const LOC = { file: "k.kmn", line: 1 };

function finding(extra: Partial<RuleToleranceFinding>): RuleToleranceFinding {
  return { ruleId: "r1", location: LOC, status: "tolerant", ...extra };
}

describe("classifyToleranceFinding (spec 078, research D5)", () => {
  it("passes tolerant and made-tolerant through", () => {
    expect(classifyToleranceFinding(finding({ status: "tolerant" }))).toBe("tolerant");
    expect(classifyToleranceFinding(finding({ status: "made-tolerant" }))).toBe("made-tolerant");
  });

  it("reads not-analysed with failing keystrokes and no reason as a gap", () => {
    const f = finding({
      status: "not-analysed",
      failingKeystrokes: [{ vkey: "K_RBRKT", modifiers: [] }],
      precomposedOutput: "â",
      decomposedOutput: "à´",
    });
    expect(classifyToleranceFinding(f)).toBe("gap");
  });

  it("reads not-analysed with a reason as not-analysed, even with keystrokes", () => {
    expect(classifyToleranceFinding(finding({ status: "not-analysed", notAnalysedReason: "opaque" }))).toBe(
      "not-analysed",
    );
    expect(
      classifyToleranceFinding(
        finding({
          status: "not-analysed",
          notAnalysedReason: "x",
          failingKeystrokes: [{ vkey: "K_A", modifiers: [] }],
        }),
      ),
    ).toBe("not-analysed");
  });

  it("reads bare not-analysed (no reason, no keystrokes) as not-analysed", () => {
    expect(classifyToleranceFinding(finding({ status: "not-analysed" }))).toBe("not-analysed");
  });

  it("partitions a real report exactly: the four classes plus notAnalysedCount equal the rule total (SC-005)", async () => {
    const kmn = [
      "store(&NAME) 'Classify'",
      "store(&VERSION) '14.0'",
      "store(&TARGETS) 'any'",
      "store(&mnemoniclayout) '1'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "store(base) U+00E0",
      "store(acute) U+00E2",
      "store(key.act) ']'",
      "any(base) + any(key.act) > index(acute,1)",
      "+ ']' > U+00B4",
      "+ 'q' > 'q'",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "classify_fixture");
    const report = await computeContextTolerance(ir);

    const counts: Record<ToleranceClassification, number> = {
      tolerant: 0,
      "made-tolerant": 0,
      gap: 0,
      "not-analysed": 0,
    };
    for (const f of report.findings) counts[classifyToleranceFinding(f)]++;

    const total = ir.groups.reduce((n, g) => n + g.rules.length, 0) + ir.raw.length;
    expect(counts.tolerant + counts["made-tolerant"] + counts.gap + counts["not-analysed"] + report.notAnalysedCount).toBe(
      total,
    );
    expect(counts.gap).toBeGreaterThanOrEqual(1);
  }, 30_000);
});

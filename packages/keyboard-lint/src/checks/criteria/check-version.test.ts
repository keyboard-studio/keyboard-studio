import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  checkVersionFormat,
  checkVersionLeadingZero,
  checkSpuriousVersionBump,
  checkVersionBumpRequired,
  checkVersionNotIncremented,
  checkVersionVPrefix,
} from "./check-version.js";
import type { ReviewContext } from "@keyboard-studio/contracts";

function irWithVersion(version: string): KeyboardIR {
  return makeTestIR({ header: { keyboardId: "demo", version } });
}

const codes = (fs: { code: string }[]): string[] => fs.map((f) => f.code);

describe("version validator (2.3 / 2.4 / 2.5)", () => {
  it("passes a plain dotted numeric version on all three rows", () => {
    const ir = irWithVersion("1.2.3");
    expect(checkVersionFormat(ir).findings).toEqual([]);
    expect(checkVersionLeadingZero(ir).findings).toEqual([]);
    expect(checkVersionVPrefix(ir).findings).toEqual([]);
  });

  it("v1.02 fails all three rows, each for its own reason", () => {
    const ir = irWithVersion("v1.02");
    expect(codes(checkVersionFormat(ir).findings)).toEqual(["KM_LINT_VERSION_FORMAT"]);
    expect(codes(checkVersionLeadingZero(ir).findings)).toEqual([
      "KM_LINT_VERSION_LEADING_ZERO",
    ]);
    expect(codes(checkVersionVPrefix(ir).findings)).toEqual([
      "KM_LINT_VERSION_V_PREFIX",
    ]);
  });

  it("1.02 fails only the leading-zero row", () => {
    const ir = irWithVersion("1.02");
    expect(checkVersionFormat(ir).findings).toEqual([]);
    expect(codes(checkVersionLeadingZero(ir).findings)).toEqual([
      "KM_LINT_VERSION_LEADING_ZERO",
    ]);
    expect(checkVersionVPrefix(ir).findings).toEqual([]);
  });

  it("1.0-beta fails format and v-prefix/labels, but not leading-zero", () => {
    const ir = irWithVersion("1.0-beta");
    expect(codes(checkVersionFormat(ir).findings)).toEqual(["KM_LINT_VERSION_FORMAT"]);
    expect(checkVersionLeadingZero(ir).findings).toEqual([]);
    expect(codes(checkVersionVPrefix(ir).findings)).toEqual([
      "KM_LINT_VERSION_V_PREFIX",
    ]);
  });

  it("a bare 0 component is not a leading zero; an empty version is silent", () => {
    expect(checkVersionLeadingZero(irWithVersion("0.9")).findings).toEqual([]);
    const empty = irWithVersion("");
    expect(checkVersionFormat(empty).findings).toEqual([]);
    expect(checkVersionLeadingZero(empty).findings).toEqual([]);
    expect(checkVersionVPrefix(empty).findings).toEqual([]);
  });
});

describe("2.6 version strictly greater than base (KM_LINT_VERSION_NOT_INCREMENTED)", () => {
  const SHA = "abc1234" + "0".repeat(33);
  const prReview = (
    overrides: Partial<ReviewContext> = {},
  ): ReviewContext => ({
    repoPath: "experimental/d/demo",
    treePaths: ["experimental/d/demo/source/demo.kmn"],
    isPr: true,
    baseKmnVersion: { baseSha: SHA, version: "1.0" },
    idConflictAtBase: { baseSha: SHA, existingTiers: ["experimental"] },
    ...overrides,
  });

  it("non-PR target is met-moot", () => {
    const r = checkVersionNotIncremented(irWithVersion("1.0"), undefined);
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/version history is the repo/);
  });

  it("PR version greater than base is met", () => {
    const r = checkVersionNotIncremented(irWithVersion("1.1"), prReview());
    expect(r.code).toBe("KM_LINT_VERSION_NOT_INCREMENTED");
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/"1.1" > "1.0"/);
  });

  it("equal version on an upgrade is a finding", () => {
    const r = checkVersionNotIncremented(irWithVersion("1.0"), prReview());
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.code).toBe("KM_LINT_VERSION_NOT_INCREMENTED");
    expect(r.findings[0]!.message).toMatch(/not incremented from "1.0"/);
    expect(r.findings[0]!.hint).toMatch(/1\.0\.1/);
  });

  it("equal version on a new keyboard is met-moot", () => {
    const r = checkVersionNotIncremented(
      irWithVersion("1.0"),
      prReview({
        idConflictAtBase: { baseSha: SHA, existingTiers: [] },
        baseKmnVersion: { baseSha: SHA },
      }),
    );
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/nothing to increment from/);
  });

  it("PR version less than base is a finding", () => {
    const r = checkVersionNotIncremented(
      irWithVersion("0.9"),
      prReview({ baseKmnVersion: { baseSha: SHA, version: "1.0" } }),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toMatch(/"0.9" is less than the base version "1.0"/);
  });

  it("base with no version is met-moot (nothing to increment from)", () => {
    const r = checkVersionNotIncremented(
      irWithVersion("1.0"),
      prReview({ baseKmnVersion: { baseSha: SHA } }),
    );
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/nothing to increment from/);
  });

  it("PR with no version declared is met-moot (judged elsewhere)", () => {
    const r = checkVersionNotIncremented(irWithVersion(""), prReview());
    expect(r.findings).toEqual([]);
  });

  it("missing base lookup never manufactures a verdict", () => {
    const r = checkVersionNotIncremented(
      irWithVersion("1.0"),
      prReview({ baseKmnVersion: undefined }),
    );
    expect(r.findings).toEqual([]);
  });
});

describe("2.1 / 2.2 version bump vs package files (NOT_BUMPED / SPURIOUS_VERSION_BUMP)", () => {
  const SHA = "abc1234" + "0".repeat(33);
  const KPS = ["..\build\demo.kmx", "welcome.htm", "LICENSE.md"];
  const pr = (paths: string[], over: Partial<ReviewContext> = {}): ReviewContext => ({
    repoPath: "experimental/d/demo",
    treePaths: paths.map((p) => `experimental/d/demo/${p}`),
    isPr: true,
    baseKmnVersion: { baseSha: SHA, version: "1.0" },
    idConflictAtBase: { baseSha: SHA, existingTiers: ["experimental"] },
    ...over,
  });
  const both = (v: string, review: ReviewContext | undefined) => [
    checkVersionBumpRequired(irWithVersion(v), review, KPS),
    checkSpuriousVersionBump(irWithVersion(v), review, KPS),
  ];

  it("new submission (folder absent at base) is met-moot for both, listing the files", () => {
    for (const r of both(
      "1.0",
      pr(["source/demo.kmn", "README.md"], {
        idConflictAtBase: { baseSha: SHA, existingTiers: [] },
        baseKmnVersion: { baseSha: SHA },
      }),
    )) {
      expect(r.findings).toEqual([]);
      expect(r.verified.join(" ")).toMatch(/New keyboard submission.*source\/demo\.kmn, README\.md/);
    }
  });

  it("package file changed without a bump fails 2.1; 2.2 defers to 2.1", () => {
    const [b, s] = both("1.0", pr(["source/welcome.htm"]));
    expect(codes(b!.findings)).toEqual(["KM_LINT_VERSION_NOT_BUMPED"]);
    expect(b!.findings[0]!.message).toMatch(/source\/welcome\.htm/);
    expect(s!.findings).toEqual([]);
    expect(s!.verified.join(" ")).toMatch(/judged by 2\.1/);
  });

  it("package file changed with a bump passes 2.1", () => {
    const [b] = both("1.1", pr(["source/demo.kmn"]));
    expect(b!.findings).toEqual([]);
    expect(b!.verified.join(" ")).toMatch(/"1\.0" → "1\.1"/);
  });

  it("only non-package files: no bump required; a bump anyway is allowed", () => {
    const [b, s] = both("1.0", pr(["README.md", "HISTORY.md"]));
    expect(b!.findings).toEqual([]);
    expect(s!.verified.join(" ")).toMatch(/no bump needed/);
    const [, s2] = both("1.1", pr(["README.md"]));
    expect(s2!.findings).toEqual([]);
    expect(s2!.verified.join(" ")).toMatch(/allowed, but not required/);
  });

  it("non-PR target is met-moot", () => {
    for (const r of both("1.0", undefined)) expect(r.findings).toEqual([]);
  });
});

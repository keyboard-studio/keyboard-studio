import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  checkVersionFormat,
  checkVersionLeadingZero,
  checkVersionVPrefix,
} from "./check-version.js";

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

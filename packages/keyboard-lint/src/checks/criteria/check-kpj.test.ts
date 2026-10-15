// Tests for the KPJ pair checks (spec 084, ruling B: structural).
// Facts are KpjFormFacts as the engine's parseKpjForm produces them;
// the assembly owns naming missing inputs, so absent facts must
// produce no findings here.

import { describe, expect, it } from "vitest";

import type { KpjFormFacts } from "@keyboard-studio/contracts";

import {
  checkKpjFormatAdapted,
  checkKpjVersionNotBumped,
} from "./check-kpj.js";

const MODERN: KpjFormFacts = {
  versionElement: "2.0",
  hasFilesList: false,
  form: "modern",
};
const LEGACY: KpjFormFacts = {
  versionElement: null,
  hasFilesList: true,
  form: "legacy",
};
const KPJ_PATH = "sil_fixture.kpj";

describe("checkKpjFormatAdapted (1.10b)", () => {
  it("passes a modern .kpj (format marker present)", () => {
    expect(checkKpjFormatAdapted(MODERN, KPJ_PATH)).toEqual([]);
  });

  it("fires on a legacy .kpj (no marker, Files-driven)", () => {
    const findings = checkKpjFormatAdapted(LEGACY, KPJ_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_KPJ_FORMAT_OUTDATED");
    expect(findings[0]?.location.file).toBe(KPJ_PATH);
    expect(findings[0]?.message).toContain("legacy project-file form");
  });

  it("stays silent without facts — the assembly names the missing .kpj", () => {
    expect(checkKpjFormatAdapted(undefined, KPJ_PATH)).toEqual([]);
  });
});

describe("checkKpjVersionNotBumped (2.7)", () => {
  it("passes when the marker state is carried forward unchanged (modern → modern)", () => {
    expect(checkKpjVersionNotBumped(MODERN, MODERN, KPJ_PATH)).toEqual([]);
  });

  it("passes a legacy base carried forward unchanged — 1.10b's case, not 2.7's", () => {
    expect(checkKpjVersionNotBumped(LEGACY, LEGACY, KPJ_PATH)).toEqual([]);
  });

  it("fires when the adaptation added the format marker the base did not have", () => {
    const findings = checkKpjVersionNotBumped(MODERN, LEGACY, KPJ_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_KPJ_VERSION_BUMPED");
    expect(findings[0]?.message).toContain("no <Options><Version> marker");
    expect(findings[0]?.message).toContain("<Options><Version>2.0</Version>");
  });

  it("fires when the adaptation dropped the base's format marker", () => {
    const findings = checkKpjVersionNotBumped(LEGACY, MODERN, KPJ_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_KPJ_VERSION_BUMPED");
  });

  it("fires when the marker value itself changed", () => {
    const changed: KpjFormFacts = { ...MODERN, versionElement: "2.0.1" };
    const findings = checkKpjVersionNotBumped(changed, MODERN, KPJ_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_KPJ_VERSION_BUMPED");
  });

  it("stays silent without a base — every foreign judgment resolves via contextMissing instead", () => {
    expect(checkKpjVersionNotBumped(MODERN, undefined, KPJ_PATH)).toEqual([]);
    expect(checkKpjVersionNotBumped(LEGACY, undefined, KPJ_PATH)).toEqual([]);
  });

  it("stays silent without judged facts", () => {
    expect(checkKpjVersionNotBumped(undefined, MODERN, KPJ_PATH)).toEqual([]);
  });
});

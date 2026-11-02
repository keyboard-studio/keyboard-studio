// LDML findings never gate anything (spec 108 FR-016): `outputBlockers` does not read them,
// the criteria resolver ignores them, the completeness gate (which blocks on error and fatal
// findings only) is unmoved by them, and no code can produce an error.

import { describe, it, expect } from "vitest";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import type { LintCode, LintFinding } from "@keyboard-studio/contracts";
import type { CompatibilityItem, LdmlClassification, LdmlCode } from "@keyboard-studio/engine";
import { outputBlockers } from "../lib/outputBlockers.ts";
import { EMPTY_CRITERIA_RECORD } from "../criteria/criteriaTypes.ts";
import { resolveCriteria } from "../criteria/resolveCriteria.ts";
import { runCompleteness } from "../dashboard/completeness.ts";
import { manifest, screenTrails } from "../steps/manifest.ts";
import { buildLdmlFindings } from "./ldmlFindings.ts";
import { LDML_CODE_COPY } from "./ldmlMessages.ts";

const ALL_CODES = Object.keys(LDML_CODE_COPY) as LdmlCode[];

function everyCodeFindings(): LintFinding[] {
  const items: CompatibilityItem[] = ALL_CODES.flatMap((code) =>
    (["warning", "hint"] as const).map((severity) => ({
      siteKey: `${code}|${severity}`,
      rowId: "1.1",
      status: "N" as const,
      code,
      severity,
      nodeKey: "group:main#0",
      line: 4,
      owner: null,
      construct: "construct",
      consequence: "consequence",
      params: {},
      side: "hardware" as const,
    })),
  );
  const classification: LdmlClassification = {
    profileId: "46",
    items,
    counts: { M: 0, A: 0, N: items.length, K: 0 },
    baseLayout: { id: "us", label: "US", source: "en-US" },
    ansiOnly: false,
    touchPresent: true,
  };
  return buildLdmlFindings(classification, undefined, "kb");
}

describe("LDML findings never gate (FR-016)", () => {
  const ldml = everyCodeFindings();

  it("produces findings for every code and none of them is an error or fatal", () => {
    expect(ldml).toHaveLength(ALL_CODES.length * 2);
    expect(ldml.some((f) => f.severity === "error" || f.severity === "fatal")).toBe(false);
  });

  it("leaves outputBlockers unblocked: it has no findings input at all", () => {
    const result = outputBlockers({
      touchStale: false,
      coverageBlocked: false,
      licenseUnparseable: false,
      attributionMissing: false,
      stageReady: true,
    });
    expect(result).toEqual({ blocked: false, testBuildBlocked: false, blockers: [] });
    expect(outputBlockers.length).toBe(1);
  });

  it("does not change the completeness report, whose C4 blocks on error and fatal findings", () => {
    const wc = { desktopLocked: true, touchLayoutJson: null } as const;
    const without = runCompleteness(manifest, wc, new Set(), [], screenTrails);
    const withLdml = runCompleteness(manifest, wc, new Set(), ldml, screenTrails);
    expect(withLdml).toEqual(without);
  });

  it("is ignored by criteria resolution: identical rows with and without LDML findings", () => {
    const base = {
      criteria: ALL_CRITERIA,
      mode: "authored" as const,
      record: EMPTY_CRITERIA_RECORD,
      facts: { fontBundled: true, deprecated: true, partnerPackage: true },
    };
    const without = resolveCriteria({ ...base, lintFindings: [] });
    const withLdml = resolveCriteria({ ...base, lintFindings: ldml });
    // The result carries functions, so compare its serialisable content.
    expect(JSON.stringify(withLdml)).toBe(JSON.stringify(without));
    expect(withLdml.rows.length).toBe(without.rows.length);
  });

  it("uses only KM_LINT_ codes, so the Output page infrastructure filter never hides them", () => {
    for (const f of ldml) {
      expect(f.code.startsWith("KM_LINT_LDML_")).toBe(true);
      expect(f.code.startsWith("KM_WARN")).toBe(false);
      expect((f.code satisfies LintCode) as string).toBeTruthy();
    }
  });
});

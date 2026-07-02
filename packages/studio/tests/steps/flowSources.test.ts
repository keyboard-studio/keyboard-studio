// tests/steps/flowSources.test.ts — D2 completeness checks (spec 024, Stage 1).
//
// Verifies the three-way consistency invariant between the manifest flowRefs
// and the flowSources catalogue (steps/flowSources.ts):
//
//   (a) Every flowRef on every manifest step resolves to a flowSources entry.
//   (b) Every status:"live" flowSources entry is referenced by >=1 manifest step.
//   (c) No manifest step references a status:"proposed" entry.
//
// These checks enforce ADR-0001: the Flow Map is derived solely from manifest
// step declarations; flowSources is the catalogue; the two must stay aligned.

import { describe, it, expect } from "vitest";
import { manifest } from "../../src/steps/manifest.ts";
import { flowSources } from "../../src/steps/flowSources.ts";

// ---------------------------------------------------------------------------
// (a) Every flowRef on every manifest step resolves to a flowSources entry.
// ---------------------------------------------------------------------------

describe("D2a — every manifest flowRef resolves to a flowSources entry", () => {
  for (const step of manifest) {
    if (step.flowRefs === undefined || step.flowRefs.length === 0) continue;
    for (const ref of step.flowRefs) {
      it(`step "${step.id}" flowRef "${ref}" resolves`, () => {
        expect(
          Object.prototype.hasOwnProperty.call(flowSources, ref),
          `flowSources["${ref}"] not found — add it to steps/flowSources.ts`,
        ).toBe(true);
      });
    }
  }

  it("no manifest step references an undefined flowSources key", () => {
    const allRefs: string[] = [];
    for (const step of manifest) {
      if (step.flowRefs) allRefs.push(...step.flowRefs);
    }
    const missing = allRefs.filter(
      (ref) => !Object.prototype.hasOwnProperty.call(flowSources, ref),
    );
    expect(
      missing,
      `Unresolved flowRefs: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (b) Every status:"live" flowSources entry is referenced by >=1 manifest step.
// ---------------------------------------------------------------------------

describe("D2b — every status:live flowSources entry is referenced by >=1 manifest step", () => {
  const allRefs = new Set<string>();
  for (const step of manifest) {
    if (step.flowRefs) {
      for (const ref of step.flowRefs) allRefs.add(ref);
    }
  }

  for (const [id, source] of Object.entries(flowSources)) {
    if (source.status !== "live") continue;
    it(`live flow "${id}" is referenced by at least one manifest step`, () => {
      expect(
        allRefs.has(id),
        `flowSources["${id}"] is status:"live" but no manifest step declares it in flowRefs — ` +
          `either add it to a step's flowRefs or change its status to "proposed"`,
      ).toBe(true);
    });
  }

  it("no live flowSources entry is unreferenced", () => {
    const unreferenced = Object.entries(flowSources)
      .filter(([id, s]) => s.status === "live" && !allRefs.has(id))
      .map(([id]) => id);
    expect(
      unreferenced,
      `Live but unreferenced flows: ${unreferenced.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (c) No manifest step references a status:"proposed" entry.
// ---------------------------------------------------------------------------

describe("D2c — no manifest step references a status:proposed flowSources entry", () => {
  for (const step of manifest) {
    if (step.flowRefs === undefined || step.flowRefs.length === 0) continue;
    for (const ref of step.flowRefs) {
      const source = flowSources[ref];
      if (source === undefined) continue; // already caught by D2a
      it(`step "${step.id}" does not reference proposed flow "${ref}"`, () => {
        expect(
          source.status,
          `step "${step.id}" flowRef "${ref}" is status:"proposed" — proposed flows must not be referenced by manifest steps`,
        ).not.toBe("proposed");
      });
    }
  }

  it("no manifest step references any proposed flow", () => {
    const violations: string[] = [];
    for (const step of manifest) {
      if (!step.flowRefs) continue;
      for (const ref of step.flowRefs) {
        const source = flowSources[ref];
        if (source?.status === "proposed") {
          violations.push(`${step.id} -> ${ref}`);
        }
      }
    }
    expect(
      violations,
      `Steps referencing proposed flows: ${violations.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Sanity: phase_a_identity must be proposed and unreferenced.
// ---------------------------------------------------------------------------

describe("spec-022 demotion — phase_a_identity is proposed and unreferenced", () => {
  it("phase_a_identity exists in flowSources with status:'proposed'", () => {
    const entry = flowSources["phase_a_identity"];
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("proposed");
  });

  it("no manifest step references phase_a_identity", () => {
    const refs: string[] = [];
    for (const step of manifest) {
      if (step.flowRefs?.includes("phase_a_identity")) {
        refs.push(step.id);
      }
    }
    expect(
      refs,
      `These steps reference the demoted phase_a_identity: ${refs.join(", ")}`,
    ).toHaveLength(0);
  });
});

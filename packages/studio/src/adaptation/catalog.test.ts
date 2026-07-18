// Tests for loadAdaptationCatalog (spec 038; contract question-catalog).
//
// Covers the coerce() boundary: a well-formed record parses, a malformed record
// (missing family / non-mapping prefill) is skipped rather than thrown, a YAML
// parse error is skipped, and records come back sorted by id.

import { describe, it, expect, vi, afterEach } from "vitest";
import { loadAdaptationCatalog } from "./catalog.ts";

afterEach(() => vi.restoreAllMocks());

const WELL_FORMED = `
id: q_zz1_example
family: script-alignment
elicits: "An example question."
firingCondition: "always"
prefill:
  facets: [script]
  sessionFacet: lineage.siblings
provenanceLabel: "example provenance"
consumers:
  - "axis:A2"
noEvidenceDegradation: ask-plainly
scope: session
renders: true
status: candidate
`;

describe("loadAdaptationCatalog", () => {
  it("parses a well-formed record", () => {
    const records = loadAdaptationCatalog({ "a.yaml": WELL_FORMED });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "q_zz1_example",
      family: "script-alignment",
      firingCondition: "always",
      prefill: { facets: ["script"], sessionFacet: "lineage.siblings" },
      consumers: ["axis:A2"],
      noEvidenceDegradation: "ask-plainly",
      scope: "session",
      renders: true,
      status: "candidate",
    });
  });

  it("skips a malformed record — missing family", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const missingFamily = `
id: q_bad1
firingCondition: "always"
prefill:
  facets: [script]
consumers: []
`;
    const records = loadAdaptationCatalog({ "bad.yaml": missingFamily });
    expect(records).toHaveLength(0);
  });

  it("skips a malformed record — prefill not a mapping", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const badPrefill = `
id: q_bad2
family: script-alignment
firingCondition: "always"
prefill: "not a mapping"
consumers: []
`;
    const records = loadAdaptationCatalog({ "bad2.yaml": badPrefill });
    expect(records).toHaveLength(0);
  });

  it("skips a record with a YAML parse error", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const brokenYaml = "id: q_bad3\n  family: [unterminated";
    const records = loadAdaptationCatalog({ "broken.yaml": brokenYaml });
    expect(records).toHaveLength(0);
  });

  it("returns records sorted by id", () => {
    const b = WELL_FORMED.replace("q_zz1_example", "q_zz2_bbb");
    const a = WELL_FORMED.replace("q_zz1_example", "q_zz2_aaa");
    const records = loadAdaptationCatalog({ "b.yaml": b, "a.yaml": a });
    expect(records.map((r) => r.id)).toEqual(["q_zz2_aaa", "q_zz2_bbb"]);
  });
});

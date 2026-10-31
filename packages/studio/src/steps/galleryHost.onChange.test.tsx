// makeGalleryOnChange — the onChange GalleryHost hands a renderer, as a function
// (spec 107 FR-040), equal to the host's record + apply path.

import { describe, it, expect } from "vitest";
import { decideGalleryValue, makeGalleryOnChange, type GalleryHostDeps } from "./galleryHost.tsx";
import type { Decision, DecisionSet } from "../decisions/decisionTypes.ts";
import type { GalleryModule, WorkingCopyPatch } from "../survey/types.ts";
import type { IRPath } from "@keyboard-studio/contracts";

interface ToyValue {
  picked: string;
}

function makeHarness(): {
  deps: GalleryHostDeps;
  records: Decision[];
  sinkCalls: Array<{ patch: WorkingCopyPatch; writes: readonly IRPath[] }>;
} {
  const records: Decision[] = [];
  const sinkCalls: Array<{ patch: WorkingCopyPatch; writes: readonly IRPath[] }> = [];
  let current: DecisionSet = {};
  const deps: GalleryHostDeps = {
    recordDecision: (record) => {
      records.push(record);
      current = { ...current, [record.id]: record };
    },
    getDecisions: () => current,
    getWorkingIR: () => null,
    getHistoryEntryState: () => null,
    applyWorkingCopyPatch: (patch, writes) => {
      sinkCalls.push({ patch, writes });
    },
  };
  return { deps, records, sinkCalls };
}

const toyModule = (): GalleryModule<ToyValue> => ({
  definition: { id: "toyGallery", type: "notice" },
  provides: ["windows-layout"],
  requires: ["language-code"],
  inputs: [],
  writes: [],
  fixtures: { valid: [{ value: undefined }], invalid: [] },
  renderer: () => null,
});

describe("makeGalleryOnChange", () => {
  it("records and applies exactly what decideGalleryValue does for the host's default provenance", () => {
    const viaFactory = makeHarness();
    const direct = makeHarness();
    const mod = toyModule();
    makeGalleryOnChange({ module: mod, stepId: "layout", deps: viaFactory.deps })({ picked: "kbdfr" });
    decideGalleryValue(mod, { picked: "kbdfr" }, { provenance: "asked" }, "layout", direct.deps);
    expect(viaFactory.records).toEqual(direct.records);
    expect(viaFactory.records[0]?.provenance).toBe("asked");
    expect(viaFactory.sinkCalls).toEqual(direct.sinkCalls);
  });

  it("carries an explicit provenance and source", () => {
    const h = makeHarness();
    makeGalleryOnChange({
      module: toyModule(),
      stepId: "layout",
      deps: h.deps,
      provenance: "derived",
      source: "kbdfr",
    })({ picked: "x" });
    expect(h.records[0]).toMatchObject({ provenance: "derived", source: "kbdfr", step: "layout" });
  });
});

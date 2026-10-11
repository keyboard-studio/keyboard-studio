// galleryHost.test — spec 090 T005: the gallery host's record + apply path.
//
// The host is the first runtime reader of a gallery module's renderer and
// its onChange is the single write path for a gallery decision: record the
// decision (with the requires inputs snapshot), then run the module's
// apply through the same channel authorization (089 contract A3) and patch
// sink the question runner uses. These tests drive the host's pure core
// (decideGalleryValue / runGalleryApply) over fake deps, plus one render
// smoke test pinning the DecisionRendererProps the renderer receives.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { IRPath } from "@keyboard-studio/contracts";
import { irPath } from "@keyboard-studio/contracts";
import {
  GalleryHost,
  decideGalleryValue,
  runGalleryApply,
  type GalleryHostDeps,
} from "./galleryHost.tsx";
import { ApplyChannelError } from "./reducer.ts";
import type { Decision, DecisionSet } from "../decisions/decisionTypes.ts";
import type { GalleryModule, WorkingCopyPatch } from "../survey/types.ts";

interface ToyValue {
  picked: string;
}

interface Harness {
  deps: GalleryHostDeps;
  records: Decision[];
  decisions: () => DecisionSet;
  sinkCalls: Array<{ patch: WorkingCopyPatch; writes: readonly IRPath[] }>;
}

function makeHarness(initial: DecisionSet = {}): Harness {
  const records: Decision[] = [];
  const sinkCalls: Harness["sinkCalls"] = [];
  let current: DecisionSet = { ...initial };
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
  return { deps, records, decisions: () => current, sinkCalls };
}

function toyModule(overrides: Partial<GalleryModule<ToyValue>> = {}): GalleryModule<ToyValue> {
  return {
    definition: { id: "toyGallery", type: "notice" },
    provides: ["windows-layout"],
    requires: ["language-code"],
    inputs: [],
    writes: [],
    fixtures: { valid: [{ value: undefined }], invalid: [] },
    renderer: () => null,
    ...overrides,
  };
}

describe("recordGalleryDecision via decideGalleryValue", () => {
  it("records one decision with provenance, step, and a requires inputs snapshot", () => {
    const h = makeHarness({
      "language-code": { id: "language-code", value: "fra", provenance: "asked" },
    });
    const record = decideGalleryValue(
      toyModule(),
      { picked: "kbdfr" },
      { provenance: "asked" },
      "layout",
      h.deps,
    );
    expect(record).toEqual({
      id: "windows-layout",
      value: { picked: "kbdfr" },
      provenance: "asked",
      inputs: { "language-code": "fra" },
      step: "layout",
    });
    expect(h.records).toEqual([record]);
  });

  it("omits the inputs snapshot when no required decision is recorded yet", () => {
    const h = makeHarness();
    const record = decideGalleryValue(
      toyModule(),
      { picked: "kbdfr" },
      { provenance: "asked" },
      "layout",
      h.deps,
    );
    expect(record).not.toHaveProperty("inputs");
  });

  it("carries the source through when one is named", () => {
    const h = makeHarness();
    const record = decideGalleryValue(
      toyModule(),
      { picked: "kbdfr" },
      { provenance: "extracted", source: "sil_test" },
      "layout",
      h.deps,
    );
    expect(record.provenance).toBe("extracted");
    expect(record.source).toBe("sil_test");
  });
});

describe("runGalleryApply", () => {
  it("runs the apply AFTER recording, so ctx.decisions contains the new decision (A6)", () => {
    const seen: Array<DecisionSet> = [];
    const mod = toyModule({
      writes: [irPath("header", "name")],
      apply: (_value, ctx) => {
        seen.push(ctx.decisions);
        return { ir: { header: { name: "X" } } as WorkingCopyPatch["ir"] };
      },
    });
    const h = makeHarness();
    decideGalleryValue(mod, { picked: "kbdfr" }, { provenance: "asked" }, "layout", h.deps);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.["windows-layout"]?.value).toEqual({ picked: "kbdfr" });
    expect(h.sinkCalls).toHaveLength(1);
    expect(h.sinkCalls[0]?.writes).toEqual([irPath("header", "name")]);
  });

  it("applies nothing for a module without apply, and nothing for an empty patch", () => {
    const h = makeHarness();
    runGalleryApply(toyModule(), { picked: "x" }, h.deps);
    runGalleryApply(toyModule({ apply: () => ({}) }), { picked: "x" }, h.deps);
    expect(h.sinkCalls).toHaveLength(0);
  });

  it("rejects an ir patch from a module with no declared writes (A3)", () => {
    const mod = toyModule({
      apply: () => ({ ir: { header: { name: "X" } } as WorkingCopyPatch["ir"] }),
    });
    const h = makeHarness();
    expect(() => runGalleryApply(mod, { picked: "x" }, h.deps)).toThrow(ApplyChannelError);
    expect(h.sinkCalls).toHaveLength(0);
  });

  it("rejects an overlay channel the module is not authorized for (A3)", () => {
    const mod = toyModule({
      // identity is authorized only for the project-keyboard-id provider.
      apply: () => ({ identity: {} as WorkingCopyPatch["identity"] }),
    });
    const h = makeHarness();
    expect(() => runGalleryApply(mod, { picked: "x" }, h.deps)).toThrow(ApplyChannelError);
    expect(h.sinkCalls).toHaveLength(0);
  });
});

describe("GalleryHost rendering", () => {
  it("renders the module's renderer with the recorded value, provenance, and source", () => {
    const mod = toyModule({
      renderer: (props) => (
        <div data-kind="toy">
          {JSON.stringify(props.value)}|{props.provenance}|{props.source ?? ""}|{props.decisionId}
        </div>
      ),
    });
    const h = makeHarness();
    const record: Decision = {
      id: "windows-layout",
      value: { picked: "kbdfr" },
      provenance: "extracted",
      source: "sil_test",
      step: "layout",
    };
    const html = renderToStaticMarkup(
      <GalleryHost module={mod} record={record} stepId="layout" deps={h.deps} />,
    );
    expect(html).toContain("{&quot;picked&quot;:&quot;kbdfr&quot;}|extracted|sil_test|windows-layout");
  });

  it("renders value undefined and provenance asked when nothing is recorded", () => {
    const mod = toyModule({
      renderer: (props) => <div>{String(props.value)}|{props.provenance}</div>,
    });
    const h = makeHarness();
    const html = renderToStaticMarkup(
      <GalleryHost module={mod} record={undefined} stepId="layout" deps={h.deps} />,
    );
    expect(html).toContain("undefined|asked");
  });
});

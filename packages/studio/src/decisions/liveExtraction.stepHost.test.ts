// Store-level tests for the live extraction pass (spec 092 T030): the
// real decision store + real working-copy store + real registry, driven
// exactly as production drives them — decisions recorded, the working
// copy instantiated from a base bundle, then the pass invoked through
// `runLiveExtractionFromStores` (the call StudioShell's doCommit makes
// at its post-setup point).
//
// Scope notes (recorded, not silent):
// - Rendering through the identity step is not asserted here: on this
//   base the identity flow's loader throws on FR-005's cross-flow
//   requires (plan.md G-8, lead ruling pending); the live rendering
//   assertions live in e2e/live-extraction-acceptance.spec.ts (CI).
// - Scenario (3) of the task — a validate-rejecting extract asked
//   normally — has no real-module pair to exercise on this base: no
//   landed module declares both `extract` and `validate`. The rule
//   itself is pinned at pass level in liveExtraction.test.ts.

import { describe, it, expect, beforeEach } from "vitest";
import { createVirtualFS, type BaseKeyboard, type KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { runLiveExtractionFromStores } from "./liveExtraction.ts";

const COPYRIGHT = "(c) 2009-2019 SIL International";

function catalogEntry(): BaseKeyboard {
  return {
    id: "basic_kbdfr",
    path: "release/basic/basic_kbdfr",
    script: "Latn",
    targets: ["windows"],
    displayName: "French Basic",
    version: "1.0",
    languages: ["fr"],
  };
}

function bundleIR(copyright: string | undefined): KeyboardIR {
  const ir = makeTestIR([]);
  return {
    ...ir,
    header: { ...ir.header, keyboardId: "basic_kbdfr", name: "French Basic", copyright },
  };
}

/**
 * Drive setup the way production does: identity answers recorded first,
 * then the setup decision's inputs (base + track), instantiation through
 * the working-copy store, and finally the extraction pass.
 */
function driveSetup(opts: { copyright?: string; track: "adapt" | "copy" }): void {
  const decisions = useDecisionStore.getState();
  decisions.record({ id: "author-name", value: "Test Author", provenance: "asked" });
  useWorkingCopyStore
    .getState()
    .instantiateFromBase(catalogEntry(), {
      vfs: createVirtualFS([]),
      ir: bundleIR(opts.copyright),
    });
  decisions.record({
    id: "base-keyboard",
    value: { id: "basic_kbdfr" },
    provenance: "asked",
  });
  decisions.record({ id: "authoring-track", value: opts.track, provenance: "asked" });
  runLiveExtractionFromStores();
}

beforeEach(() => {
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
});

describe("live extraction at setup (real stores, real registry)", () => {
  it("(1) unanswered + extractable → seeded record { extracted, source: <keyboard id> } with inputs snapshot", () => {
    driveSetup({ copyright: COPYRIGHT, track: "adapt" });
    const record = useDecisionStore.getState().decisions["copyright-holder"];
    expect(record?.value).toBe(COPYRIGHT);
    expect(record?.provenance).toBe("extracted");
    expect(record?.source).toBe("basic_kbdfr");
    expect(record?.inputs).toEqual({
      "author-name": "Test Author",
      "authoring-track": "adapt",
    });
  });

  it("(2) already answered → the answer is kept and the extracted value lands in offered", () => {
    // The author answered in a prior session (restored record), then a
    // fresh setup pass runs against basic_kbdfr.
    useDecisionStore.getState().record({
      id: "copyright-holder",
      value: "My Own Holder",
      provenance: "asked",
    });
    driveSetup({ copyright: COPYRIGHT, track: "adapt" });
    const record = useDecisionStore.getState().decisions["copyright-holder"];
    expect(record?.value).toBe("My Own Holder");
    expect(record?.provenance).toBe("asked");
    expect(record?.offered).toBe(COPYRIGHT);
  });

  it("(2b) copy track → no seed at all: the D1 default-to-author stands, the copied notice is not offered", () => {
    driveSetup({ copyright: COPYRIGHT, track: "copy" });
    expect(useDecisionStore.getState().decisions["copyright-holder"]).toBeUndefined();
  });

  it("(4) starting point missing the value → no record, no silent default", () => {
    driveSetup({ copyright: undefined, track: "adapt" });
    const record = useDecisionStore.getState().decisions["copyright-holder"];
    expect(record).toBeUndefined();
  });

  // #1901: the author name is now recorded at the attribution step, AFTER
  // setup — driveSetup above keeps the legacy order (a restored pre-#1901
  // draft's asked record). The seed must not depend on that order: the
  // pass gates on seedWhen + reachability, not on `requires` satisfaction.
  it("(5) post-#1901 order (no author-name at setup) → the holder still seeds on the update track", () => {
    const decisions = useDecisionStore.getState();
    useWorkingCopyStore.getState().instantiateFromBase(catalogEntry(), {
      vfs: createVirtualFS([]),
      ir: bundleIR(COPYRIGHT),
    });
    decisions.record({
      id: "base-keyboard",
      value: { id: "basic_kbdfr" },
      provenance: "asked",
    });
    decisions.record({ id: "authoring-track", value: "adapt", provenance: "asked" });
    runLiveExtractionFromStores();
    const record = useDecisionStore.getState().decisions["copyright-holder"];
    expect(record?.value).toBe(COPYRIGHT);
    expect(record?.provenance).toBe("extracted");
    // The inputs snapshot carries only the facts recorded at pass time.
    expect(record?.inputs).toEqual({ "authoring-track": "adapt" });
  });

  // Design correction (owner ruling, 2026-10-08 — specs/092-live-extraction/
  // followups.md; the T028 convenience-gate failure): the live pass never
  // seeds or offers the language code. The base catalog carries "fr", but
  // the code's only live source is the author's target-language choice
  // (identity Q1–Q3, via IdentityLite's lookup-default evaluation). An
  // unanswered slot stays unanswered; an answered one is untouched, with
  // no `offered` from the base either.
  it("(7) language-code unanswered → no record, though the base catalog carries a code (adapt)", () => {
    driveSetup({ copyright: COPYRIGHT, track: "adapt" });
    expect(useDecisionStore.getState().decisions["language-code"]).toBeUndefined();
    // The pass itself was not disabled wholesale: the holder still seeds.
    expect(useDecisionStore.getState().decisions["copyright-holder"]?.value).toBe(COPYRIGHT);
  });

  it("(7b) language-code unanswered → no record (copy)", () => {
    driveSetup({ copyright: COPYRIGHT, track: "copy" });
    expect(useDecisionStore.getState().decisions["language-code"]).toBeUndefined();
  });

  it("(8) language-code answered by the author → kept byte-unchanged, no offered from the base", () => {
    useDecisionStore.getState().record({
      id: "language-code",
      value: "hau",
      provenance: "asked",
    });
    driveSetup({ copyright: COPYRIGHT, track: "adapt" });
    const record = useDecisionStore.getState().decisions["language-code"];
    expect(record?.value).toBe("hau");
    expect(record?.provenance).toBe("asked");
    expect(record?.offered).toBeUndefined();
  });

  it("(6) post-#1901 order, copy track → no seed (the copied notice is not proposed)", () => {
    const decisions = useDecisionStore.getState();
    useWorkingCopyStore.getState().instantiateFromBase(catalogEntry(), {
      vfs: createVirtualFS([]),
      ir: bundleIR(COPYRIGHT),
    });
    decisions.record({
      id: "base-keyboard",
      value: { id: "basic_kbdfr" },
      provenance: "asked",
    });
    decisions.record({ id: "authoring-track", value: "copy", provenance: "asked" });
    runLiveExtractionFromStores();
    expect(useDecisionStore.getState().decisions["copyright-holder"]).toBeUndefined();
  });
});

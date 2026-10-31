// The touch seed-source and touch drivers (spec 107 T068): the default pick over
// a copied keyboard with and without a shipped touch layout, the decision it
// records, the draft clearing on a changed pick, and the touch step's
// completion with no key edits.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { getDecisionSnapshot, selectTouchSeedSource, useDecisionStore } from "../../../stores/decisionStore.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { bindManifest, useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { manifest } from "../../../steps/manifest.ts";
import type { Case } from "../caseTypes.ts";
import { createRunReport } from "../runReport.ts";
import { touchSeedDrivers } from "./touchSeed.ts";

const PHONE_JSON = JSON.stringify({
  phone: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }, { id: "K_W", text: "w" }] }] }],
  },
});

function seedStart(touchLayoutJson?: string): void {
  const files = [{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }];
  if (touchLayoutJson !== undefined) {
    files.push({ path: "source/basic_kbdus.keyman-touch-layout", content: touchLayoutJson, isBinary: false });
  }
  useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
    vfs: createVirtualFS(files),
    ir: makeTestIR([]),
  });
}

function ctx() {
  const report = createRunReport("store-default");
  return { report, drive: { case: {} as Case, startIr: makeTestIR([]), report } };
}

beforeEach(() => {
  bindManifest(manifest);
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionStore.getState().reset();
});

describe("touch_seed_source driver", () => {
  it("defaults to import-adapt when the copied keyboard ships a usable touch layout", async () => {
    seedStart(PHONE_JSON);
    const { report, drive } = ctx();
    expect(await touchSeedDrivers["touch_seed_source"]!(drive)).toBeUndefined();
    expect(selectTouchSeedSource(getDecisionSnapshot())).toBe("import-adapt");
    expect(report.report.steps[0]).toMatchObject({
      decisionId: "touch-seed-source",
      rule: "default",
      value: "import-adapt",
      proposalSource: "defaultTouchSeedSource",
    });
  });

  it("defaults to reseed-from-desktop when there is no touch layout, and when it is malformed", async () => {
    for (const json of [undefined, "{not valid json"]) {
      useWorkingCopyStore.getState().reset();
      useDecisionStore.getState().reset();
      seedStart(json);
      await touchSeedDrivers["touch_seed_source"]!(ctx().drive);
      expect(selectTouchSeedSource(getDecisionSnapshot())).toBe("reseed-from-desktop");
    }
  });

  it("keeps the recorded choice on re-entry and leaves the touch draft alone", async () => {
    seedStart(PHONE_JSON);
    useDecisionStore.getState().record({
      id: "touch-seed-source",
      value: "reseed-from-desktop",
      provenance: "asked",
      step: "touch_seed_source",
    });
    const draft = { charTouchEntries: [], suggestionResolvedChars: ["a"] };
    useWorkingCopyStore.getState().setTouchDraft(draft);
    await touchSeedDrivers["touch_seed_source"]!(ctx().drive);
    expect(selectTouchSeedSource(getDecisionSnapshot())).toBe("reseed-from-desktop");
    expect(useWorkingCopyStore.getState().touchDraft).toEqual(draft);
  });
});

describe("touch driver", () => {
  it("records touch-layout and builds the reseed layout with no key edits", async () => {
    seedStart();
    await touchSeedDrivers["touch_seed_source"]!(ctx().drive);
    const result = (await touchSeedDrivers["touch"]!(ctx().drive)) as { assignments: unknown[]; seedSource: string };
    expect(result.assignments).toEqual([]);
    expect(result.seedSource).toBe("reseed-from-desktop");
    expect(getDecisionSnapshot()["touch-layout"]).toBeDefined();
    expect(useWorkingCopyStore.getState().touchLayoutJson).not.toBeNull();
  });

  it("emits no layout for import-adapt with nothing changed (the shipped file is used verbatim)", async () => {
    seedStart(PHONE_JSON);
    await touchSeedDrivers["touch_seed_source"]!(ctx().drive);
    await touchSeedDrivers["touch"]!(ctx().drive);
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });
});

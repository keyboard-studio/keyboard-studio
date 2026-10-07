// SC-004 gate G4: the installable .kmp the download path builds, from the real
// adapt flow (see test/sc004Harness.ts). Runs under the node environment: the .kmp
// packager (kmc-package -> JSZip) rejects the Uint8Arrays the jsdom realm hands
// it, an environment artifact that does not exist in a browser or in Node.
// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { buildKmpForDownload } from "../lib/buildOutputBundle.ts";
import { KEYBOARDS, CORPUS, corpusPresent, runAdaptFlow, sc004GatesEnabled, announceSc004Skip } from "../test/sc004Harness.ts";

announceSc004Skip("SC-004 G4 (.kmp)", (name) => it.skip(name, () => {}));

describe.skipIf(!sc004GatesEnabled)("SC-004 G4: adapt flow builds an installable .kmp", () => {
  it("the pinned keyboards corpus is present", () => {
    expect(corpusPresent, `corpus at ${CORPUS}`).toBe(true);
  });

  beforeEach(() => {
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();
  });

  it.each(KEYBOARDS.map((k) => [k.id, k] as const))(
    "%s: buildKmpForDownload succeeds",
    async (_id, kb) => {
      runAdaptFlow(kb);
      let failure: string | null = null;
      try {
        const kmp = await buildKmpForDownload();
        if (kmp === null || kmp.bytes.byteLength === 0) failure = "empty package";
      } catch (e) {
        const diags = (e as { diagnostics?: unknown }).diagnostics;
        failure = `${e instanceof Error ? e.message : String(e)} ${JSON.stringify(diags ?? [])}`;
      }
      expect(failure, `${kb.id}: G4 kmp`).toBeNull();
    },
    120_000,
  );
});

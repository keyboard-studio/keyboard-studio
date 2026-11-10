// Trial step driver (spec 113): builds one numbered test build through the
// real pipeline and records it, then returns the build count at completion.
// Runs under the default jsdom environment: the .kmp packager used to reject
// jsdom-realm Uint8Arrays (kmc-package -> JSZip), so this file used to pin
// `@vitest-environment node`; the engine's kmp adapter now re-realms the bytes
// through `Buffer.from` (see packages/engine/src/output/kmp.ts `encode`), and
// the corpus walk below is the jsdom proof — this file stays jsdom so the
// driver test guards the fix too.

import { beforeEach, describe, expect, it } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { manifest } from "../../../steps/manifest.ts";
import { useDecisionStore } from "../../../stores/decisionStore.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { useTestingStore } from "../../../stores/testingStore.ts";
import { bindManifest, useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import {
  KEYBOARDS,
  announceSc004Skip,
  runAdaptFlow,
  sc004GatesEnabled,
} from "../../sc004Harness.ts";
import type { Case } from "../caseTypes.ts";
import { createRunReport } from "../runReport.ts";
import { trialDrivers } from "./trial.ts";

announceSc004Skip("trial driver", (name) => it.skip(name, () => {}));

function ctx() {
  const report = createRunReport("trial-driver");
  return { case: {} as Case, startIr: makeTestIR([]), report };
}

beforeEach(() => {
  bindManifest(manifest);
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionStore.getState().reset();
  useTestingStore.getState().reset();
});

describe.skipIf(!sc004GatesEnabled)("trial driver", () => {
  it(
    "builds test build 1 through the real pipeline and records it",
    async () => {
      runAdaptFlow(KEYBOARDS[0]!);
      const result = await trialDrivers["trial"]!(ctx());
      expect(result).toEqual({ buildsAtCompletion: 1 });
      const { builds, nextBuildNumber } = useTestingStore.getState();
      expect(builds).toHaveLength(1);
      expect(builds[0]!.number).toBe(1);
      expect(typeof builds[0]!.version).toBe("string");
      expect(builds[0]!.version.length).toBeGreaterThan(0);
      expect(builds[0]!.fingerprint.length).toBeGreaterThan(0);
      expect(nextBuildNumber).toBe(2);
    },
    120_000,
  );

  it("with nothing instantiated: throws instead of recording a phantom build", async () => {
    await expect(trialDrivers["trial"]!(ctx())).rejects.toThrow(/nothing instantiated/);
    expect(useTestingStore.getState().builds).toHaveLength(0);
  });
});

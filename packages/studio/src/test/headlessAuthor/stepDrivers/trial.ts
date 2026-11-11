// Trial step driver (spec 113): mirrors the Trial step's "Make test build"
// press, then its Continue path.
//
// The headless author is the author who tries the keyboard out: it builds
// one numbered test build through the same DOM-free pieces the panel's
// handler calls (`buildTestBuildKmp` + fingerprint + `recordBuild`), then
// returns the payload the step hands to `onComplete` — the build count at
// completion, which the publish hand-over reads. The download itself is
// skipped (no browser to hand the .kmp to); only a build that was handed
// to the browser uses up a number (FR-011), and the headless walk has no
// browser — so the number is consumed by the recording, matching what the
// UI does after `triggerDownload`.
//
// Reformat consent (spec 111 FR-009): the panel's guard runs the build
// unconsented first and only asks the author when the projection throws
// ReformatConsentRequiredError. The driver is the author agreeing — it
// retries consented, the same outcome the dialog's Agree button produces.
// On the copy track the error never fires (freshly derived working copy).

import { resolveTestBuildVersion } from "@keyboard-studio/engine";
import { buildTestBuildKmp } from "../../../lib/buildOutputBundle.ts";
import { ReformatConsentRequiredError } from "../../../lib/reformatConsentError.ts";
import { computeWorkingCopyFingerprint } from "../../../lib/workingCopyFingerprint.ts";
import { useDecisionLogStore } from "../../../decisions/decisionLogStore.ts";
import { changedSectionsSince, useTestingStore } from "../../../stores/testingStore.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import type { StepDrivers } from "./types.ts";

export const trialDrivers: StepDrivers = {
  trial: async () => {
    const testing = useTestingStore.getState();
    const workingCopy = useWorkingCopyStore.getState();
    const number = testing.nextBuildNumber;
    const versionResult = resolveTestBuildVersion({
      mode: workingCopy.instantiationMode === "adapt-existing" ? "adapt-existing" : "new-from-base",
      rawVersion: workingCopy.startIr?.header.version?.trim() || "1.0",
      buildNumber: number,
    });
    if (!versionResult.ok) {
      throw new Error(`trial driver: cannot resolve a test build version: ${versionResult.reason}`);
    }
    let result;
    try {
      result = await buildTestBuildKmp({ number, version: versionResult.version });
    } catch (err) {
      // Reformat consent (see header): retry as the author agreeing.
      if (!(err instanceof ReformatConsentRequiredError)) throw err;
      result = await buildTestBuildKmp(
        { number, version: versionResult.version },
        { consentedReemit: true },
      );
    }
    if (result === null) {
      throw new Error("trial driver: nothing instantiated — no test build to make");
    }
    // Without a fingerprint the build cannot be compared with the next one,
    // so it is a failed build and uses up no number (FR-011).
    const fingerprint = await computeWorkingCopyFingerprint();
    if (fingerprint === null) {
      throw new Error("trial driver: could not fingerprint the working copy");
    }
    const previous = testing.builds[testing.builds.length - 1];
    const entries = useDecisionLogStore.getState().record.entries;
    const build = testing.recordBuild({
      version: versionResult.version,
      fingerprint,
      decisionCursor: entries.length,
      changedSections:
        previous === undefined
          ? []
          : changedSectionsSince(entries, previous.decisionCursor, previous.fingerprint !== fingerprint),
    });
    if (build === null) {
      throw new Error("trial driver: the project is frozen — no test builds can be recorded");
    }
    return { buildsAtCompletion: useTestingStore.getState().builds.length };
  },
};

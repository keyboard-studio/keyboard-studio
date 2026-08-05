// see spec.md §12 — output service (zip download + GitHub OAuth fork+PR)

import type {
  OutputService,
  VirtualFS,
  PublishPROptions,
  PublishPRResult,
  PublishManagedPROptions,
  PublishManagedPRResult,
  VerifyTokenResult,
} from "@keyboard-studio/contracts";
import { toZip } from "./zip.js";

export { toZip, serializeToZip } from "./zip.js";
export type { ToZipOptions } from "./zip.js";
export { createGitHubOutputService, isSourceFile } from "./github.js";
export type { GitHubOutputConfig, GitHubFetchFn } from "./github.js";
export { createManagedPROutputService } from "./managed-pr.js";
export type { ManagedPRFetchFn, ManagedPROutputConfig } from "./managed-pr.js";
export { addSidecar, isSidecarPath, STUDIO_METADATA_PREFIX } from "./sidecar.js";
export { buildImportAttributionBlock } from "./import-attribution.js";
export type { ImportAttributionInput } from "./import-attribution.js";
export { bumpKeyboardVersion, stageAdaptHistory } from "./adapt-staging.js";
// Decision audit (specs/053-decision-audit). Re-exported here — rather than only
// from the engine root — because the record's packaging half (the PR-body block
// and the `.studio/` sidecar writer) belongs to this module's lifecycle, so the
// record's readers and its packagers resolve from one place.
export {
  addDecisionRecordSidecar,
  buildDecisionSummaryBlock,
  DECISION_RECORD_VFS_PATH,
  diffLines,
  diffMagnitude,
  parseDecisionRecord,
  PR_SUMMARY_MAX_ENTRIES,
  serializeDecisionRecord,
  serializedRecordBytes,
  shedDecisionDetail,
} from "../decision-audit/index.js";
export type {
  DecisionSummaryOptions,
  ParseDecisionRecordResult,
} from "../decision-audit/index.js";

/**
 * Create a partial {@link OutputService} with the zip-download path wired up.
 *
 * `verifyToken` and `publishPR` throw "not implemented" — use
 * `createGitHubOutputService` (coming in issue #47) for the full OAuth path.
 *
 * @see spec.md §12
 */
export function createOutputService(): OutputService {
  return {
    toZip,

    verifyToken(_token: string): Promise<VerifyTokenResult> {
      return Promise.reject(
        new Error(
          "[output] verifyToken not implemented — use createGitHubOutputService"
        )
      );
    },

    publishPR(
      _fs: VirtualFS,
      _opts: PublishPROptions
    ): Promise<PublishPRResult> {
      return Promise.reject(
        new Error(
          "[output] publishPR not implemented — use createGitHubOutputService"
        )
      );
    },

    publishManagedPR(
      _fs: VirtualFS,
      _opts: PublishManagedPROptions
    ): Promise<PublishManagedPRResult> {
      return Promise.reject(
        new Error(
          "[output] publishManagedPR not implemented — use createManagedPROutputService"
        )
      );
    },
  };
}

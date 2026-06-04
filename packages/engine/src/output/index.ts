// see spec.md §12 — output service (zip download + GitHub OAuth fork+PR)

import type {
  OutputService,
  VirtualFS,
  PublishPROptions,
  PublishPRResult,
  VerifyTokenResult,
} from "@keyboard-studio/contracts";
import { toZip } from "./zip.js";

export { toZip, serializeToZip } from "./zip.js";
export { createGitHubOutputService } from "./github.js";
export type { GitHubOutputConfig, GitHubFetchFn } from "./github.js";

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
      throw new Error(
        "[output] verifyToken not implemented — use createGitHubOutputService"
      );
    },

    publishPR(
      _fs: VirtualFS,
      _opts: PublishPROptions
    ): Promise<PublishPRResult> {
      throw new Error(
        "[output] publishPR not implemented — use createGitHubOutputService"
      );
    },
  };
}

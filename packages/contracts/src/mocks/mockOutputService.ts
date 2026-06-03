// see spec.md section 12 — OutputService mock

import type {
  OutputService,
  PublishPROptions,
  PublishPRResult,
  VerifyTokenResult,
} from "../outputService";
import type { VirtualFS } from "../virtualFS";

/**
 * In-memory mock of {@link OutputService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §12
 */
export const mockOutputService: OutputService = {
  toZip(_fs: VirtualFS): Promise<Uint8Array> {
    // Minimal 4-byte PK End-of-Central-Directory signature.
    // This is NOT a parseable zip — do not feed it to a real zip library
    // in tests. It exists only to satisfy `Uint8Array` typing on the mock return.
    const emptyZip = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);
    return Promise.resolve(emptyZip);
  },

  verifyToken(token: string): Promise<VerifyTokenResult> {
    // Mock policy:
    //  - empty token -> ok:false, no login, no scopes
    //  - token starting with "ghp_" or "github_pat_" -> ok:true with the
    //    full required scope set (`public_repo`); login is the literal "mock-user"
    //  - any other token -> ok:false, scopes:["read:user"], missingScopes:["public_repo"]
    if (token === "") {
      return Promise.resolve({
        ok: false,
        scopes: [],
        missingScopes: ["public_repo"],
      });
    }
    if (token.startsWith("ghp_") || token.startsWith("github_pat_")) {
      return Promise.resolve({
        ok: true,
        login: "mock-user",
        scopes: ["public_repo"],
        missingScopes: [],
      });
    }
    return Promise.resolve({
      ok: false,
      login: "mock-user",
      scopes: ["read:user"],
      missingScopes: ["public_repo"],
    });
  },

  publishPR(
    _fs: VirtualFS,
    opts: PublishPROptions
  ): Promise<PublishPRResult> {
    const result: PublishPRResult = {
      prUrl: `https://github.com/keymanapp/keyboards/pull/9999`,
      commitSha: `deadbeef00000000000000000000000000000000`,
    };
    // Suppress unused-variable lint for opts fields that a real impl would use.
    void opts;
    return Promise.resolve(result);
  },
};

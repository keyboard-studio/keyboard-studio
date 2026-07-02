/**
 * GitHub App installation-token minter for the Option B (org-mediated PR) path.
 *
 * Reads three environment variables:
 *   GITHUB_APP_ID             — numeric app ID (string form)
 *   GITHUB_APP_PRIVATE_KEY    — base64-encoded PEM private key
 *   GITHUB_APP_INSTALLATION_ID — numeric installation ID (string form)
 *
 * If any of the three is absent or empty, `getInstallationToken()` returns
 * `undefined` ("not configured"), which the caller uses to keep the managed-PR
 * route disabled — mirroring the previous GITHUB_ORG_TOKEN=absent behaviour.
 *
 * The private key is decoded from base64 at first call and never logged.
 * Tokens are cached via @octokit/auth-app's built-in token cache; a new token
 * is only minted when the cached one is within 60 seconds of expiry.
 *
 * SECURITY CONTRACT:
 *  - The decoded private key is never included in any error message or log.
 *  - `getInstallationToken()` throws only for genuine runtime failures (e.g.
 *    network error reaching the GitHub token endpoint); callers should treat
 *    that as equivalent to "not configured" and return 503.
 */

import { createAppAuth } from "@octokit/auth-app";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppAuth = ReturnType<typeof createAppAuth>;

// ---------------------------------------------------------------------------
// Module-level cache — one auth instance per process. `createAppAuth` manages
// the installation token cache internally (refreshes ~60 s before expiry).
// ---------------------------------------------------------------------------

let _auth: AppAuth | undefined;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Decode a base64-encoded PEM private key.
 *
 * Operators store the key base64-encoded so multiline PEM content survives
 * environment-variable injection (e.g. Vercel, Docker secrets). This function
 * reverses that encoding to restore the raw PEM.
 */
function decodePem(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

/**
 * Build (or return the cached) `createAppAuth` instance.
 *
 * Returns `undefined` if any of the three required env vars is absent.
 * Never throws — configuration problems surface as `undefined`.
 */
function getAuth(): AppAuth | undefined {
  if (_auth !== undefined) return _auth;

  const appIdRaw = (process.env["GITHUB_APP_ID"] ?? "").trim();
  const privateKeyB64 = (process.env["GITHUB_APP_PRIVATE_KEY"] ?? "").trim();
  const installationIdRaw = (process.env["GITHUB_APP_INSTALLATION_ID"] ?? "").trim();

  if (!appIdRaw || !privateKeyB64 || !installationIdRaw) {
    return undefined;
  }

  const appId = parseInt(appIdRaw, 10);
  const installationId = parseInt(installationIdRaw, 10);

  if (!Number.isFinite(appId) || !Number.isFinite(installationId)) {
    // The vars are present but not parseable as integers — likely a typo in the
    // App ID or installation ID. Warn so the operator sees this at startup rather
    // than silently disabling the managed-PR route (mirrors server.ts partial-config warn).
    console.warn(
      "[WARN] managed submission is disabled: GITHUB_APP_ID and GITHUB_APP_INSTALLATION_ID must be parseable integers — at least one value is present but not a valid integer."
    );
    return undefined;
  }

  // Decode the base64-encoded PEM. The decoded value is used in-memory only;
  // it is never logged or included in any error message.
  const privateKey = decodePem(privateKeyB64);

  _auth = createAppAuth({ appId, privateKey, installationId });
  return _auth;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a bearer token for the configured GitHub App installation.
 *
 * Returns `undefined` when the App is not configured (any of the three
 * `GITHUB_APP_*` env vars is absent or empty). The caller should treat
 * `undefined` as "submission_not_configured" and keep the managed-PR route
 * disabled (503).
 *
 * Throws if the GitHub token endpoint is unreachable or returns an error after
 * the App is configured. Callers should map that to a 503 as well.
 *
 * The `@octokit/auth-app` library caches the installation token and re-mints
 * it automatically when the cached token is within 60 seconds of expiry, so
 * this function is safe to call on every request.
 */
export async function getInstallationToken(): Promise<string | undefined> {
  const auth = getAuth();
  if (auth === undefined) return undefined;

  const result = await auth({ type: "installation" });
  return result.token;
}

/**
 * Reset the cached auth instance. Used in tests to simulate different env-var
 * configurations between test cases without process restart.
 *
 * @internal
 */
export function _resetAuthCache(): void {
  _auth = undefined;
}

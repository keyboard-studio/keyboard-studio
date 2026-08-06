/**
 * GitHub App installation-token minter for the crash-reporting path
 * (spec 060, FR-085, research D4).
 *
 * Reads three environment variables:
 *   CRASH_REPORT_APP_ID              — numeric app ID (string form)
 *   CRASH_REPORT_APP_PRIVATE_KEY     — base64-encoded PEM private key
 *   CRASH_REPORT_APP_INSTALLATION_ID — numeric installation ID (string form)
 *
 * WHY THIS IS A SECOND FILE AND NOT A PARAMETER ON installation-token.ts.
 *
 * The two Apps hold deliberately different permissions. The managed-PR App
 * (`GITHUB_APP_*`) carries contents:write + pull_requests:write on
 * keyboard-studio/keyboards. The crash App carries issues:write on
 * keyboard-studio/crash-reports and nothing else — it is installed on that one
 * repository so a compromised crash route cannot write a line of keyboard
 * source anywhere.
 *
 * `installation-token.ts` caches its `createAppAuth` instance at module scope
 * and builds it on first call. Adding a second credential set to that file
 * would mean whichever pipeline called first would populate the shared cache
 * and hand ITS App to the other — silently granting the crash path write access
 * to the keyboards repo, or leaving managed-PR unable to open a PR. A separate
 * module with its own module-scope cache and its own `_reset*` test seam makes
 * that failure mode unrepresentable rather than merely unlikely.
 *
 * MUST NOT read, or fall back to, any `GITHUB_APP_*` variable.
 *
 * SECURITY CONTRACT (parity with installation-token.ts):
 *  - The decoded private key is never included in any error message or log.
 *  - `getCrashReportInstallationToken()` throws only for genuine runtime
 *    failures (e.g. the GitHub token endpoint being unreachable); callers treat
 *    that as equivalent to "not configured".
 */

import { createAppAuth } from "@octokit/auth-app";

type AppAuth = ReturnType<typeof createAppAuth>;

// ---------------------------------------------------------------------------
// Module-level cache — one auth instance per process, SEPARATE from the one in
// installation-token.ts. @octokit/auth-app manages the installation-token
// cache internally (refreshes ~60 s before expiry).
// ---------------------------------------------------------------------------

let _crashAuth: AppAuth | undefined;

/**
 * Decode a base64-encoded PEM private key.
 *
 * Operators store the key base64-encoded so multiline PEM content survives
 * environment-variable injection (Vercel, Docker secrets).
 */
function decodePem(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

/**
 * True when all three `CRASH_REPORT_APP_*` variables are present and non-empty.
 *
 * Exported so the route can distinguish "not configured" (503
 * `reporting_not_configured`) from "configured but the mint failed" (502
 * `submission_unavailable`) without minting a token to find out.
 */
export function isCrashReportAppConfigured(): boolean {
  return Boolean(
    (process.env["CRASH_REPORT_APP_ID"] ?? "").trim() &&
      (process.env["CRASH_REPORT_APP_PRIVATE_KEY"] ?? "").trim() &&
      (process.env["CRASH_REPORT_APP_INSTALLATION_ID"] ?? "").trim(),
  );
}

/**
 * Build (or return the cached) `createAppAuth` instance for the crash App.
 *
 * Returns `undefined` if any of the three required env vars is absent or
 * unparseable. Never throws — configuration problems surface as `undefined`.
 */
function getCrashAuth(): AppAuth | undefined {
  if (_crashAuth !== undefined) return _crashAuth;

  const appIdRaw = (process.env["CRASH_REPORT_APP_ID"] ?? "").trim();
  const privateKeyB64 = (process.env["CRASH_REPORT_APP_PRIVATE_KEY"] ?? "").trim();
  const installationIdRaw = (
    process.env["CRASH_REPORT_APP_INSTALLATION_ID"] ?? ""
  ).trim();

  if (!appIdRaw || !privateKeyB64 || !installationIdRaw) return undefined;

  const appId = parseInt(appIdRaw, 10);
  const installationId = parseInt(installationIdRaw, 10);

  if (!Number.isFinite(appId) || !Number.isFinite(installationId)) {
    console.warn(
      "[WARN] crash reporting is disabled: CRASH_REPORT_APP_ID and CRASH_REPORT_APP_INSTALLATION_ID must be parseable integers — at least one value is present but not a valid integer."
    );
    return undefined;
  }

  _crashAuth = createAppAuth({
    appId,
    privateKey: decodePem(privateKeyB64),
    installationId,
  });
  return _crashAuth;
}

/**
 * Return a bearer token for the crash-reporting App installation.
 *
 * Returns `undefined` when the App is not configured; the caller maps that to
 * 503 `reporting_not_configured`. Throws only if the GitHub token endpoint is
 * unreachable after the App IS configured — the caller maps that to 502
 * `submission_unavailable`, never revealing which credential is at fault
 * (FR-088).
 */
export async function getCrashReportInstallationToken(): Promise<string | undefined> {
  const auth = getCrashAuth();
  if (auth === undefined) return undefined;

  const result = await auth({ type: "installation" });
  return result.token;
}

/**
 * Key material for retraction capability tokens (FR-074a).
 *
 * Returns the RAW, still-base64 `CRASH_REPORT_APP_PRIVATE_KEY` value — never the
 * decoded PEM. The token module hashes whatever it is given behind a domain
 * separator, so the encoding is irrelevant to the derivation, and keeping the
 * decoded key inside `getCrashAuth()` means the PEM has exactly one reader.
 *
 * Returns `undefined` when the var is absent, which cannot coexist with a
 * configured route: `isCrashReportAppConfigured()` requires the same var, so
 * there is no state where the route is live but retraction tokens are unsigned.
 * That is why the pipeline config's `retractionSecret` is required rather than
 * optional — see the note on it in crash-report-pipeline.ts.
 */
export function getCrashReportRetractionSecret(): string | undefined {
  const raw = (process.env["CRASH_REPORT_APP_PRIVATE_KEY"] ?? "").trim();
  return raw === "" ? undefined : raw;
}

/**
 * Reset the cached crash-App auth instance. Used in tests to simulate different
 * env-var configurations between cases without a process restart.
 *
 * Deliberately distinct from `_resetAuthCache()` in installation-token.ts: a
 * test that reset one and expected the other to clear would pass for the wrong
 * reason and hide exactly the credential bleed this module prevents.
 *
 * @internal
 */
export function _resetCrashAuthCache(): void {
  _crashAuth = undefined;
}

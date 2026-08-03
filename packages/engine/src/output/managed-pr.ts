// see spec.md §12 + docs/github_flow.md "Option B" — org-mediated PR submission.
//
// Unlike github.ts (Option A), the engine never touches the GitHub API here and
// holds no repository credential. It POSTs the source tree + attribution to the
// oauth-backend proxy — forwarding the caller's sign-in token as `Authorization`
// purely so the proxy can verify who is submitting — and the proxy owns the org
// service-account token and runs the fork → tree → commit (Co-authored-by) →
// branch → draft-PR pipeline server-side. From the engine's perspective the
// proxy is just an HTTP endpoint returning { prUrl, commitSha }.

import type {
  OutputService,
  VirtualFS,
  PublishManagedPROptions,
  PublishManagedPRResult,
  PublishManagedPRError,
} from "@keyboard-studio/contracts";
import { isSourceFile } from "./github.js";

// ---------------------------------------------------------------------------
// Fetch abstraction — mirrors GitHubFetchFn so callers can inject one stub
// shape for both delivery paths.
// ---------------------------------------------------------------------------

export type ManagedPRFetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<ManagedPRFetchResponse>;

export interface ManagedPRFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface ManagedPROutputConfig {
  fetch?: ManagedPRFetchFn;
}

// ---------------------------------------------------------------------------
// Error mapping — proxy HTTP status → PublishManagedPRError discriminant.
//
// The user holds no token in this path, so "auth"/"scope" are meaningless
// (see the PublishManagedPRError union in outputService.ts); the SPA instead
// distinguishes proxy-vs-upstream failures.
// ---------------------------------------------------------------------------

interface ProxyErrorBody {
  message?: string;
  branchName?: string;
}

async function readErrorBody(res: ManagedPRFetchResponse): Promise<ProxyErrorBody> {
  try {
    const data = (await res.json()) as ProxyErrorBody;
    return data ?? {};
  } catch {
    return {};
  }
}

async function mapFailure(
  res: ManagedPRFetchResponse,
  opts: PublishManagedPROptions
): Promise<PublishManagedPRError> {
  const body = await readErrorBody(res);
  const message = body.message ?? res.statusText ?? `HTTP ${res.status}`;

  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After") ?? "60");
    return {
      kind: "rate-limit",
      message: "Submission rate limit exceeded — retry shortly",
      retryAfterSeconds: Number.isFinite(retry) ? retry : 60,
    };
  }
  if (res.status === 409) {
    return {
      kind: "branch-exists",
      message: "A submission branch for this keyboard already exists upstream",
      branchName: body.branchName ?? `add/${opts.keyboardId}`,
    };
  }
  // 5xx — the proxy reached GitHub but the upstream call failed.
  if (res.status >= 500) {
    return { kind: "upstream-failure", message };
  }
  // Other 4xx — the proxy rejected the request (validation, etc.).
  return { kind: "proxy-rejected", message, httpStatus: res.status };
}

// ---------------------------------------------------------------------------
// publishManagedPR
// ---------------------------------------------------------------------------

/**
 * Submit the virtual FS via the studio org's standing fork, through the
 * oauth-backend proxy. Implements {@link OutputService.publishManagedPR}.
 *
 * Only source files are sent; compiled artifacts (`.kmx`, `.kvk`, `.js`) and
 * import sidecars are excluded by {@link isSourceFile} (criteria SS1, spec §12),
 * exactly as the Option A path does. Binary entries are skipped — the managed
 * request body carries text content only (see ManagedPRBodySchema in the
 * oauth-backend).
 *
 * @throws {PublishManagedPRError} Discriminated union — callers `switch` on `err.kind`.
 */
export async function publishManagedPR(
  fs: VirtualFS,
  opts: PublishManagedPROptions,
  fetchFn: ManagedPRFetchFn
): Promise<PublishManagedPRResult> {
  const sourceFiles = fs
    .entries()
    .filter((e) => isSourceFile(e.path) && typeof e.content === "string")
    .map((e) => ({ path: e.path, content: e.content as string }));

  const requestBody = {
    attribution: opts.attribution,
    keyboardId: opts.keyboardId,
    prTitle: opts.prTitle,
    prBody: opts.prBody,
    ...(opts.importAttribution !== undefined
      ? { importAttribution: opts.importAttribution }
      : {}),
    sourceFiles,
  };

  let res: ManagedPRFetchResponse;
  try {
    res = await fetchFn(opts.proxyEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        // Identity proof, not a repository credential: the proxy verifies it
        // against the provider and derives commit authorship from the result.
        // Omitted when the caller has no token, so pre-token callers are
        // unaffected at this layer — the proxy is what refuses them.
        ...(opts.accessToken !== undefined
          ? { Authorization: `Bearer ${opts.accessToken}` }
          : {}),
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    // Could not reach the proxy at all.
    throw {
      kind: "proxy-unavailable",
      message: `Could not reach submission service: ${String(err)}`,
    } satisfies PublishManagedPRError;
  }

  if (!res.ok) {
    throw await mapFailure(res, opts);
  }

  let data: PublishManagedPRResult;
  try {
    data = (await res.json()) as PublishManagedPRResult;
  } catch (err) {
    throw {
      kind: "unknown",
      message: `Malformed submission response: ${String(err)}`,
      cause: err,
    } satisfies PublishManagedPRError;
  }

  return { prUrl: data.prUrl, commitSha: data.commitSha };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an {@link OutputService} slice with the org-mediated (Option B) path
 * wired up. Compose with {@link createOutputService} (zip) and
 * {@link createGitHubOutputService} (Option A) from `./index.js`.
 */
export function createManagedPROutputService(
  config: ManagedPROutputConfig = {}
): Pick<OutputService, "publishManagedPR"> {
  const fetchFn: ManagedPRFetchFn =
    config.fetch ??
    ((url, init) =>
      (globalThis as unknown as { fetch: ManagedPRFetchFn }).fetch(url, init));

  return {
    publishManagedPR: (fs, opts) => publishManagedPR(fs, opts, fetchFn),
  };
}

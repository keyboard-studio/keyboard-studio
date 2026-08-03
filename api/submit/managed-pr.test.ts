// Tests for the /api/submit/managed-pr Vercel function.
//
// Mirrors api/oauth/_shared.test.ts in structure: we only verify the HTTP
// glue (method guard, 503 not-configured, body validation, status mapping,
// Retry-After header, 409+branchName). The submitManagedPR pipeline itself is
// tested in utilities/oauth-backend; here we inject a stub config so no real
// env vars or network are needed.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runManagedPRHandler } from "./managed-pr.js";
import type {
  ManagedPRPipelineConfig,
  GitHubPipelineFetchResponse,
} from "../../utilities/oauth-backend/src/github-pipeline.js";
import type { GitHubUser } from "../../utilities/oauth-backend/src/verify-github-user.js";

/** Default verified identity stubConfig()'s verifyUser resolves to. */
const DEFAULT_USER: GitHubUser = { id: 4144632, login: "octocat" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal valid POST body accepted by ManagedPRBodySchema.
 *
 * `sourceFiles[].path` is package-root-relative, as the SPA posts it. The
 * `release/<firstLetter>/<keyboardId>/` location is derived server-side by the
 * core (see submit-paths.ts); a client-supplied `release/` first segment is
 * now rejected outright as `metadata`, so a pre-prefixed fixture here would
 * never reach the pipeline logic these tests are about.
 */
function validBody() {
  return {
    attribution: { displayName: "Alice", email: "alice@example.com" },
    keyboardId: "test_kbd",
    prTitle: "Add test keyboard",
    prBody: "This keyboard does stuff.",
    sourceFiles: [{ path: "source/test_kbd.kmn", content: "c comment\n" }],
  };
}

function postReq(body: unknown): Request {
  return new Request("https://app.example/submit/managed-pr", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/**
 * Build a stub ManagedPRPipelineConfig whose fetch function returns the given
 * sequence of responses in order (one per pipeline step). Under the same-repo
 * staging model there is no fork-check step, so a success run makes 6 calls:
 * master-ref, parent-commit, tree, commit, branch-ref, PR.
 *
 * `verifyUserOverride` defaults to resolving DEFAULT_USER so every existing
 * (pre-D-10) caller of stubConfig keeps exercising the pipeline unchanged;
 * the delegation tests below pass their own verifyUser to observe what it
 * is handed, or to force the 401 gate.
 */
function stubConfig(
  responses: Array<Partial<GitHubPipelineFetchResponse> & { body?: unknown }>,
  tokenOverride = "tok_test",
  verifyUserOverride: (token: string | null) => Promise<GitHubUser | null> = () =>
    Promise.resolve(DEFAULT_USER),
): ManagedPRPipelineConfig & { getCallCount: () => number } {
  let callIndex = 0;
  return {
    getInstallationToken: () => Promise.resolve(tokenOverride),
    orgLogin: "test-org",
    fetch: async (_url, _init) => {
      const r = responses[callIndex++] ?? { ok: true, status: 200, body: {} };
      const body = r.body ?? {};
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        statusText: r.statusText ?? "OK",
        headers: { get: (_name: string) => r.headers?.get(_name) ?? null },
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      };
    },
    verifyUser: verifyUserOverride,
    getCallCount: () => callIndex,
  };
}

/** Full happy-path sequence: ref, parent commit, tree, commit, branch, PR. */
function successResponses() {
  return [
    // 1. Master ref
    { ok: true, status: 200, body: { object: { sha: "aaaa1111" } } },
    // 2. Parent commit
    { ok: true, status: 200, body: { tree: { sha: "bbbb2222" } } },
    // 3. Create tree
    { ok: true, status: 201, body: { sha: "cccc3333" } },
    // 4. Create commit
    { ok: true, status: 201, body: { sha: "dddd4444dddd444" } },
    // 5. Create branch ref
    { ok: true, status: 201, body: {} },
    // 6. Create PR
    { ok: true, status: 201, body: { html_url: "https://github.com/keymanapp/keyboards/pull/99" } },
  ];
}

// ---------------------------------------------------------------------------
// Method guard
// ---------------------------------------------------------------------------

describe("runManagedPRHandler — method guard", () => {
  it("returns 405 with Allow: POST for non-POST requests", async () => {
    const req = new Request("https://app.example/submit/managed-pr", { method: "GET" });
    const res = await runManagedPRHandler(req, stubConfig([]));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  it("returns 405 for DELETE", async () => {
    const req = new Request("https://app.example/submit/managed-pr", { method: "DELETE" });
    const res = await runManagedPRHandler(req, stubConfig([]));
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Not configured (503)
// ---------------------------------------------------------------------------

describe("runManagedPRHandler — not configured", () => {
  it("returns 503 submission_not_configured when configOverride is null", async () => {
    const res = await runManagedPRHandler(postReq(validBody()), null);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "submission_not_configured" });
  });
});

// ---------------------------------------------------------------------------
// Env-driven config gating — parity with the standalone Fastify server.
// Both "ORG_LOGIN missing" AND "App vars missing" must yield 503
// submission_not_configured (not 502), matching server.ts's appConfigured gate.
// These exercise envManagedPRConfig() by calling the handler with NO override.
// ---------------------------------------------------------------------------

describe("runManagedPRHandler — env-driven config gating", () => {
  const ENV_KEYS = [
    "GITHUB_ORG_LOGIN",
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_INSTALLATION_ID",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns 503 when GITHUB_ORG_LOGIN is unset", async () => {
    delete process.env["GITHUB_ORG_LOGIN"];
    const res = await runManagedPRHandler(postReq(validBody()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "submission_not_configured" });
  });

  it("returns 503 (not 502) when ORG_LOGIN is set but GITHUB_APP_* vars are absent", async () => {
    process.env["GITHUB_ORG_LOGIN"] = "test-org";
    delete process.env["GITHUB_APP_ID"];
    delete process.env["GITHUB_APP_PRIVATE_KEY"];
    delete process.env["GITHUB_APP_INSTALLATION_ID"];
    const res = await runManagedPRHandler(postReq(validBody()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "submission_not_configured" });
  });
});

// ---------------------------------------------------------------------------
// Body validation (400)
// ---------------------------------------------------------------------------

describe("runManagedPRHandler — body validation", () => {
  it("returns 400 invalid_request when body is not JSON", async () => {
    const req = new Request("https://app.example/submit/managed-pr", {
      method: "POST",
      body: "{ not json",
      headers: { "content-type": "application/json" },
    });
    const res = await runManagedPRHandler(req, stubConfig([]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 invalid_request when required fields are missing", async () => {
    const res = await runManagedPRHandler(postReq({ nope: 1 }), stubConfig([]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 invalid_request when keyboardId has invalid characters", async () => {
    const body = { ...validBody(), keyboardId: "INVALID!" };
    const res = await runManagedPRHandler(postReq(body), stubConfig([]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 invalid_request when sourceFiles is empty", async () => {
    const body = { ...validBody(), sourceFiles: [] };
    const res = await runManagedPRHandler(postReq(body), stubConfig([]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });
});

// ---------------------------------------------------------------------------
// Success path (200)
// ---------------------------------------------------------------------------

describe("runManagedPRHandler — success", () => {
  it("returns 200 with prUrl and commitSha on a happy-path request", async () => {
    const config = stubConfig(successResponses());
    const res = await runManagedPRHandler(postReq(validBody()), config);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { prUrl: string; commitSha: string };
    expect(json.prUrl).toBe("https://github.com/keymanapp/keyboards/pull/99");
    expect(json.commitSha).toBe("dddd4444dddd444");
    expect(config.getCallCount()).toBe(successResponses().length);
  });
});

// ---------------------------------------------------------------------------
// Identity delegation (research D-10)
//
// The edge (managed-pr.ts) parses no bearer token and verifies no identity of
// its own: it forwards the raw `Authorization` header value to submitManagedPR
// verbatim, and submitManagedPR is the sole owner of the gate (parseBearer +
// config.verifyUser). These tests are NOT re-testing the gate's own pass/fail
// logic — that lives in utilities/oauth-backend/src/github-pipeline.test.ts.
// They prove the edge re-implements nothing: the exact header value crosses
// the boundary unparsed, a missing header crosses as `null` (never invented),
// a rejected identity stops the pipeline before any outbound call, and none
// of this disturbs the existing happy path.
// ---------------------------------------------------------------------------

describe("runManagedPRHandler — identity delegation (D-10)", () => {
  it("forwards the raw Authorization header value to the core's verifyUser, unparsed by the edge", async () => {
    let receivedToken: string | null | undefined = "not-called";
    const config = stubConfig(successResponses(), "tok_test", (token) => {
      receivedToken = token;
      return Promise.resolve(DEFAULT_USER);
    });
    const req = new Request("https://app.example/submit/managed-pr", {
      method: "POST",
      body: JSON.stringify(validBody()),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer distinctive_token_9f8e7d",
      },
    });
    const res = await runManagedPRHandler(req, config);
    expect(res.status).toBe(200);
    // submitManagedPR's own parseBearer strips the "Bearer " prefix before
    // calling verifyUser. Receiving exactly the token content here proves the
    // full raw header reached submitManagedPR intact — the edge did not
    // parse, reformat, substitute, or otherwise touch it.
    expect(receivedToken).toBe("distinctive_token_9f8e7d");
  });

  it("passes null (not an invented value) to the core's verifyUser, returns 401, and starts zero pipeline calls when the Authorization header is absent", async () => {
    let receivedToken: string | null | undefined = "not-called";
    const config = stubConfig(successResponses(), "tok_test", (token) => {
      receivedToken = token;
      return Promise.resolve(null);
    });
    const req = new Request("https://app.example/submit/managed-pr", {
      method: "POST",
      body: JSON.stringify(validBody()),
      headers: { "content-type": "application/json" },
      // deliberately no Authorization header
    });
    const res = await runManagedPRHandler(req, config);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(receivedToken).toBeNull();
    // The 401 must be issued before any outbound GitHub call, even though the
    // stub fetch has a full success sequence queued and ready to serve.
    expect(config.getCallCount()).toBe(0);
  });

  it("does not short-circuit: a valid verifyUser resolution still yields the unchanged 200 { prUrl, commitSha } shape", async () => {
    const config = stubConfig(successResponses(), "tok_test", () =>
      Promise.resolve(DEFAULT_USER),
    );
    const req = new Request("https://app.example/submit/managed-pr", {
      method: "POST",
      body: JSON.stringify(validBody()),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer tok_test",
      },
    });
    const res = await runManagedPRHandler(req, config);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { prUrl: string; commitSha: string };
    expect(json.prUrl).toBe("https://github.com/keymanapp/keyboards/pull/99");
    expect(json.commitSha).toBe("dddd4444dddd444");
    expect(config.getCallCount()).toBe(successResponses().length);
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe("runManagedPRHandler — error mapping", () => {
  it("returns 429 with Retry-After header when GitHub rate-limits", async () => {
    const retryAfterHeaders = { get: (name: string) => (name === "Retry-After" ? "30" : null) };
    const responses = [
      // Master ref triggers 429 (first pipeline call)
      { ok: false, status: 429, statusText: "Too Many Requests", headers: retryAfterHeaders, body: {} },
    ];
    const res = await runManagedPRHandler(postReq(validBody()), stubConfig(responses));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("rate_limited");
  });

  it("returns 409 with branchName when branch already exists", async () => {
    // Patch the 5th call (create branch ref) to return 422.
    const responses = successResponses();
    // index 4 = create branch ref (5th of the 6 same-repo pipeline calls)
    responses[4] = { ok: false, status: 422, statusText: "Unprocessable Entity", body: {} };
    const res = await runManagedPRHandler(postReq(validBody()), stubConfig(responses));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string; branchName: string };
    expect(json.error).toBe("branch_exists");
    // branchName is add/<keyboardId>-<first7ofCommitSha>
    expect(json.branchName).toBe("add/test_kbd-dddd444");
  });

  it("returns 502 submission_unavailable on GitHub 403 (token scope failure)", async () => {
    const responses = [
      { ok: false, status: 403, statusText: "Forbidden", body: {} },
    ];
    const res = await runManagedPRHandler(postReq(validBody()), stubConfig(responses));
    expect(res.status).toBe(502);
    expect((await res.json() as { error: string }).error).toBe("submission_unavailable");
  });

  it("returns 502 submission_unavailable when getInstallationToken throws", async () => {
    const brokenConfig: ManagedPRPipelineConfig = {
      getInstallationToken: () => Promise.reject(new Error("network down")),
      orgLogin: "test-org",
      fetch: async () => ({ ok: true, status: 200, statusText: "OK", headers: { get: () => null }, json: () => Promise.resolve({}), text: () => Promise.resolve("") }),
      verifyUser: () => Promise.resolve(DEFAULT_USER),
    };
    const res = await runManagedPRHandler(postReq(validBody()), brokenConfig);
    expect(res.status).toBe(502);
    expect((await res.json() as { error: string }).error).toBe("submission_unavailable");
  });
});

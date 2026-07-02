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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid POST body accepted by ManagedPRBodySchema. */
function validBody() {
  return {
    attribution: { displayName: "Alice", email: "alice@example.com" },
    keyboardId: "test_kbd",
    prTitle: "Add test keyboard",
    prBody: "This keyboard does stuff.",
    sourceFiles: [{ path: "release/t/test_kbd/test_kbd.kmn", content: "c comment\n" }],
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
 * sequence of responses in order (one per pipeline step). For success tests we
 * need ~8 responses covering fork-check, master-ref, parent-commit, tree,
 * commit, branch-ref, PR.
 */
function stubConfig(
  responses: Array<Partial<GitHubPipelineFetchResponse> & { body?: unknown }>,
  tokenOverride = "tok_test",
): ManagedPRPipelineConfig {
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
  };
}

/** Full happy-path sequence: fork present, ref, parent commit, tree, commit, branch, PR. */
function successResponses() {
  return [
    // 1. Fork exists (GET /repos/test-org/keyboards)
    { ok: true, status: 200, body: { name: "keyboards" } },
    // 2. Master ref
    { ok: true, status: 200, body: { object: { sha: "aaaa1111" } } },
    // 3. Parent commit
    { ok: true, status: 200, body: { tree: { sha: "bbbb2222" } } },
    // 4. Create tree
    { ok: true, status: 201, body: { sha: "cccc3333" } },
    // 5. Create commit
    { ok: true, status: 201, body: { sha: "dddd4444dddd444" } },
    // 6. Create branch ref
    { ok: true, status: 201, body: {} },
    // 7. Create PR
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
    const res = await runManagedPRHandler(postReq(validBody()), stubConfig(successResponses()));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { prUrl: string; commitSha: string };
    expect(json.prUrl).toBe("https://github.com/keymanapp/keyboards/pull/99");
    expect(json.commitSha).toBe("dddd4444dddd444");
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe("runManagedPRHandler — error mapping", () => {
  it("returns 429 with Retry-After header when GitHub rate-limits", async () => {
    const retryAfterHeaders = { get: (name: string) => (name === "Retry-After" ? "30" : null) };
    const responses = [
      // Fork check succeeds
      { ok: true, status: 200, body: { name: "keyboards" } },
      // Master ref triggers 429
      { ok: false, status: 429, statusText: "Too Many Requests", headers: retryAfterHeaders, body: {} },
    ];
    const res = await runManagedPRHandler(postReq(validBody()), stubConfig(responses));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("rate_limited");
  });

  it("returns 409 with branchName when branch already exists", async () => {
    // Patch the 6th call (create branch ref) to return 422.
    const responses = successResponses();
    // index 5 = create branch ref
    responses[5] = { ok: false, status: 422, statusText: "Unprocessable Entity", body: {} };
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
    };
    const res = await runManagedPRHandler(postReq(validBody()), brokenConfig);
    expect(res.status).toBe(502);
    expect((await res.json() as { error: string }).error).toBe("submission_unavailable");
  });
});

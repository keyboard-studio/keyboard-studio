// Tests for the /api/drafts Vercel function (runDraftsHandler + envDraftConfig).
//
// Mirrors api/submit/managed-pr.test.ts and api/oauth/google/exchange.test.ts in
// structure: we only verify the HTTP glue (env-gated 503, auth 401, method
// guard, request/response shape, error mapping). The draft-persistence logic
// itself (auth gating, multi-draft keying, size ceiling, schema validation) is
// tested in utilities/oauth-backend/src/draft-handlers.test.ts; here we inject
// a stub config (MemoryDraftStore + stub verifyUser) so no real Blob/Postgres
// or network is touched.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// index.ts unconditionally imports VercelDraftStore from ./_store.js, which in
// turn imports @vercel/blob / @vercel/postgres. Those packages are only
// installed under utilities/oauth-backend/node_modules (see _store.ts's
// header comment) and are not resolvable from api/drafts via plain Node ESM
// resolution in this unit-test environment. Stub the module so envDraftConfig()
// exercises the real env-gate branching without needing those packages at all
// — the store itself is never exercised here (all handler tests inject their
// own configOverride, which bypasses envDraftConfig()/VercelDraftStore).
vi.mock("./_store.js", () => ({
  VercelDraftStore: class StubVercelDraftStore {},
}));

import { runDraftsHandler, envDraftConfig, draftIdOf } from "./index.js";
import type { DraftHandlerConfig } from "../../utilities/oauth-backend/src/draft-handlers.js";
import { MemoryDraftStore } from "../../utilities/oauth-backend/src/draft-store.js";
import { DEFAULT_DRAFT_ID, MAX_DRAFT_BYTES, type DraftMeta } from "../../utilities/oauth-backend/src/draft-schemas.js";
import type { GitHubUser } from "../../utilities/oauth-backend/src/verify-github-user.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER: GitHubUser = { id: 4144632, login: "octocat" };
const AUTH = "Bearer gho_valid";

/** Stub DraftHandlerConfig backed by MemoryDraftStore; `user: null` simulates a bad token. */
function stubConfig(user: GitHubUser | null = USER): DraftHandlerConfig {
  return { store: new MemoryDraftStore(), verifyUser: () => Promise.resolve(user) };
}

const META: DraftMeta = {
  savedAt: 1_700_000_000_000,
  activeStepId: "carve",
  label: "Cree (Woods)",
  keyboardId: null,
  schemaVersion: 1,
  draftId: DEFAULT_DRAFT_ID,
  status: "draft",
  prUrl: null,
};

function putBody(meta: DraftMeta = META, draft: unknown = { hello: "world" }): unknown {
  return { meta, draft };
}

function req(
  method: string,
  opts: { search?: string; body?: unknown; auth?: string | null } = {},
): Request {
  const url = `https://app.example/drafts${opts.search ?? ""}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth !== null) headers["authorization"] = opts.auth ?? AUTH;
  return new Request(url, {
    method,
    ...(opts.body !== undefined
      ? { body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) }
      : {}),
    headers,
  });
}

// ---------------------------------------------------------------------------
// draftIdOf
// ---------------------------------------------------------------------------

describe("draftIdOf", () => {
  it("returns the DEFAULT_DRAFT_ID slot when ?draftId is absent", () => {
    expect(draftIdOf(new Request("https://app.example/drafts"))).toBe(DEFAULT_DRAFT_ID);
  });

  it("returns the DEFAULT_DRAFT_ID slot when ?draftId is empty", () => {
    expect(draftIdOf(new Request("https://app.example/drafts?draftId="))).toBe(DEFAULT_DRAFT_ID);
  });

  it("returns the explicit draftId when present", () => {
    expect(draftIdOf(new Request("https://app.example/drafts?draftId=cree-woods"))).toBe(
      "cree-woods",
    );
  });
});

// ---------------------------------------------------------------------------
// envDraftConfig — the opt-in provisioning gate
// ---------------------------------------------------------------------------

describe("envDraftConfig", () => {
  const ENV_KEYS = ["POSTGRES_URL", "DATABASE_URL", "BLOB_READ_WRITE_TOKEN"] as const;
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

  it("returns null when both POSTGRES_URL/DATABASE_URL and BLOB_READ_WRITE_TOKEN are unset", () => {
    delete process.env["POSTGRES_URL"];
    delete process.env["DATABASE_URL"];
    delete process.env["BLOB_READ_WRITE_TOKEN"];
    expect(envDraftConfig()).toBeNull();
  });

  it("returns null when only the DB var is set (blob token missing)", () => {
    process.env["POSTGRES_URL"] = "postgres://example";
    delete process.env["DATABASE_URL"];
    delete process.env["BLOB_READ_WRITE_TOKEN"];
    expect(envDraftConfig()).toBeNull();
  });

  it("returns null when only the blob token is set (DB var missing)", () => {
    delete process.env["POSTGRES_URL"];
    delete process.env["DATABASE_URL"];
    process.env["BLOB_READ_WRITE_TOKEN"] = "vercel_blob_rw_test";
    expect(envDraftConfig()).toBeNull();
  });

  it("returns a config when POSTGRES_URL + BLOB_READ_WRITE_TOKEN are both set", () => {
    process.env["POSTGRES_URL"] = "postgres://example";
    delete process.env["DATABASE_URL"];
    process.env["BLOB_READ_WRITE_TOKEN"] = "vercel_blob_rw_test";
    expect(envDraftConfig()).not.toBeNull();
  });

  it("returns a config when DATABASE_URL (fallback DB var) + BLOB_READ_WRITE_TOKEN are both set", () => {
    delete process.env["POSTGRES_URL"];
    process.env["DATABASE_URL"] = "postgres://example";
    process.env["BLOB_READ_WRITE_TOKEN"] = "vercel_blob_rw_test";
    expect(envDraftConfig()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Not configured (503) — via the handler's configOverride seam and the env path
// ---------------------------------------------------------------------------

describe("runDraftsHandler — not configured", () => {
  it("returns 503 draft_not_configured when configOverride is null, before touching auth", async () => {
    const res = await runDraftsHandler(req("GET", { auth: null }), null);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "draft_not_configured" });
  });

  it("returns 503 draft_not_configured from the env path when storage env is unset", async () => {
    const saved = {
      POSTGRES_URL: process.env["POSTGRES_URL"],
      DATABASE_URL: process.env["DATABASE_URL"],
      BLOB_READ_WRITE_TOKEN: process.env["BLOB_READ_WRITE_TOKEN"],
    };
    delete process.env["POSTGRES_URL"];
    delete process.env["DATABASE_URL"];
    delete process.env["BLOB_READ_WRITE_TOKEN"];
    try {
      const res = await runDraftsHandler(req("GET"));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "draft_not_configured" });
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Auth guard (401)
// ---------------------------------------------------------------------------

describe("runDraftsHandler — auth guard", () => {
  it("returns 401 unauthorized on GET when the bearer token does not verify", async () => {
    const res = await runDraftsHandler(req("GET"), stubConfig(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 unauthorized on GET when the Authorization header is missing", async () => {
    const res = await runDraftsHandler(req("GET", { auth: null }), stubConfig(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 unauthorized on PUT when the bearer token does not verify", async () => {
    const res = await runDraftsHandler(
      req("PUT", { body: putBody() }),
      stubConfig(null),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 unauthorized on DELETE when the bearer token does not verify", async () => {
    const res = await runDraftsHandler(req("DELETE"), stubConfig(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});

// ---------------------------------------------------------------------------
// Method guard (405)
// ---------------------------------------------------------------------------

describe("runDraftsHandler — method guard", () => {
  it("returns 405 method_not_allowed with an Allow header for POST", async () => {
    const res = await runDraftsHandler(req("POST", { body: {} }), stubConfig());
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, PUT, DELETE");
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  it("returns 405 for PATCH", async () => {
    const res = await runDraftsHandler(req("PATCH"), stubConfig());
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, PUT, DELETE");
  });
});

// ---------------------------------------------------------------------------
// GET — list vs single-meta
// ---------------------------------------------------------------------------

describe("runDraftsHandler — GET", () => {
  it("GET without draftId returns { drafts: [] } for a user with no drafts", async () => {
    const res = await runDraftsHandler(req("GET"), stubConfig());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ drafts: [] });
  });

  it("GET without draftId returns { drafts: [...] } after a PUT (list mode)", async () => {
    const config = stubConfig();
    await runDraftsHandler(req("PUT", { body: putBody() }), config);
    const res = await runDraftsHandler(req("GET"), config);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ drafts: [META] });
  });

  it("GET ?draftId=<id> returns { meta } for that draft (single-meta mode)", async () => {
    const config = stubConfig();
    await runDraftsHandler(req("PUT", { body: putBody() }), config);
    const res = await runDraftsHandler(req("GET", { search: `?draftId=${META.draftId}` }), config);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ meta: META });
  });

  it("GET ?draftId=<unknown> returns { meta: null }", async () => {
    const res = await runDraftsHandler(req("GET", { search: "?draftId=nonexistent" }), stubConfig());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ meta: null });
  });
});

// ---------------------------------------------------------------------------
// PUT — upsert
// ---------------------------------------------------------------------------

describe("runDraftsHandler — PUT", () => {
  it("returns 200 with { savedAt } on a valid upsert", async () => {
    const res = await runDraftsHandler(req("PUT", { body: putBody() }), stubConfig());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ savedAt: META.savedAt });
  });

  it("returns 400 invalid_request when the body is not valid JSON", async () => {
    const res = await runDraftsHandler(req("PUT", { body: "{ not json" }), stubConfig());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 invalid_request when meta fails schema validation", async () => {
    const badBody = { meta: { savedAt: 1 }, draft: {} }; // missing required meta fields
    const res = await runDraftsHandler(req("PUT", { body: badBody }), stubConfig());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 413 draft_too_large when the serialized body exceeds MAX_DRAFT_BYTES", async () => {
    const huge = "x".repeat(MAX_DRAFT_BYTES + 1);
    const res = await runDraftsHandler(
      req("PUT", { body: putBody(META, huge) }),
      stubConfig(),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "draft_too_large" });
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("runDraftsHandler — DELETE", () => {
  it("returns 200 { ok: true } for ?draftId=<id>, and the draft is gone afterward", async () => {
    const config = stubConfig();
    await runDraftsHandler(req("PUT", { body: putBody() }), config);

    const res = await runDraftsHandler(
      req("DELETE", { search: `?draftId=${META.draftId}` }),
      config,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const after = await runDraftsHandler(
      req("GET", { search: `?draftId=${META.draftId}` }),
      config,
    );
    expect(await after.json()).toEqual({ meta: null });
  });

  it("returns 200 { ok: true } even when the draftId does not exist (idempotent)", async () => {
    const res = await runDraftsHandler(req("DELETE", { search: "?draftId=nonexistent" }), stubConfig());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// Storage failure → 502, never leaking the underlying error
// ---------------------------------------------------------------------------

describe("runDraftsHandler — storage failure mapping", () => {
  function throwingConfig(): DraftHandlerConfig {
    return {
      store: {
        getMeta: () => Promise.reject(new Error("db unreachable")),
        getDraft: () => Promise.reject(new Error("db unreachable")),
        putDraft: () => Promise.reject(new Error("db unreachable")),
        deleteDraft: () => Promise.reject(new Error("db unreachable")),
        listMeta: () => Promise.reject(new Error("db unreachable")),
      },
      verifyUser: () => Promise.resolve(USER),
    };
  }

  it("returns 502 draft_unavailable on GET when the store throws", async () => {
    const res = await runDraftsHandler(req("GET"), throwingConfig());
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("draft_unavailable");
    expect(JSON.stringify(json)).not.toContain("db unreachable");
  });

  it("returns 502 draft_unavailable on PUT when the store throws", async () => {
    const res = await runDraftsHandler(req("PUT", { body: putBody() }), throwingConfig());
    expect(res.status).toBe(502);
    expect((await res.json()) as { error: string }).toEqual({ error: "draft_unavailable" });
  });

  it("returns 502 draft_unavailable on DELETE when the store throws", async () => {
    const res = await runDraftsHandler(req("DELETE"), throwingConfig());
    expect(res.status).toBe(502);
    expect((await res.json()) as { error: string }).toEqual({ error: "draft_unavailable" });
  });
});

// Tests for the /api/drafts/content Vercel function (runDraftContentHandler).
//
// Mirrors index.test.ts / managed-pr.test.ts in structure: HTTP glue only
// (method guard, 503 not-configured gate, 401 auth, response shape). The core
// getDraftContent logic is tested in
// utilities/oauth-backend/src/draft-handlers.test.ts; here we inject a stub
// config (MemoryDraftStore + stub verifyUser) so no real Blob/Postgres or
// network is touched.

import { describe, it, expect, vi } from "vitest";

// content.ts pulls in index.ts (for draftIdOf/envDraftConfig), which
// unconditionally imports VercelDraftStore from ./_store.js — see the same
// note in index.test.ts. Stub it so this file doesn't need @vercel/blob /
// @vercel/postgres resolvable from api/drafts.
vi.mock("./_store.js", () => ({
  VercelDraftStore: class StubVercelDraftStore {},
}));

import { runDraftContentHandler } from "./content.js";
import { runDraftsHandler } from "./index.js";
import type { DraftHandlerConfig } from "../../utilities/oauth-backend/src/draft-handlers.js";
import { MemoryDraftStore } from "../../utilities/oauth-backend/src/draft-store.js";
import { DEFAULT_DRAFT_ID, type DraftMeta } from "../../utilities/oauth-backend/src/draft-schemas.js";
import type { GitHubUser } from "../../utilities/oauth-backend/src/verify-github-user.js";

const USER: GitHubUser = { id: 4144632, login: "octocat" };
const AUTH = "Bearer gho_valid";

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

function req(opts: { search?: string; auth?: string | null; method?: string } = {}): Request {
  const url = `https://app.example/drafts/content${opts.search ?? ""}`;
  const headers: Record<string, string> = {};
  if (opts.auth !== null) headers["authorization"] = opts.auth ?? AUTH;
  return new Request(url, { method: opts.method ?? "GET", headers });
}

function putReq(body: unknown): Request {
  return new Request("https://app.example/drafts", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: AUTH },
  });
}

// ---------------------------------------------------------------------------
// Method guard
// ---------------------------------------------------------------------------

describe("runDraftContentHandler — method guard", () => {
  it("returns 405 with Allow: GET for a non-GET request", async () => {
    const res = await runDraftContentHandler(req({ method: "POST" }), stubConfig());
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  it("returns 405 for DELETE", async () => {
    const res = await runDraftContentHandler(req({ method: "DELETE" }), stubConfig());
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Not configured (503)
// ---------------------------------------------------------------------------

describe("runDraftContentHandler — not configured", () => {
  it("returns 503 draft_not_configured when configOverride is null, before auth", async () => {
    const res = await runDraftContentHandler(req({ auth: null }), null);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "draft_not_configured" });
  });
});

// ---------------------------------------------------------------------------
// Auth guard (401)
// ---------------------------------------------------------------------------

describe("runDraftContentHandler — auth guard", () => {
  it("returns 401 unauthorized when the bearer token does not verify", async () => {
    const res = await runDraftContentHandler(req(), stubConfig(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 unauthorized when the Authorization header is missing", async () => {
    const res = await runDraftContentHandler(req({ auth: null }), stubConfig(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});

// ---------------------------------------------------------------------------
// GET — success + null-shape
// ---------------------------------------------------------------------------

describe("runDraftContentHandler — GET", () => {
  it("returns { draft, meta } for a draftId that was saved via PUT /drafts", async () => {
    const config = stubConfig();
    const draftPayload = { version: 1, survey: { activeStepId: "carve" } };
    await runDraftsHandler(putReq({ meta: META, draft: draftPayload }), config);

    const res = await runDraftContentHandler(req({ search: `?draftId=${META.draftId}` }), config);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: draftPayload, meta: META });
  });

  it("defaults to the DEFAULT_DRAFT_ID slot when ?draftId is absent", async () => {
    const config = stubConfig();
    const draftPayload = { legacy: true };
    await runDraftsHandler(putReq({ meta: META, draft: draftPayload }), config);

    const res = await runDraftContentHandler(req(), config);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: draftPayload, meta: META });
  });

  it("returns { draft: null, meta: null } when the draftId has never been saved", async () => {
    const res = await runDraftContentHandler(req({ search: "?draftId=nonexistent" }), stubConfig());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: null, meta: null });
  });
});

// ---------------------------------------------------------------------------
// Storage failure → 502
// ---------------------------------------------------------------------------

describe("runDraftContentHandler — storage failure mapping", () => {
  it("returns 502 draft_unavailable when the store throws, without leaking the error", async () => {
    const throwingConfig: DraftHandlerConfig = {
      store: {
        getMeta: () => Promise.reject(new Error("db unreachable")),
        getDraft: () => Promise.reject(new Error("db unreachable")),
        putDraft: () => Promise.reject(new Error("db unreachable")),
        deleteDraft: () => Promise.reject(new Error("db unreachable")),
        listMeta: () => Promise.reject(new Error("db unreachable")),
      },
      verifyUser: () => Promise.resolve(USER),
    };
    const res = await runDraftContentHandler(req(), throwingConfig);
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("draft_unavailable");
    expect(JSON.stringify(json)).not.toContain("db unreachable");
  });
});

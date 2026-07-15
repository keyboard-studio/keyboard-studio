// Tests for the cloud-draft transport (serverDraftStore.ts). The global fetch
// is stubbed per-test; no network. Focus: request shape (method, auth header,
// URL, draftId threading), the multi-project list op, and fail-soft behavior
// (network/HTTP errors resolve benignly).

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  saveServerDraft,
  loadServerDraftMeta,
  loadServerDraftContent,
  clearServerDraft,
  listServerDrafts,
  serverMetaToDraftMeta,
  type ServerDraftMeta,
} from "./serverDraftStore.ts";
import type { StudioDraft } from "./draftTypes.ts";

const TOKEN = "gho_test";
const DRAFT_ID = "haus_latn";

const META: ServerDraftMeta = {
  savedAt: 1_700_000_000_000,
  activeStepId: "carve",
  label: "Cree (Woods)",
  keyboardId: null,
  schemaVersion: 1,
  draftId: DRAFT_ID,
  status: "draft",
  prUrl: null,
};

// Minimal StudioDraft stand-in — the transport treats it opaquely.
const DRAFT = { version: 1, savedAt: META.savedAt, survey: {}, workingCopy: null } as unknown as StudioDraft;

function mockFetch(impl: (url: string, init: RequestInit) => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => Promise.resolve(impl(url, init))),
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveServerDraft()", () => {
  it("PUTs { meta, draft } with a Bearer auth header and ?draftId= in the URL", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    mockFetch((url, init) => {
      captured = { url, init };
      return json({ savedAt: META.savedAt });
    });

    const ok = await saveServerDraft(TOKEN, META, DRAFT, DRAFT_ID);
    expect(ok).toBe(true);
    expect(captured?.url).toMatch(/\/drafts\?draftId=haus_latn$/);
    expect(captured?.init.method).toBe("PUT");
    expect((captured?.init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(JSON.parse(captured?.init.body as string)).toEqual({ meta: META, draft: DRAFT });
  });

  it("returns false on an HTTP error (e.g. 413) without throwing", async () => {
    mockFetch(() => json({ error: "draft_too_large" }, 413));
    expect(await saveServerDraft(TOKEN, META, DRAFT, DRAFT_ID)).toBe(false);
  });

  it("returns false when fetch rejects (offline)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(await saveServerDraft(TOKEN, META, DRAFT, DRAFT_ID)).toBe(false);
  });
});

describe("loadServerDraftMeta()", () => {
  it("returns the meta row on success and threads draftId into the query string", async () => {
    let capturedUrl: string | undefined;
    mockFetch((url) => {
      capturedUrl = url;
      return json({ meta: META });
    });
    expect(await loadServerDraftMeta(TOKEN, DRAFT_ID)).toEqual(META);
    expect(capturedUrl).toMatch(/\/drafts\?draftId=haus_latn$/);
  });

  it("returns null when the server has no draft", async () => {
    mockFetch(() => json({ meta: null }));
    expect(await loadServerDraftMeta(TOKEN, DRAFT_ID)).toBeNull();
  });

  it("returns null on 401 / network error (fail soft)", async () => {
    mockFetch(() => json({ error: "unauthorized" }, 401));
    expect(await loadServerDraftMeta(TOKEN, DRAFT_ID)).toBeNull();
  });

  it("returns null on a 503 (draft_not_configured) without throwing", async () => {
    mockFetch(() => json({ error: "draft_not_configured" }, 503));
    expect(await loadServerDraftMeta(TOKEN, DRAFT_ID)).toBeNull();
  });
});

describe("listServerDrafts()", () => {
  it("GETs /drafts with no draftId and parses { drafts: [...] }", async () => {
    let capturedUrl: string | undefined;
    const rows: ServerDraftMeta[] = [META, { ...META, draftId: "other_kb", status: "submitted", prUrl: "https://x" }];
    mockFetch((url) => {
      capturedUrl = url;
      return json({ drafts: rows });
    });

    const result = await listServerDrafts(TOKEN);
    expect(result).toEqual(rows);
    expect(capturedUrl).toMatch(/\/drafts$/);
    expect(capturedUrl).not.toMatch(/draftId/);
  });

  it("returns [] on a 503 (draft_not_configured) fail-soft, never throws", async () => {
    mockFetch(() => json({ error: "draft_not_configured" }, 503));
    expect(await listServerDrafts(TOKEN)).toEqual([]);
  });

  it("returns [] on a network error without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    await expect(listServerDrafts(TOKEN)).resolves.toEqual([]);
  });

  it("returns [] when the response body is malformed (drafts not an array)", async () => {
    mockFetch(() => json({ drafts: "not-an-array" }));
    expect(await listServerDrafts(TOKEN)).toEqual([]);
  });
});

describe("loadServerDraftContent()", () => {
  it("returns the full draft payload on success and threads draftId", async () => {
    mockFetch((url) => {
      expect(url).toMatch(/\/drafts\/content\?draftId=haus_latn$/);
      return json({ draft: DRAFT });
    });
    expect(await loadServerDraftContent(TOKEN, DRAFT_ID)).toEqual(DRAFT);
  });

  it("returns null when absent", async () => {
    mockFetch(() => json({ draft: null }));
    expect(await loadServerDraftContent(TOKEN, DRAFT_ID)).toBeNull();
  });
});

describe("clearServerDraft()", () => {
  it("DELETEs with ?draftId= and returns true on success", async () => {
    let method: string | undefined;
    let url: string | undefined;
    mockFetch((u, init) => {
      method = init.method;
      url = u;
      return json({ ok: true });
    });
    expect(await clearServerDraft(TOKEN, DRAFT_ID)).toBe(true);
    expect(method).toBe("DELETE");
    expect(url).toMatch(/\/drafts\?draftId=haus_latn$/);
  });

  it("returns false on failure without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    expect(await clearServerDraft(TOKEN, DRAFT_ID)).toBe(false);
  });
});

describe("serverMetaToDraftMeta()", () => {
  it("maps a server row to a cloud-sourced DraftMeta", () => {
    expect(serverMetaToDraftMeta(META)).toEqual({
      savedAt: META.savedAt,
      activeStepId: "carve",
      label: "Cree (Woods)",
      source: "cloud",
    });
  });
});

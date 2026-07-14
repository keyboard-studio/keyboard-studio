// Tests for the cloud-draft transport (serverDraftStore.ts). The global fetch
// is stubbed per-test; no network. Focus: request shape (method, auth header,
// URL) and fail-soft behavior (network/HTTP errors resolve benignly).

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  saveServerDraft,
  loadServerDraftMeta,
  loadServerDraftContent,
  clearServerDraft,
  serverMetaToDraftMeta,
  type ServerDraftMeta,
} from "./serverDraftStore.ts";
import type { StudioDraft } from "./draftTypes.ts";

const TOKEN = "gho_test";

const META: ServerDraftMeta = {
  savedAt: 1_700_000_000_000,
  activeStepId: "carve",
  label: "Cree (Woods)",
  keyboardId: null,
  schemaVersion: 1,
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
  it("PUTs { meta, draft } with a Bearer auth header", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    mockFetch((url, init) => {
      captured = { url, init };
      return json({ savedAt: META.savedAt });
    });

    const ok = await saveServerDraft(TOKEN, META, DRAFT);
    expect(ok).toBe(true);
    expect(captured?.url).toMatch(/\/drafts$/);
    expect(captured?.init.method).toBe("PUT");
    expect((captured?.init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(JSON.parse(captured?.init.body as string)).toEqual({ meta: META, draft: DRAFT });
  });

  it("returns false on an HTTP error (e.g. 413) without throwing", async () => {
    mockFetch(() => json({ error: "draft_too_large" }, 413));
    expect(await saveServerDraft(TOKEN, META, DRAFT)).toBe(false);
  });

  it("returns false when fetch rejects (offline)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(await saveServerDraft(TOKEN, META, DRAFT)).toBe(false);
  });
});

describe("loadServerDraftMeta()", () => {
  it("returns the meta row on success", async () => {
    mockFetch(() => json({ meta: META }));
    expect(await loadServerDraftMeta(TOKEN)).toEqual(META);
  });

  it("returns null when the server has no draft", async () => {
    mockFetch(() => json({ meta: null }));
    expect(await loadServerDraftMeta(TOKEN)).toBeNull();
  });

  it("returns null on 401 / network error (fail soft)", async () => {
    mockFetch(() => json({ error: "unauthorized" }, 401));
    expect(await loadServerDraftMeta(TOKEN)).toBeNull();
  });
});

describe("loadServerDraftContent()", () => {
  it("returns the full draft payload on success", async () => {
    mockFetch((url) => {
      expect(url).toMatch(/\/drafts\/content$/);
      return json({ draft: DRAFT });
    });
    expect(await loadServerDraftContent(TOKEN)).toEqual(DRAFT);
  });

  it("returns null when absent", async () => {
    mockFetch(() => json({ draft: null }));
    expect(await loadServerDraftContent(TOKEN)).toBeNull();
  });
});

describe("clearServerDraft()", () => {
  it("DELETEs and returns true on success", async () => {
    let method: string | undefined;
    mockFetch((_url, init) => {
      method = init.method;
      return json({ ok: true });
    });
    expect(await clearServerDraft(TOKEN)).toBe(true);
    expect(method).toBe("DELETE");
  });

  it("returns false on failure without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    expect(await clearServerDraft(TOKEN)).toBe(false);
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

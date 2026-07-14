/**
 * Unit tests for the server-side draft handlers (draft-handlers.ts).
 *
 * Uses MemoryDraftStore and a stub verifyUser so no network/DB is touched.
 * A real GitHub /user round-trip is covered in verify-github-user.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  deleteDraft,
  getDraftContent,
  getDraftMeta,
  putDraft,
  type DraftHandlerConfig,
} from "./draft-handlers.js";
import { MemoryDraftStore } from "./draft-store.js";
import { MAX_DRAFT_BYTES, type DraftMeta } from "./draft-schemas.js";
import type { GitHubUser } from "./verify-github-user.js";

const USER: GitHubUser = { id: 4144632, login: "octocat" };

function makeConfig(user: GitHubUser | null = USER): DraftHandlerConfig {
  return { store: new MemoryDraftStore(), verifyUser: async () => user };
}

const META: DraftMeta = {
  savedAt: 1_700_000_000_000,
  activeStepId: "carve",
  label: "Cree (Woods)",
  keyboardId: null,
  schemaVersion: 1,
};

function putBody(meta: DraftMeta = META, draft: unknown = { hello: "world" }): string {
  return JSON.stringify({ meta, draft });
}

const AUTH = "Bearer gho_valid";

describe("auth gating", () => {
  it("401s every operation when the token does not verify", async () => {
    const config = makeConfig(null);
    expect((await getDraftMeta(AUTH, config)).status).toBe(401);
    expect((await getDraftContent(AUTH, config)).status).toBe(401);
    expect((await putDraft(AUTH, putBody(), config)).status).toBe(401);
    expect((await deleteDraft(AUTH, config)).status).toBe(401);
  });
});

describe("putDraft() + getDraftMeta() + getDraftContent()", () => {
  it("round-trips a saved draft: meta then full content", async () => {
    const config = makeConfig();
    const draftPayload = { version: 1, survey: { activeStepId: "carve" } };

    const put = await putDraft(AUTH, putBody(META, draftPayload), config);
    expect(put.ok && put.status).toBe(200);
    if (put.ok) expect(put.data.savedAt).toBe(META.savedAt);

    const meta = await getDraftMeta(AUTH, config);
    expect(meta.ok && meta.data.meta).toEqual(META);

    const content = await getDraftContent(AUTH, config);
    expect(content.ok && content.data.draft).toEqual(draftPayload);
    expect(content.ok && content.data.meta).toEqual(META);
  });

  it("returns null meta/content when the user has no draft", async () => {
    const config = makeConfig();
    const meta = await getDraftMeta(AUTH, config);
    expect(meta.ok && meta.data.meta).toBeNull();
    const content = await getDraftContent(AUTH, config);
    expect(content.ok && content.data.draft).toBeNull();
  });

  it("upsert replaces the previous draft (single-draft model)", async () => {
    const config = makeConfig();
    await putDraft(AUTH, putBody(META, { v: 1 }), config);
    const newer: DraftMeta = { ...META, savedAt: META.savedAt + 5000, activeStepId: "touch" };
    await putDraft(AUTH, putBody(newer, { v: 2 }), config);

    const meta = await getDraftMeta(AUTH, config);
    expect(meta.ok && meta.data.meta?.activeStepId).toBe("touch");
    const content = await getDraftContent(AUTH, config);
    expect(content.ok && content.data.draft).toEqual({ v: 2 });
  });

  it("400s on malformed JSON and on a schema-invalid body", async () => {
    const config = makeConfig();
    expect((await putDraft(AUTH, "{not json", config)).status).toBe(400);
    // missing meta.activeStepId
    const bad = JSON.stringify({ meta: { savedAt: 1, schemaVersion: 1 }, draft: {} });
    expect((await putDraft(AUTH, bad, config)).status).toBe(400);
  });

  it("413s a payload over MAX_DRAFT_BYTES before parsing", async () => {
    const config = makeConfig();
    const huge = "x".repeat(MAX_DRAFT_BYTES + 1);
    const body = JSON.stringify({ meta: META, draft: huge });
    const r = await putDraft(AUTH, body, config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("draft_too_large");
  });
});

describe("deleteDraft()", () => {
  it("removes a stored draft; subsequent reads are null; idempotent", async () => {
    const config = makeConfig();
    await putDraft(AUTH, putBody(), config);
    expect((await deleteDraft(AUTH, config)).status).toBe(200);

    const meta = await getDraftMeta(AUTH, config);
    expect(meta.ok && meta.data.meta).toBeNull();
    // deleting again is a no-op success
    expect((await deleteDraft(AUTH, config)).status).toBe(200);
  });
});

describe("per-user isolation", () => {
  it("keys drafts by verified user id — one user cannot read another's", async () => {
    const store = new MemoryDraftStore();
    const asOctocat: DraftHandlerConfig = { store, verifyUser: async () => ({ id: 1, login: "octocat" }) };
    const asHubot: DraftHandlerConfig = { store, verifyUser: async () => ({ id: 2, login: "hubot" }) };

    await putDraft(AUTH, putBody(META, { owner: "octocat" }), asOctocat);

    const hubotMeta = await getDraftMeta(AUTH, asHubot);
    expect(hubotMeta.ok && hubotMeta.data.meta).toBeNull();
    const octocatContent = await getDraftContent(AUTH, asOctocat);
    expect(octocatContent.ok && octocatContent.data.draft).toEqual({ owner: "octocat" });
  });
});

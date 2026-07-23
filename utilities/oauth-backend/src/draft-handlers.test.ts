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
  listDrafts,
  putDraft,
  type DraftHandlerConfig,
} from "./draft-handlers.js";
import { MemoryDraftStore } from "./draft-store.js";
import { DEFAULT_DRAFT_ID, MAX_DRAFT_BYTES, type DraftMeta } from "./draft-schemas.js";
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
  draftId: DEFAULT_DRAFT_ID,
  status: "draft",
  prUrl: null,
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
    expect((await listDrafts(AUTH, config)).status).toBe(401);
  });
});

describe("putDraft() + getDraftMeta() + getDraftContent()", () => {
  it("round-trips a saved draft: meta then full content", async () => {
    const config = makeConfig();
    const draftPayload = { version: 1, survey: { activeStepId: "carve" } };

    const put = await putDraft(AUTH, putBody(META, draftPayload), config);
    expect(put.ok && put.status).toBe(200);
    if (put.ok) expect(put.data.savedAt).toBe(META.savedAt);

    const meta = await getDraftMeta(AUTH, config, META.draftId);
    expect(meta.ok && meta.data.meta).toEqual(META);

    const content = await getDraftContent(AUTH, config, META.draftId);
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

  it("upsert replaces the previous draft in the same slot", async () => {
    const config = makeConfig();
    await putDraft(AUTH, putBody(META, { v: 1 }), config);
    const newer: DraftMeta = { ...META, savedAt: META.savedAt + 5000, activeStepId: "touch" };
    await putDraft(AUTH, putBody(newer, { v: 2 }), config);

    const meta = await getDraftMeta(AUTH, config, META.draftId);
    expect(meta.ok && meta.data.meta?.activeStepId).toBe("touch");
    const content = await getDraftContent(AUTH, config, META.draftId);
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
    expect((await deleteDraft(AUTH, config, META.draftId)).status).toBe(200);

    const meta = await getDraftMeta(AUTH, config, META.draftId);
    expect(meta.ok && meta.data.meta).toBeNull();
    // deleting again is a no-op success
    expect((await deleteDraft(AUTH, config, META.draftId)).status).toBe(200);
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

// ---------------------------------------------------------------------------
// Multi-draft model ("My keyboards")
// ---------------------------------------------------------------------------

describe("multi-draft: put/get/delete keyed by draftId", () => {
  it("stores sibling drafts independently under distinct draftIds", async () => {
    const config = makeConfig();
    const creeMeta: DraftMeta = { ...META, draftId: "cree-woods", label: "Cree (Woods)" };
    const ojibweMeta: DraftMeta = { ...META, draftId: "ojibwe", label: "Ojibwe" };

    await putDraft(AUTH, putBody(creeMeta, { lang: "crk" }), config);
    await putDraft(AUTH, putBody(ojibweMeta, { lang: "oj" }), config);

    const cree = await getDraftMeta(AUTH, config, "cree-woods");
    expect(cree.ok && cree.data.meta).toEqual(creeMeta);
    const ojibwe = await getDraftMeta(AUTH, config, "ojibwe");
    expect(ojibwe.ok && ojibwe.data.meta).toEqual(ojibweMeta);

    const creeContent = await getDraftContent(AUTH, config, "cree-woods");
    expect(creeContent.ok && creeContent.data.draft).toEqual({ lang: "crk" });
    const ojibweContent = await getDraftContent(AUTH, config, "ojibwe");
    expect(ojibweContent.ok && ojibweContent.data.draft).toEqual({ lang: "oj" });
  });

  it("deletes one draftId's slot without touching a sibling", async () => {
    const config = makeConfig();
    const creeMeta: DraftMeta = { ...META, draftId: "cree-woods" };
    const ojibweMeta: DraftMeta = { ...META, draftId: "ojibwe" };
    await putDraft(AUTH, putBody(creeMeta), config);
    await putDraft(AUTH, putBody(ojibweMeta), config);

    expect((await deleteDraft(AUTH, config, "cree-woods")).status).toBe(200);

    const cree = await getDraftMeta(AUTH, config, "cree-woods");
    expect(cree.ok && cree.data.meta).toBeNull();
    const ojibwe = await getDraftMeta(AUTH, config, "ojibwe");
    expect(ojibwe.ok && ojibwe.data.meta).toEqual(ojibweMeta);
  });
});

describe("listDrafts()", () => {
  it("returns an empty array when the user has no drafts", async () => {
    const config = makeConfig();
    const r = await listDrafts(AUTH, config);
    expect(r.ok && r.data.drafts).toEqual([]);
  });

  it("returns every draft's metadata for the user", async () => {
    const config = makeConfig();
    const creeMeta: DraftMeta = { ...META, draftId: "cree-woods", label: "Cree (Woods)" };
    const ojibweMeta: DraftMeta = { ...META, draftId: "ojibwe", label: "Ojibwe" };
    await putDraft(AUTH, putBody(creeMeta), config);
    await putDraft(AUTH, putBody(ojibweMeta), config);

    const r = await listDrafts(AUTH, config);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.drafts).toHaveLength(2);
      expect(r.data.drafts).toEqual(expect.arrayContaining([creeMeta, ojibweMeta]));
    }
  });

  it("cross-user isolation: a user's list never includes another user's drafts", async () => {
    const store = new MemoryDraftStore();
    const asOctocat: DraftHandlerConfig = { store, verifyUser: async () => ({ id: 1, login: "octocat" }) };
    const asHubot: DraftHandlerConfig = { store, verifyUser: async () => ({ id: 2, login: "hubot" }) };

    await putDraft(AUTH, putBody({ ...META, draftId: "a" }), asOctocat);
    await putDraft(AUTH, putBody({ ...META, draftId: "b" }), asOctocat);
    await putDraft(AUTH, putBody({ ...META, draftId: "a" }), asHubot);

    const octocatList = await listDrafts(AUTH, asOctocat);
    expect(octocatList.ok && octocatList.data.drafts).toHaveLength(2);
    const hubotList = await listDrafts(AUTH, asHubot);
    expect(hubotList.ok && hubotList.data.drafts).toHaveLength(1);

    // Also unreachable by direct get/delete across users.
    const hubotReadsOctocat = await getDraftMeta(AUTH, asHubot, "b");
    expect(hubotReadsOctocat.ok && hubotReadsOctocat.data.meta).toBeNull();
    await deleteDraft(AUTH, asHubot, "b");
    const stillThere = await getDraftMeta(AUTH, asOctocat, "b");
    expect(stillThere.ok && stillThere.data.meta).not.toBeNull();
  });
});

describe("back-compat: un-upgraded client omits draftId/status/prUrl", () => {
  it("a PUT body without draftId/status/prUrl lands in the default slot", async () => {
    const config = makeConfig();
    // Raw body exactly as the pre-multi-draft client sends it — no draftId,
    // status, or prUrl fields at all.
    const legacyBody = JSON.stringify({
      meta: {
        savedAt: META.savedAt,
        activeStepId: META.activeStepId,
        label: META.label,
        keyboardId: META.keyboardId,
        schemaVersion: META.schemaVersion,
      },
      draft: { legacy: true },
    });

    const put = await putDraft(AUTH, legacyBody, config);
    expect(put.ok && put.status).toBe(200);

    // Readable via the default draftId (the un-upgraded client's implicit GET).
    const meta = await getDraftMeta(AUTH, config);
    expect(meta.ok && meta.data.meta?.draftId).toBe(DEFAULT_DRAFT_ID);
    expect(meta.ok && meta.data.meta?.status).toBe("draft");
    expect(meta.ok && meta.data.meta?.prUrl).toBeNull();

    const content = await getDraftContent(AUTH, config);
    expect(content.ok && content.data.draft).toEqual({ legacy: true });

    // Shows up in the list too, in the default slot.
    const list = await listDrafts(AUTH, config);
    expect(list.ok && list.data.drafts).toHaveLength(1);
    expect(list.ok && list.data.drafts[0]?.draftId).toBe(DEFAULT_DRAFT_ID);
  });
});

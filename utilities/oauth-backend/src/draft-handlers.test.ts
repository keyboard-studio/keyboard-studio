/**
 * Unit tests for the server-side draft handlers (draft-handlers.ts).
 *
 * Uses MemoryDraftStore and a stub verifyUser so no network/DB is touched.
 * A real GitHub /user round-trip is covered in verify-github-user.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  deleteAllDrafts,
  deleteDraft,
  exportDrafts,
  getDraftContent,
  getDraftMeta,
  listDrafts,
  purgeUserDrafts,
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

describe("draftId allowlist (storage pathname safety)", () => {
  const UNSAFE = ["../../probe", "..", "a/b", "a\\b", "x.json", "drafts/99999/../../x", "", "a".repeat(81)];

  it.each(UNSAFE)("400s PUT with meta.draftId %j and stores nothing", async (draftId) => {
    const store = new MemoryDraftStore();
    const config: DraftHandlerConfig = { store, verifyUser: async () => USER };
    const r = await putDraft(AUTH, putBody({ ...META, draftId }), config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_request");
    expect(await store.listMeta(USER.id)).toEqual([]);
  });

  it.each(UNSAFE)("400s GET meta/content and DELETE with query draftId %j", async (draftId) => {
    const config = makeConfig();
    expect((await getDraftMeta(AUTH, config, draftId)).status).toBe(400);
    expect((await getDraftContent(AUTH, config, draftId)).status).toBe(400);
    expect((await deleteDraft(AUTH, config, draftId)).status).toBe(400);
  });

  it("accepts keyboard-id-shaped keys and the client sentinels", async () => {
    const config = makeConfig();
    for (const draftId of ["sil_euro_latin", "basic_kbdfr", "cree-woods", DEFAULT_DRAFT_ID, "__pending__"]) {
      expect((await putDraft(AUTH, putBody({ ...META, draftId }), config)).status).toBe(200);
      expect((await getDraftMeta(AUTH, config, draftId)).status).toBe(200);
    }
  });

  it("still 401s before validating the id when unauthenticated", async () => {
    expect((await getDraftMeta(AUTH, makeConfig(null), "../x")).status).toBe(401);
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

describe("exportDrafts() — spec 097 DSAR self-service export", () => {
  it("401s when the token does not verify", async () => {
    const res = await exportDrafts(AUTH, makeConfig(null));
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it("exports identity plus every draft (payload + metadata), keyed to the caller only", async () => {
    const config = makeConfig();
    const creeMeta: DraftMeta = { ...META, draftId: "cree-woods", label: "Cree (Woods)" };
    await putDraft(AUTH, putBody(META, { a: 1 }), config);
    await putDraft(AUTH, putBody(creeMeta, { b: 2 }), config);
    // Another user's drafts must never leak into the caller's export.
    await config.store.putDraft(999, "someone-else", { ...META, draftId: "theirs" }, { secret: true });

    const res = await exportDrafts(AUTH, config);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.identity).toEqual({ githubUserId: USER.id, login: USER.login });
    expect(Number.isNaN(Date.parse(res.data.exportedAt))).toBe(false);
    expect(res.data.drafts).toHaveLength(2);
    const byId = new Map(res.data.drafts.map((d) => [d.meta.draftId, d.draft]));
    expect(byId.get(DEFAULT_DRAFT_ID)).toEqual({ a: 1 });
    expect(byId.get("cree-woods")).toEqual({ b: 2 });
    expect(byId.has("theirs")).toBe(false);
  });

  it("exports an empty drafts array for a user with nothing stored", async () => {
    const res = await exportDrafts(AUTH, makeConfig());
    expect(res.ok && res.data.drafts).toEqual([]);
  });
});

describe("deleteAllDrafts() — spec 098 self-service erasure", () => {
  it("401s when the token does not verify", async () => {
    const res = await deleteAllDrafts(AUTH, makeConfig(null));
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it("removes every draft including the legacy default slot, returns the count, then verifies empty", async () => {
    const config = makeConfig();
    await putDraft(AUTH, putBody(META, { a: 1 }), config);
    await putDraft(AUTH, putBody({ ...META, draftId: "cree-woods" }, { b: 2 }), config);
    await config.store.putDraft(999, "someone-else", META, { keep: true });

    const res = await deleteAllDrafts(AUTH, config);
    expect(res.ok && res.data.deleted).toBe(2);

    const list = await listDrafts(AUTH, config);
    expect(list.ok && list.data.drafts).toEqual([]);
    // Idempotent: a second erase reports zero, and the other user is untouched.
    const again = await deleteAllDrafts(AUTH, config);
    expect(again.ok && again.data.deleted).toBe(0);
    expect(await config.store.listMeta(999)).toHaveLength(1);
  });
});

describe("purgeUserDrafts() — spec 098 owner purge", () => {
  it("purges by identity key and emits the completion record", async () => {
    const config = makeConfig();
    await putDraft(AUTH, putBody(META, { a: 1 }), config);
    await putDraft(AUTH, putBody({ ...META, draftId: "ojibwe" }, { b: 2 }), config);

    const record = await purgeUserDrafts(USER.id, config);
    expect(record.githubUserId).toBe(USER.id);
    expect(record.deleted).toBe(2);
    expect(record.outcome).toBe("purged");
    expect(Number.isNaN(Date.parse(record.purgedAt))).toBe(false);
    expect(await config.store.listMeta(USER.id)).toEqual([]);
  });
});

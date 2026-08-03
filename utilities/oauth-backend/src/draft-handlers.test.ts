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
import { MemoryDraftStore, type DraftStore, type DraftUsage } from "./draft-store.js";
import {
  DEFAULT_DRAFT_ID,
  MAX_DRAFT_BYTES,
  MAX_DRAFTS_PER_USER,
  MAX_TOTAL_DRAFT_BYTES,
  type DraftMeta,
} from "./draft-schemas.js";
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

// ---------------------------------------------------------------------------
// Quota (US4 / FR-008, FR-009)
//
// The point of these is the *subtraction*: the quota compares against what
// storage would hold after the write, so replacing a row is measured as a delta.
// That is what lets a user sitting at quota keep saving work they already have.
// ---------------------------------------------------------------------------

describe("putDraft() quota", () => {
  /** Meta for one of the user's draft slots. */
  const slot = (draftId: string): DraftMeta => ({ ...META, draftId });

  /** A payload that serializes to at least `bytes` bytes. */
  function payloadOfSize(bytes: number): unknown {
    // JSON.stringify({p:"x…"}) adds 8 bytes of framing; never go negative.
    return { p: "x".repeat(Math.max(0, bytes - 8)) };
  }

  /**
   * A config whose store reports a fixed aggregate usage while behaving normally
   * for everything else — including {@link MemoryDraftStore.getDraftBytes}, so
   * the FR-009 subtraction still uses the row's real size.
   *
   * This is how the byte ceiling gets exercised without allocating 64 MiB: the
   * per-draft limit caps any single draft at 4 MiB, so reaching the aggregate for
   * real would take seventeen full-size drafts and prove nothing extra.
   */
  function configAtUsage(usage: DraftUsage, base = new MemoryDraftStore()): DraftHandlerConfig {
    const store: DraftStore = {
      getMeta: (u, d) => base.getMeta(u, d),
      getDraft: (u, d) => base.getDraft(u, d),
      putDraft: (u, l, m, dr) => base.putDraft(u, l, m, dr),
      deleteDraft: (u, d) => base.deleteDraft(u, d),
      listMeta: (u) => base.listMeta(u),
      getDraftBytes: (u, d) => base.getDraftBytes(u, d),
      getUsage: () => Promise.resolve(usage),
    };
    return { store, verifyUser: async () => USER };
  }

  it("refuses 409 draft_quota_exceeded at the draft-count limit", async () => {
    const config = makeConfig();
    for (let i = 0; i < MAX_DRAFTS_PER_USER; i++) {
      const res = await putDraft(AUTH, putBody(slot(`kb-${i}`)), config);
      expect(res.status, `draft ${i + 1} of ${MAX_DRAFTS_PER_USER}`).toBe(200);
    }

    const overflow = await putDraft(AUTH, putBody(slot("one-too-many")), config);
    expect(overflow.ok).toBe(false);
    expect(overflow.status).toBe(409);
    expect(overflow.ok === false && overflow.error).toBe("draft_quota_exceeded");
  });

  it("refuses 409 draft_quota_exceeded at the total-bytes limit", async () => {
    // Reaching 64 MiB for real would need seventeen 4 MiB drafts (the per-draft
    // ceiling refuses anything bigger, as the 413 test below pins), so the
    // aggregate is reported instead. What is under test is the handler's
    // arithmetic, not the store's ability to hold 64 MiB.
    const config = configAtUsage({ draftCount: 1, totalBytes: MAX_TOTAL_DRAFT_BYTES });

    const overflow = await putDraft(AUTH, putBody(slot("one-byte-too-far")), config);

    expect(overflow.ok).toBe(false);
    expect(overflow.status).toBe(409);
    expect(overflow.ok === false && overflow.error).toBe("draft_quota_exceeded");
  });

  it("admits a write that lands exactly on the byte ceiling", async () => {
    const draft = { hello: "world" };
    const exactBytes = new TextEncoder().encode(JSON.stringify(draft)).length;
    const config = configAtUsage({
      draftCount: 1,
      totalBytes: MAX_TOTAL_DRAFT_BYTES - exactBytes,
    });

    // The comparison is `>`, not `>=`: the quota is a ceiling the caller may
    // reach, not one they must stay below.
    const res = await putDraft(AUTH, putBody(slot("exact"), draft), config);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it("still accepts a same-size update to an existing draft at the count limit (FR-009)", async () => {
    const config = makeConfig();
    for (let i = 0; i < MAX_DRAFTS_PER_USER; i++) {
      expect((await putDraft(AUTH, putBody(slot(`kb-${i}`)), config)).status).toBe(200);
    }

    // At quota by count. Re-saving an existing slot is an update, not an insert,
    // so the count does not grow and the save must succeed — otherwise a user
    // who filled their quota could no longer save the keyboard they are editing.
    const resave = await putDraft(
      AUTH,
      putBody({ ...slot("kb-0"), savedAt: META.savedAt + 5_000 }),
      config,
    );
    expect(resave.ok).toBe(true);
    expect(resave.status).toBe(200);
  });

  it("still accepts a same-size or smaller update to an existing draft at the byte limit (FR-009)", async () => {
    const base = new MemoryDraftStore();
    const existing = payloadOfSize(300_000);
    await base.putDraft(USER.id, USER.login, slot("big-1"), existing);
    // Sitting exactly on the ceiling, with big-1 accounting for part of it.
    const config = configAtUsage({ draftCount: 1, totalBytes: MAX_TOTAL_DRAFT_BYTES }, base);

    // totalBytes - existingBytes + newBytes: re-saving the same bytes returns
    // the total to where it was, and shrinking lands below it. Neither can push
    // it up, so a user pinned at the ceiling can always keep saving.
    const resaved = await putDraft(AUTH, putBody(slot("big-1"), existing), config);
    expect(resaved.ok).toBe(true);
    expect(resaved.status).toBe(200);

    const shrunk = await putDraft(AUTH, putBody(slot("big-1"), payloadOfSize(2048)), config);
    expect(shrunk.ok).toBe(true);
    expect(shrunk.status).toBe(200);

    // A *new* slot at the same ceiling is refused — the allowance belongs to the
    // row being replaced, not to any write.
    const fresh = await putDraft(AUTH, putBody(slot("big-2"), payloadOfSize(2048)), config);
    expect(fresh.status).toBe(409);
  });

  it("treats a draft the store reports as zero bytes as present, not absent", async () => {
    // Absent and empty are distinct: getDraftBytes returns null for no row and a
    // number for a row. A store that reported 0 for a real row must still have
    // its owner's re-save counted as an update, or a user at the count limit
    // could no longer save that draft.
    const base = new MemoryDraftStore();
    await base.putDraft(USER.id, USER.login, slot("thin"), undefined);
    expect(await base.getDraftBytes(USER.id, "thin")).toBe(0);
    expect(await base.getDraftBytes(USER.id, "never-saved")).toBeNull();

    const config = configAtUsage({ draftCount: MAX_DRAFTS_PER_USER, totalBytes: 0 }, base);

    const resave = await putDraft(AUTH, putBody(slot("thin")), config);
    expect(resave.ok).toBe(true);
    expect(resave.status).toBe(200);

    // Contrast: a slot the store has never seen is an insert, and the count
    // limit refuses it.
    const insert = await putDraft(AUTH, putBody(slot("never-saved")), config);
    expect(insert.status).toBe(409);
  });

  it("leaves existing drafts intact after a refusal", async () => {
    const config = makeConfig();
    const keeper = { keep: "this" };
    expect((await putDraft(AUTH, putBody(slot("kb-0"), keeper), config)).status).toBe(200);
    for (let i = 1; i < MAX_DRAFTS_PER_USER; i++) {
      await putDraft(AUTH, putBody(slot(`kb-${i}`)), config);
    }

    expect((await putDraft(AUTH, putBody(slot("overflow")), config)).status).toBe(409);

    // The refusal happens before the store is written, so nothing was displaced
    // and the rejected slot was never created.
    const survivor = await getDraftContent(AUTH, config, "kb-0");
    expect(survivor.ok && survivor.data.draft).toEqual(keeper);
    const list = await listDrafts(AUTH, config);
    expect(list.ok && list.data.drafts).toHaveLength(MAX_DRAFTS_PER_USER);
    const rejected = await getDraftMeta(AUTH, config, "overflow");
    expect(rejected.ok && rejected.data.meta).toBeNull();
  });

  it("does not throttle a normal authoring session (SC-005)", async () => {
    const config = makeConfig();
    // A realistic session: a handful of keyboards, saved repeatedly at the
    // autosave/sync cadence. Nothing here should ever see a quota refusal.
    for (let round = 0; round < 40; round++) {
      for (const id of ["cree-woods", "bambara", "piaroa"]) {
        const res = await putDraft(
          AUTH,
          putBody({ ...slot(id), savedAt: META.savedAt + round * 1_000 }, payloadOfSize(200_000)),
          config,
        );
        expect(res.status, `${id} round ${round + 1}`).toBe(200);
      }
    }
  });

  it("keeps quotas per user, so one author cannot exhaust another's", async () => {
    const store = new MemoryDraftStore();
    const busy: DraftHandlerConfig = { store, verifyUser: async () => USER };
    const other: DraftHandlerConfig = {
      store,
      verifyUser: async () => ({ id: 999, login: "hubot" }),
    };

    for (let i = 0; i < MAX_DRAFTS_PER_USER; i++) {
      await putDraft(AUTH, putBody(slot(`kb-${i}`)), busy);
    }
    expect((await putDraft(AUTH, putBody(slot("overflow")), busy)).status).toBe(409);

    expect((await putDraft(AUTH, putBody(slot("kb-0")), other)).status).toBe(200);
  });

  it("reports the per-draft ceiling as 413, not as a quota refusal", async () => {
    const config = makeConfig();
    // draft_too_large is about THIS draft; draft_quota_exceeded is about the
    // caller's aggregate. FR-011 keeps them distinguishable.
    const oversized = putBody(slot("huge"), payloadOfSize(MAX_DRAFT_BYTES + 1024));
    const res = await putDraft(AUTH, oversized, config);
    expect(res.status).toBe(413);
    expect(res.ok === false && res.error).toBe("draft_too_large");
  });
});

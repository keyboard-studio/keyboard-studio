// Tests for the /api/drafts/export Vercel function (spec 097 DSAR export).
// Same _store stub rationale as index.test.ts: the Vercel SDKs are not
// resolvable from api/drafts in this unit-test environment, and every test
// injects its own configOverride anyway.

import { describe, it, expect, vi } from "vitest";

vi.mock("./_store.js", () => ({
  VercelDraftStore: class StubVercelDraftStore {},
}));

import { runExportHandler } from "./export.js";
import type { DraftHandlerConfig } from "../../utilities/oauth-backend/src/draft-handlers.js";
import { MemoryDraftStore } from "../../utilities/oauth-backend/src/draft-store.js";
import { DEFAULT_DRAFT_ID, type DraftMeta } from "../../utilities/oauth-backend/src/draft-schemas.js";
import type { GitHubUser } from "../../utilities/oauth-backend/src/verify-github-user.js";

const USER: GitHubUser = { id: 4144632, login: "octocat" };
const AUTH = "Bearer <redacted>";

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

function req(method = "GET", auth: string | null = AUTH): Request {
  const headers: Record<string, string> = {};
  if (auth !== null) headers["authorization"] = auth;
  return new Request("https://app.example/drafts/export", { method, headers });
}

describe("runExportHandler", () => {
  it("503s when storage is not configured", async () => {
    const res = await runExportHandler(req(), null);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "draft_not_configured" });
  });

  it("405s non-GET methods", async () => {
    const res = await runExportHandler(req("POST"), stubConfig());
    expect(res.status).toBe(405);
  });

  it("401s an unverifiable token", async () => {
    const res = await runExportHandler(req(), stubConfig(null));
    expect(res.status).toBe(401);
  });

  it("returns the export as a downloadable JSON attachment", async () => {
    const config = stubConfig();
    await config.store.putDraft(USER.id, USER.login, META, { hello: "world" });
    await config.store.putDraft(USER.id, USER.login, { ...META, draftId: "ojibwe" }, { b: 2 });

    const res = await runExportHandler(req(), config);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("keyboard-studio-export.json");
    const body = (await res.json()) as {
      exportedAt: string;
      identity: { githubUserId: number; login: string };
      drafts: Array<{ meta: DraftMeta; draft: unknown }>;
    };
    expect(body.identity).toEqual({ githubUserId: USER.id, login: USER.login });
    expect(body.drafts).toHaveLength(2);
    expect(body.drafts.map((d) => d.meta.draftId).sort()).toEqual([DEFAULT_DRAFT_ID, "ojibwe"]);
  });
});

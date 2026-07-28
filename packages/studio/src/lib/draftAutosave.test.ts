// draftAutosave.test.ts — the per-project ("My keyboards") localStorage
// persistence layer.
//
// Covers: the meaningful-progress guard (a pristine survey writes nothing),
// survey-slot round-trip through save → apply, working-copy round-trip, TTL
// expiry, malformed/wrong-version recovery, clearDraft, projectKey derivation,
// legacy-key migration (adopt/absent/expired/malformed/idempotent-no-op),
// listDrafts ordering, resume-specific-project, delete-specific-project, and
// the submission status transition.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IdentityLiteResult } from "../survey/IdentityLite.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { WorkingCopySnapshot } from "./persistWorkingCopy.ts";
import type { StudioDraft } from "./draftTypes.ts";
import {
  saveDraft,
  loadDraftMeta,
  applyDraft,
  clearDraft,
  startDraftAutosave,
  deriveProjectKey,
  migrateLegacyDraft,
  getActiveProjectKey,
  setActiveProject,
  listDrafts,
  resumeProject,
  deleteProject,
  recordProjectSubmission,
  PENDING_PROJECT_KEY,
} from "./draftAutosave.ts";

const LEGACY_DRAFT_KEY = "ks.studio.draft";
const PROJECT_INDEX_KEY = "ks.studio.projects.index";

function projectKeyStorageKey(projectKey: string): string {
  return `ks.studio.project.${projectKey}`;
}

function makeIdentity(english: string): IdentityLiteResult {
  return {
    autonym: english,
    english,
    languageSubtag: "ha",
    region: "",
    targetScriptRaw: "Latn",
    bcp47: "ha-Latn",
    supported: true,
    // prefill is not exercised by the draft layer — a minimal cast is enough.
    prefill: {} as IdentityLiteResult["prefill"],
  };
}

/** A minimal legacy-shape StudioDraft, seeded directly for migration tests. */
function makeLegacyDraft(overrides: {
  savedAt?: number;
  activeStepId?: string;
  workingCopy?: Partial<WorkingCopySnapshot> | null;
}): StudioDraft {
  return {
    version: 1,
    savedAt: overrides.savedAt ?? Date.now(),
    survey: {
      activeStepId: (overrides.activeStepId ?? "carve") as never,
      history: [],
      identityResult: null,
      scaffoldSpec: null,
    } as never,
    workingCopy: (overrides.workingCopy ?? null) as WorkingCopySnapshot | null,
  };
}

beforeEach(() => {
  localStorage.clear();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// projectKey derivation (pure function)
// ---------------------------------------------------------------------------

describe("deriveProjectKey()", () => {
  it("returns the pending slot when there is no working copy", () => {
    expect(deriveProjectKey(null)).toBe(PENDING_PROJECT_KEY);
  });

  it("prefers identity.keyboardId when set", () => {
    const wc = { identity: { keyboardId: "haus_latn" }, baseKeyboard: { id: "basic_kbdus" } } as unknown as WorkingCopySnapshot;
    expect(deriveProjectKey(wc)).toBe("haus_latn");
  });

  it("falls back to baseKeyboard.id when identity.keyboardId is unset", () => {
    const wc = { identity: null, baseKeyboard: { id: "basic_kbdus" } } as unknown as WorkingCopySnapshot;
    expect(deriveProjectKey(wc)).toBe("basic_kbdus");
  });

  it("falls back to the pending slot when neither identity nor baseKeyboard carry an id", () => {
    const wc = { identity: null, baseKeyboard: null } as unknown as WorkingCopySnapshot;
    expect(deriveProjectKey(wc)).toBe(PENDING_PROJECT_KEY);
  });
});

// ---------------------------------------------------------------------------
// saveDraft / loadDraftMeta / applyDraft / clearDraft — active-project scoped
// ---------------------------------------------------------------------------

describe("draftAutosave — active project", () => {
  it("saveDraft writes nothing for a pristine survey (no meaningful progress)", () => {
    saveDraft();
    expect(getActiveProjectKey()).toBeNull();
    expect(loadDraftMeta()).toBeNull();
  });

  it("saveDraft persists once the survey has progressed, under the pending slot (no working copy yet)", () => {
    const store = useSurveySessionStore.getState();
    store.advance("choose_base");
    store.setIdentityResult(makeIdentity("Hausa"));

    saveDraft();

    expect(getActiveProjectKey()).toBe(PENDING_PROJECT_KEY);
    expect(localStorage.getItem(projectKeyStorageKey(PENDING_PROJECT_KEY))).not.toBeNull();

    const meta = loadDraftMeta();
    expect(meta).not.toBeNull();
    expect(meta!.activeStepId).toBe("choose_base");
    expect(meta!.label).toBe("Hausa");
  });

  it("saveDraft upserts a single index row for the active project across repeated saves", () => {
    const store = useSurveySessionStore.getState();
    store.advance("choose_base");
    saveDraft();
    store.advance("track");
    saveDraft();

    const entries = listDrafts();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.projectKey).toBe(PENDING_PROJECT_KEY);
    expect(entries[0]!.activeStepId).toBe("track");
  });

  it("applyDraft restores every survey slot", () => {
    const store = useSurveySessionStore.getState();
    store.advance("choose_base");
    store.advance("track");
    store.setSelectedTrack("copy");
    store.setScaffoldSpec({ keyboardId: "haus_latn", displayName: "Hausa" });
    store.setCharactersSubStage("B");
    saveDraft();

    // Wipe the store, then restore from the draft.
    useSurveySessionStore.getState().reset();
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");

    expect(applyDraft()).toBe(true);

    const s = useSurveySessionStore.getState();
    expect(s.activeStepId).toBe("track");
    expect(s.history).toEqual(["identity", "choose_base"]);
    expect(s.selectedTrack).toBe("copy");
    expect(s.scaffoldSpec).toEqual({ keyboardId: "haus_latn", displayName: "Hausa" });
    expect(s.charactersSubStage).toBe("B");
  });

  it("applyDraft restores the working copy when the draft includes one", () => {
    // Seed a minimal instantiated working copy so captureWorkingCopySnapshot fires.
    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      ir: makeMinimalIr(),
    });
    useSurveySessionStore.getState().advance("carve");
    saveDraft();

    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    expect(applyDraft()).toBe(true);
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");
    expect(useWorkingCopyStore.getState().ir).not.toBeNull();
    expect(useSurveySessionStore.getState().activeStepId).toBe("carve");
  });

  it("applyDraft returns false and does not hydrate the survey when a present working copy fails to apply", () => {
    // Survey store starts pristine (post-reset in beforeEach); capture it so we
    // can confirm applyDraft left it untouched.
    const preCall = useSurveySessionStore.getState();
    const preActiveStepId = preCall.activeStepId;
    const preHistory = [...preCall.history];

    // Write a draft directly under the active project's key (bypassing saveDraft,
    // which never stores a workingCopy with a null instantiationMode) with a
    // workingCopy whose instantiationMode is null — the exact condition under
    // which applyWorkingCopySnapshot (persistWorkingCopy.ts) returns false.
    setActiveProject(PENDING_PROJECT_KEY);
    localStorage.setItem(
      projectKeyStorageKey(PENDING_PROJECT_KEY),
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        survey: { activeStepId: "carve", history: ["identity", "choose_base"], identityResult: null },
        workingCopy: { instantiationMode: null },
      }),
    );

    expect(applyDraft()).toBe(false);

    // Survey store was NOT hydrated — still at its pre-call state.
    const post = useSurveySessionStore.getState();
    expect(post.activeStepId).toBe(preActiveStepId);
    expect(post.history).toEqual(preHistory);
  });

  it("loadDraftMeta discards a draft older than the 7-day TTL and removes its project", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    setActiveProject(PENDING_PROJECT_KEY);
    localStorage.setItem(
      projectKeyStorageKey(PENDING_PROJECT_KEY),
      JSON.stringify({
        version: 1,
        savedAt: eightDaysAgo,
        survey: { activeStepId: "carve", history: [], identityResult: null },
        workingCopy: null,
      }),
    );

    expect(loadDraftMeta()).toBeNull();
    // Expired draft is cleared, not left to rot.
    expect(localStorage.getItem(projectKeyStorageKey(PENDING_PROJECT_KEY))).toBeNull();
    expect(getActiveProjectKey()).toBeNull();
  });

  it("loadDraftMeta recovers from malformed JSON without throwing", () => {
    setActiveProject(PENDING_PROJECT_KEY);
    localStorage.setItem(projectKeyStorageKey(PENDING_PROJECT_KEY), "NOT_VALID_JSON{{{");
    let meta: ReturnType<typeof loadDraftMeta>;
    expect(() => {
      meta = loadDraftMeta();
    }).not.toThrow();
    expect(meta!).toBeNull();
    expect(localStorage.getItem(projectKeyStorageKey(PENDING_PROJECT_KEY))).toBeNull();
  });

  it("loadDraftMeta discards a draft written at an incompatible version", () => {
    setActiveProject(PENDING_PROJECT_KEY);
    localStorage.setItem(
      projectKeyStorageKey(PENDING_PROJECT_KEY),
      JSON.stringify({
        version: 999,
        savedAt: Date.now(),
        survey: { activeStepId: "carve", history: [], identityResult: null },
        workingCopy: null,
      }),
    );
    expect(loadDraftMeta()).toBeNull();
    expect(localStorage.getItem(projectKeyStorageKey(PENDING_PROJECT_KEY))).toBeNull();
  });

  it("startDraftAutosave collapses a burst of edits into a single debounced write", () => {
    vi.useFakeTimers();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const draftWrites = () =>
      setItemSpy.mock.calls.filter(([key]) => key === projectKeyStorageKey(PENDING_PROJECT_KEY)).length;

    const stop = startDraftAutosave();

    // A burst of edits within one debounce window.
    const store = useSurveySessionStore.getState();
    store.advance("choose_base");
    store.advance("track");
    store.setSelectedTrack("copy");

    // Still inside the debounce window — nothing written yet.
    expect(draftWrites()).toBe(0);

    vi.advanceTimersByTime(1000);

    // Exactly one write for the whole burst.
    expect(draftWrites()).toBe(1);
    expect(loadDraftMeta()).not.toBeNull();

    // A later edit debounces into a second, separate write.
    store.advance("project_name");
    vi.advanceTimersByTime(1000);
    expect(draftWrites()).toBe(2);

    stop();
    setItemSpy.mockRestore();
  });

  it("clearDraft removes the active project's record + index row and clears the pointer", () => {
    useSurveySessionStore.getState().advance("choose_base");
    saveDraft();
    expect(getActiveProjectKey()).toBe(PENDING_PROJECT_KEY);
    expect(localStorage.getItem(projectKeyStorageKey(PENDING_PROJECT_KEY))).not.toBeNull();

    clearDraft();

    expect(localStorage.getItem(projectKeyStorageKey(PENDING_PROJECT_KEY))).toBeNull();
    expect(getActiveProjectKey()).toBeNull();
    expect(listDrafts()).toEqual([]);
    expect(applyDraft()).toBe(false);
  });

  it("clearDraft is a no-op when there is no active project", () => {
    expect(() => clearDraft()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Legacy-key migration
// ---------------------------------------------------------------------------

describe("migrateLegacyDraft()", () => {
  it("adopts a legacy draft with an instantiated working copy under its derived projectKey", () => {
    const legacy = makeLegacyDraft({
      activeStepId: "carve",
      workingCopy: { identity: { keyboardId: "haus_latn" }, baseKeyboard: null } as Partial<WorkingCopySnapshot>,
    });
    localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));

    migrateLegacyDraft();

    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
    expect(getActiveProjectKey()).toBe("haus_latn");
    expect(localStorage.getItem(projectKeyStorageKey("haus_latn"))).not.toBeNull();

    const entries = listDrafts();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.projectKey).toBe("haus_latn");
    expect(entries[0]!.activeStepId).toBe("carve");
  });

  it("adopts a survey-only legacy draft (no working copy) under the pending slot", () => {
    const legacy = makeLegacyDraft({ activeStepId: "choose_base", workingCopy: null });
    localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));

    migrateLegacyDraft();

    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
    expect(getActiveProjectKey()).toBe(PENDING_PROJECT_KEY);
    expect(listDrafts()).toHaveLength(1);
    expect(listDrafts()[0]!.projectKey).toBe(PENDING_PROJECT_KEY);
  });

  it("initializes an empty index and does not set an active project when no legacy draft exists", () => {
    migrateLegacyDraft();

    expect(localStorage.getItem(PROJECT_INDEX_KEY)).not.toBeNull();
    expect(listDrafts()).toEqual([]);
    expect(getActiveProjectKey()).toBeNull();
  });

  it("does not adopt an expired (> 7-day TTL) legacy draft", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const legacy = makeLegacyDraft({ savedAt: eightDaysAgo, workingCopy: null });
    localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));

    migrateLegacyDraft();

    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
    expect(listDrafts()).toEqual([]);
    expect(getActiveProjectKey()).toBeNull();
  });

  it("does not adopt a malformed legacy draft", () => {
    localStorage.setItem(LEGACY_DRAFT_KEY, "NOT_VALID_JSON{{{");

    expect(() => migrateLegacyDraft()).not.toThrow();

    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
    expect(listDrafts()).toEqual([]);
  });

  it("is idempotent — a second call is a no-op once the project index exists", () => {
    const legacy = makeLegacyDraft({ workingCopy: null });
    localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));
    migrateLegacyDraft();
    expect(listDrafts()).toHaveLength(1);

    // Simulate a second page load with a NEW legacy draft present (should never
    // happen in practice since migration already deleted the key, but proves
    // the guard is "index already exists", not merely "legacy key is gone").
    localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(makeLegacyDraft({ workingCopy: null })));
    migrateLegacyDraft();

    // Still exactly one entry — the second legacy draft was NOT adopted, and
    // does not clobber the already-migrated project.
    expect(listDrafts()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// "My keyboards" — listDrafts / resumeProject / deleteProject / submission
// ---------------------------------------------------------------------------

describe("listDrafts()", () => {
  it("returns every project, newest-saved first", () => {
    setActiveProject("project_a");
    localStorage.setItem(
      projectKeyStorageKey("project_a"),
      JSON.stringify(makeLegacyDraft({ savedAt: 1000, workingCopy: null })),
    );
    localStorage.setItem(
      PROJECT_INDEX_KEY,
      JSON.stringify([
        { projectKey: "project_a", savedAt: 1000, activeStepId: "carve", label: "A", langTag: null, status: "draft", prUrl: null },
        { projectKey: "project_b", savedAt: 3000, activeStepId: "carve", label: "B", langTag: null, status: "draft", prUrl: null },
        { projectKey: "project_c", savedAt: 2000, activeStepId: "carve", label: "C", langTag: null, status: "draft", prUrl: null },
      ]),
    );

    const keys = listDrafts().map((e) => e.projectKey);
    expect(keys).toEqual(["project_b", "project_c", "project_a"]);
  });
});

describe("resumeProject()", () => {
  function seedProject(projectKey: string, activeStepId: string) {
    const draft = makeLegacyDraft({ activeStepId, workingCopy: null });
    localStorage.setItem(projectKeyStorageKey(projectKey), JSON.stringify(draft));
    const entries = JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY) ?? "[]") as unknown[];
    entries.push({ projectKey, savedAt: draft.savedAt, activeStepId, label: null, langTag: null, status: "draft", prUrl: null });
    localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(entries));
  }

  it("resumes project B, hydrating its own state, and leaves project A's record untouched", () => {
    seedProject("project_a", "carve");
    seedProject("project_b", "touch");
    setActiveProject("project_a");

    const beforeA = localStorage.getItem(projectKeyStorageKey("project_a"));

    expect(resumeProject("project_b")).toBe(true);

    expect(getActiveProjectKey()).toBe("project_b");
    expect(useSurveySessionStore.getState().activeStepId).toBe("touch");
    // Project A's stored record is byte-for-byte unchanged.
    expect(localStorage.getItem(projectKeyStorageKey("project_a"))).toBe(beforeA);
  });

  it("returns false and does not change the active project when the project is absent", () => {
    setActiveProject("project_a");
    expect(resumeProject("does_not_exist")).toBe(false);
    expect(getActiveProjectKey()).toBe("project_a");
  });

  it("returns false and does not switch the active project when the working copy fails to apply", () => {
    setActiveProject("project_a");
    localStorage.setItem(
      projectKeyStorageKey("project_broken"),
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        survey: { activeStepId: "carve", history: [], identityResult: null },
        workingCopy: { instantiationMode: null },
      }),
    );

    expect(resumeProject("project_broken")).toBe(false);
    expect(getActiveProjectKey()).toBe("project_a");
  });
});

describe("deleteProject()", () => {
  it("removes the project's record + index entry locally (guest, no token)", async () => {
    setActiveProject("project_a");
    localStorage.setItem(
      projectKeyStorageKey("project_a"),
      JSON.stringify(makeLegacyDraft({ workingCopy: null })),
    );
    localStorage.setItem(
      PROJECT_INDEX_KEY,
      JSON.stringify([{ projectKey: "project_a", savedAt: Date.now(), activeStepId: "carve", label: null, langTag: null, status: "draft", prUrl: null }]),
    );

    await deleteProject("project_a", null);

    expect(localStorage.getItem(projectKeyStorageKey("project_a"))).toBeNull();
    expect(listDrafts()).toEqual([]);
    expect(getActiveProjectKey()).toBeNull();
  });

  it("issues a DELETE with the projectKey as draftId when signed in", async () => {
    localStorage.setItem(
      PROJECT_INDEX_KEY,
      JSON.stringify([{ projectKey: "project_a", savedAt: Date.now(), activeStepId: "carve", label: null, langTag: null, status: "draft", prUrl: null }]),
    );
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedMethod = init.method;
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }),
    );

    await deleteProject("project_a", "gho_test");

    expect(capturedMethod).toBe("DELETE");
    expect(capturedUrl).toMatch(/draftId=project_a/);
    vi.unstubAllGlobals();
  });

  it("does not leave the project record around even when the server call fails", async () => {
    localStorage.setItem(
      projectKeyStorageKey("project_a"),
      JSON.stringify(makeLegacyDraft({ workingCopy: null })),
    );
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    await expect(deleteProject("project_a", "gho_test")).resolves.toBeUndefined();
    expect(localStorage.getItem(projectKeyStorageKey("project_a"))).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("recordProjectSubmission()", () => {
  it("transitions the active project to submitted + prUrl, keeps its record, and clears the active pointer", async () => {
    useSurveySessionStore.getState().advance("choose_base");
    saveDraft();
    const projectKey = getActiveProjectKey();
    expect(projectKey).not.toBeNull();

    await recordProjectSubmission("https://github.com/keymanapp/keyboards/pull/1", null);

    expect(getActiveProjectKey()).toBeNull();
    const entries = listDrafts();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe("submitted");
    expect(entries[0]!.prUrl).toBe("https://github.com/keymanapp/keyboards/pull/1");
    // The project's full draft record is still present (not deleted).
    expect(localStorage.getItem(projectKeyStorageKey(projectKey!))).not.toBeNull();
  });

  it("PUTs the submitted status/prUrl to the server when signed in", async () => {
    useSurveySessionStore.getState().advance("choose_base");
    saveDraft();

    let capturedBody: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return Promise.resolve(new Response(JSON.stringify({ savedAt: Date.now() }), { status: 200 }));
      }),
    );

    await recordProjectSubmission("https://github.com/keymanapp/keyboards/pull/1", "gho_test");

    const body = JSON.parse(capturedBody ?? "{}") as { meta: { status: string; prUrl: string } };
    expect(body.meta.status).toBe("submitted");
    expect(body.meta.prUrl).toBe("https://github.com/keymanapp/keyboards/pull/1");
    vi.unstubAllGlobals();
  });

  it("is a no-op when there is no active project", async () => {
    await expect(recordProjectSubmission("https://x", null)).resolves.toBeUndefined();
    expect(listDrafts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FINDING 1 — post-submit reactivation guard. A submitted project must be
// FROZEN: saveDraft() (and the cloud-sync flush, same guard) must neither
// overwrite its stored record nor silently re-pin the active-project pointer
// back onto it when the author keeps editing in the same tab.
// ---------------------------------------------------------------------------

describe("saveDraft() freezes a submitted project against post-submit reactivation", () => {
  it("does not overwrite project X's stored draft/index, and does not re-pin the active pointer to X, on a subsequent write", async () => {
    // Instantiate a real (non-pending) working copy so a genuine projectKey
    // derives, mirroring a real Track 1/2 session rather than the pending slot.
    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseKeyboard: { id: "haus_latn" } as never,
      ir: makeMinimalIr(),
    });
    useSurveySessionStore.getState().advance("carve");
    saveDraft();

    const projectKey = getActiveProjectKey();
    expect(projectKey).not.toBeNull();
    expect(projectKey).toBe("haus_latn");

    await recordProjectSubmission("https://github.com/keymanapp/keyboards/pull/9", null);

    // Submit clears the active pointer per recordProjectSubmission's contract.
    expect(getActiveProjectKey()).toBeNull();

    const draftBefore = localStorage.getItem(projectKeyStorageKey(projectKey!));
    const indexBefore = listDrafts().find((e) => e.projectKey === projectKey);
    expect(indexBefore?.status).toBe("submitted");
    expect(indexBefore?.prUrl).toBe("https://github.com/keymanapp/keyboards/pull/9");

    // Simulate the author continuing to edit in the SAME tab: the working
    // copy / survey stores are unchanged (still derive the SAME projectKey),
    // and the active pointer is null (post-submit) — exactly the
    // `stored === null` branch that, pre-fix, would silently re-derive and
    // re-pin the same (now-submitted) projectKey on the next debounced write.
    useSurveySessionStore.getState().advance("touch");
    saveDraft();

    // (a) X's stored StudioDraft snapshot + index entry are unchanged.
    expect(localStorage.getItem(projectKeyStorageKey(projectKey!))).toBe(draftBefore);
    const indexAfter = listDrafts().find((e) => e.projectKey === projectKey);
    expect(indexAfter).toEqual(indexBefore);

    // (b) The active pointer was NOT silently re-pinned back to X.
    expect(getActiveProjectKey()).not.toBe(projectKey);
    expect(getActiveProjectKey()).toBeNull();
  });

  it("still autosaves normally for a fresh, different keyboard started after a submit", async () => {
    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseKeyboard: { id: "haus_latn" } as never,
      ir: makeMinimalIr(),
    });
    useSurveySessionStore.getState().advance("carve");
    saveDraft();
    const submittedKey = getActiveProjectKey()!;
    await recordProjectSubmission("https://github.com/keymanapp/keyboards/pull/9", null);
    expect(getActiveProjectKey()).toBeNull();

    // Start over with a genuinely different base/project.
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();
    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseKeyboard: { id: "fulani_latn" } as never,
      ir: makeMinimalIr(),
    });
    useSurveySessionStore.getState().advance("carve");
    saveDraft();

    // The new project is a real, distinct, non-frozen key that saved normally.
    const newKey = getActiveProjectKey();
    expect(newKey).toBe("fulani_latn");
    expect(newKey).not.toBe(submittedKey);
    expect(localStorage.getItem(projectKeyStorageKey(newKey!))).not.toBeNull();
    const entries = listDrafts();
    expect(entries.find((e) => e.projectKey === newKey)?.status).toBe("draft");
    // The submitted project is still present, untouched, and still submitted.
    expect(entries.find((e) => e.projectKey === submittedKey)?.status).toBe("submitted");
  });
});

// ---------------------------------------------------------------------------
// Helper — minimal KeyboardIR-like object (mirrors persistWorkingCopy.test.ts)
// ---------------------------------------------------------------------------

function makeMinimalIr() {
  return {
    origin: "scaffolded" as const,
    header: {
      keyboardId: "test",
      name: "test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

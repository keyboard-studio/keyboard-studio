// draftPersistence tests (cloud group) — split from draftPersistence.test.ts by behaviour.
// See draftPersistence.core.test.ts for the original coverage overview and the
// wasDraftRestoredThisBoot test-order note (that first-boot assertion lives there).

import { describe, it, expect, vi } from "vitest";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { instantiateMinimal } from "../test/draftSeeds.ts";
import { draftKey, saveDraft, resolveActiveProjectKey, setActiveProjectKey, listDrafts, recordProjectSubmission, startCloudSync, CLOUD_SYNC_DEBOUNCE_MS, MAX_CLOUD_DRAFT_BYTES, PENDING_PROJECT_KEY, type DurableDraft } from "./draftPersistence.ts";
import { mockedSaveServerDraft, mockedSaveServerDraftBeacon, installDraftPersistenceHooks } from "./draftPersistence.testkit.ts";

// serverDraftStore's fetch-based transport is mocked at the module boundary
// (P1-2) so startCloudSync/recordProjectSubmission tests never touch the
// network — the whole module is replaced since every function it exports is a
// real HTTP call. vi.mock hoists per file, so each split file repeats it.
vi.mock("./serverDraftStore.ts", () => ({
  saveServerDraft: vi.fn(async () => true),
  saveServerDraftBeacon: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

installDraftPersistenceHooks();

describe("draftPersistence", () => {
  // ---------------------------------------------------------------------------
  // startCloudSync (P1-2) — the signed-in cloud-draft backup. serverDraftStore
  // is mocked at the top of this file; every test here asserts on
  // mockedSaveServerDraft/mockedSaveServerDraftBeacon, never real fetch.
  // ---------------------------------------------------------------------------
  describe("startCloudSync (P1-2): signed-in cloud-draft backup", () => {
    it("pushes immediately at install time (mirrors installDraftAutosave's P1 fix), then debounces subsequent pushes by CLOUD_SYNC_DEBOUNCE_MS", () => {
      vi.useFakeTimers();
      const pk = "cloud-debounce";
      instantiateMinimal(pk);
      saveDraft(pk);

      const teardown = startCloudSync(() => "token-abc");
      // Install-time immediate flush — isolate it from the debounced push below.
      expect(mockedSaveServerDraft).toHaveBeenCalledTimes(1);
      mockedSaveServerDraft.mockClear();

      useWorkingCopyStore.getState().lockDesktop(); // schedules the next push
      saveDraft(pk); // reflects the mutation into the record startCloudSync re-reads

      vi.advanceTimersByTime(CLOUD_SYNC_DEBOUNCE_MS - 1);
      expect(mockedSaveServerDraft).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockedSaveServerDraft).toHaveBeenCalledTimes(1);

      teardown();
    });

    it("content-hash dedupe: does not re-push when the draft is unchanged since the last successful push", async () => {
      vi.useFakeTimers();
      const pk = "cloud-dedupe";
      instantiateMinimal(pk);
      saveDraft(pk);

      const teardown = startCloudSync(() => "token-abc");
      expect(mockedSaveServerDraft).toHaveBeenCalledTimes(1); // install-time push
      // Flush the resolved promise so lastPushedHash is recorded before the
      // next flush runs — saveServerDraft is mocked async, so the `.then`
      // that records the hash is a pending microtask until awaited.
      await vi.advanceTimersByTimeAsync(0);
      mockedSaveServerDraft.mockClear();

      // A mutation cycle that nets back to the SAME working-copy state (and,
      // under fake timers, the SAME frozen Date.now() for `savedAt`) — the
      // re-saved record is byte-identical, so its content hash is unchanged.
      useWorkingCopyStore.getState().lockDesktop();
      useWorkingCopyStore.getState().unlockDesktop();
      saveDraft(pk);

      vi.advanceTimersByTime(CLOUD_SYNC_DEBOUNCE_MS);
      expect(mockedSaveServerDraft).not.toHaveBeenCalled();

      teardown();
    });

    it("skips the push (stays local-only, no saveServerDraft call) when the draft exceeds MAX_CLOUD_DRAFT_BYTES", () => {
      const pk = "cloud-oversized";
      instantiateMinimal(pk);
      saveDraft(pk);

      // Inflate the stored record past the ceiling directly — cheaper and
      // more deterministic than authoring a working copy that's genuinely
      // multiple megabytes.
      const big = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft & {
        padding?: string;
      };
      big.padding = "x".repeat(MAX_CLOUD_DRAFT_BYTES + 1);
      localStorage.setItem(draftKey(pk), JSON.stringify(big));

      // The install-time immediate flush (inside startCloudSync itself) is
      // the one under test here — the oversized check runs before any timer.
      const teardown = startCloudSync(() => "token-abc");
      expect(mockedSaveServerDraft).not.toHaveBeenCalled();

      teardown();
    });

    it("flushes via saveServerDraftBeacon (fetch keepalive), not the regular saveServerDraft, on 'beforeunload'", () => {
      const pk = "cloud-unload";
      instantiateMinimal(pk);
      saveDraft(pk);

      const teardown = startCloudSync(() => "token-abc");
      mockedSaveServerDraft.mockClear(); // isolate from the install-time push

      // A genuinely different record so this flush isn't itself deduped
      // against whatever the install-time push last saw.
      useWorkingCopyStore.getState().lockDesktop();
      saveDraft(pk);

      window.dispatchEvent(new Event("beforeunload"));

      expect(mockedSaveServerDraftBeacon).toHaveBeenCalledTimes(1);
      expect(mockedSaveServerDraft).not.toHaveBeenCalled();

      teardown();
    });

    it("flushes via the regular saveServerDraft (not the beacon) when the tab becomes hidden ('visibilitychange')", () => {
      const pk = "cloud-hidden";
      instantiateMinimal(pk);
      saveDraft(pk);

      const teardown = startCloudSync(() => "token-abc");
      mockedSaveServerDraft.mockClear();

      useWorkingCopyStore.getState().lockDesktop();
      saveDraft(pk);

      const visibilitySpy = vi
        .spyOn(document, "visibilityState", "get")
        .mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));

      expect(mockedSaveServerDraft).toHaveBeenCalledTimes(1);
      expect(mockedSaveServerDraftBeacon).not.toHaveBeenCalled();

      visibilitySpy.mockRestore();
      teardown();
    });

    it("a 'visibilitychange' event while the tab is still visible does not flush", () => {
      const pk = "cloud-visible";
      instantiateMinimal(pk);
      saveDraft(pk);

      const teardown = startCloudSync(() => "token-abc");
      mockedSaveServerDraft.mockClear();

      // document.visibilityState defaults to "visible" in jsdom — no stub needed.
      document.dispatchEvent(new Event("visibilitychange"));
      expect(mockedSaveServerDraft).not.toHaveBeenCalled();

      teardown();
    });

    it("never pushes when getToken() returns null (guest/signed-out posture)", () => {
      vi.useFakeTimers();
      const pk = "cloud-guest";
      instantiateMinimal(pk);
      saveDraft(pk);

      const teardown = startCloudSync(() => null);
      expect(mockedSaveServerDraft).not.toHaveBeenCalled(); // no install-time push either

      useWorkingCopyStore.getState().lockDesktop();
      vi.advanceTimersByTime(CLOUD_SYNC_DEBOUNCE_MS);
      expect(mockedSaveServerDraft).not.toHaveBeenCalled();

      teardown();
    });

    it("frozen-project veto: never pushes a project whose index row is already status:'submitted', even when re-pinned active", async () => {
      vi.useFakeTimers();
      const pk = "cloud-frozen";
      instantiateMinimal(pk);
      saveDraft(pk);

      await recordProjectSubmission("https://github.com/x/y/pull/1", null);
      // Re-point the active pointer back at the now-frozen project — the
      // exact same-tab continued-editing race the frozen guard exists to close.
      setActiveProjectKey(pk);
      mockedSaveServerDraft.mockClear();

      const teardown = startCloudSync(() => "token-abc");
      expect(mockedSaveServerDraft).not.toHaveBeenCalled(); // install-time flush vetoed too

      useWorkingCopyStore.getState().lockDesktop();
      vi.advanceTimersByTime(CLOUD_SYNC_DEBOUNCE_MS);
      expect(mockedSaveServerDraft).not.toHaveBeenCalled();

      teardown();
    });

    // Pending-slot veto (review finding 1): the reserved pending slot is the
    // local-only holding pen for pre-instantiation progress. It is excluded
    // from the local "My keyboards" index, and must be excluded from the cloud
    // push for the same reason — a pushed pending record comes back through
    // listServerDrafts() and merges into the list as a phantom "Untitled
    // keyboard" card. Only promotion to a real project key makes a draft
    // cloud-eligible.
    it("pending-slot veto: never pushes the PENDING_PROJECT_KEY record, even for a signed-in author with meaningful pre-instantiation progress", () => {
      vi.useFakeTimers();
      useSurveySessionStore.getState().advance("choose_base");
      useSurveySessionStore.setState({
        identityResult: { english: "Test", autonym: "Test", bcp47: "und", prefill: { script: "Latn" } } as never,
      });
      saveDraft(PENDING_PROJECT_KEY);
      // The local record exists and the active pointer is pinned to it — the
      // exact state F6's mount-time autosave install produces.
      expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();
      expect(resolveActiveProjectKey()).toBe(PENDING_PROJECT_KEY);

      const teardown = startCloudSync(() => "token-abc");
      expect(mockedSaveServerDraft).not.toHaveBeenCalled(); // install-time flush vetoed

      useSurveySessionStore.getState().advance("choose_base");
      saveDraft(PENDING_PROJECT_KEY);
      vi.advanceTimersByTime(CLOUD_SYNC_DEBOUNCE_MS);
      expect(mockedSaveServerDraft).not.toHaveBeenCalled();

      // Neither checkpoint flush leaks it either.
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("beforeunload"));
      expect(mockedSaveServerDraft).not.toHaveBeenCalled();
      expect(mockedSaveServerDraftBeacon).not.toHaveBeenCalled();

      teardown();
    });

    it("teardown unsubscribes both listeners and cancels the pending timer — no push fires afterward", () => {
      vi.useFakeTimers();
      const pk = "cloud-teardown";
      instantiateMinimal(pk);
      saveDraft(pk);

      const teardown = startCloudSync(() => "token-abc");
      mockedSaveServerDraft.mockClear();

      useWorkingCopyStore.getState().lockDesktop();
      saveDraft(pk);
      teardown(); // must clear the pending debounce timer

      vi.advanceTimersByTime(CLOUD_SYNC_DEBOUNCE_MS * 2);
      window.dispatchEvent(new Event("beforeunload"));
      document.dispatchEvent(new Event("visibilitychange"));

      expect(mockedSaveServerDraft).not.toHaveBeenCalled();
      expect(mockedSaveServerDraftBeacon).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // recordProjectSubmission + the frozen/"submitted" guard (P1-3) — direct
  // assertions rather than the indirect coverage MyKeyboardsList.test.tsx's
  // mocked deleteProject/resumeProject wrappers give this module.
  // ---------------------------------------------------------------------------
  describe("recordProjectSubmission + frozen-project veto (P1-3)", () => {
    it("transitions the active project's index row to status:'submitted' with the given prUrl, and clears the active pointer", async () => {
      const pk = "submit-index";
      instantiateMinimal(pk);
      saveDraft(pk); // creates the record + a "draft" index row, pins pk active

      const before = listDrafts().find((e) => e.projectKey === pk);
      expect(before?.status).toBe("draft");
      expect(before?.prUrl).toBeNull();

      await recordProjectSubmission("https://github.com/keymanapp/keyboards/pull/123", null);

      const after = listDrafts().find((e) => e.projectKey === pk);
      expect(after?.status).toBe("submitted");
      expect(after?.prUrl).toBe("https://github.com/keymanapp/keyboards/pull/123");
      // The survey session that just submitted is over.
      expect(resolveActiveProjectKey()).toBeNull();
    });

    it("pushes the submitted status/prUrl to the server when a token is provided", async () => {
      const pk = "submit-server";
      instantiateMinimal(pk);
      saveDraft(pk);
      mockedSaveServerDraft.mockClear();

      await recordProjectSubmission("https://github.com/x/y/pull/9", "gho_test");

      expect(mockedSaveServerDraft).toHaveBeenCalledTimes(1);
      const [token, meta, , draftId] = mockedSaveServerDraft.mock.calls[0]!;
      expect(token).toBe("gho_test");
      expect(draftId).toBe(pk);
      expect(meta).toMatchObject({
        status: "submitted",
        prUrl: "https://github.com/x/y/pull/9",
        draftId: pk,
      });
    });

    it("does NOT push to the server when no token is provided (guest posture)", async () => {
      const pk = "submit-guest";
      instantiateMinimal(pk);
      saveDraft(pk);
      mockedSaveServerDraft.mockClear();

      await recordProjectSubmission("https://github.com/x/y/pull/1", null);

      expect(mockedSaveServerDraft).not.toHaveBeenCalled();
    });

    it("saveDraft() REFUSES to write a submitted project — the record and its index row are unchanged by a subsequent local mutation", async () => {
      const pk = "frozen-save";
      instantiateMinimal(pk);
      saveDraft(pk);
      const recordBefore = localStorage.getItem(draftKey(pk));

      await recordProjectSubmission("https://github.com/x/y/pull/5", null);
      const indexAfterSubmit = listDrafts().find((e) => e.projectKey === pk);
      expect(indexAfterSubmit?.status).toBe("submitted");

      // An author who keeps editing in the same tab after submit (the exact
      // scenario the frozen guard exists to close) mutates the working copy
      // and calls saveDraft directly under the now-submitted key.
      useWorkingCopyStore.getState().lockDesktop();
      saveDraft(pk);

      // The per-project record is untouched — still the pre-submit snapshot.
      expect(localStorage.getItem(draftKey(pk))).toBe(recordBefore);
      // The index row is untouched too — still submitted, not silently
      // reverted to "draft" or re-stamped with a new savedAt.
      const indexAfterAttemptedSave = listDrafts().find((e) => e.projectKey === pk);
      expect(indexAfterAttemptedSave).toEqual(indexAfterSubmit);
      // The frozen write must not re-pin the active pointer back onto the
      // submitted project either — saveDraft's veto is a full no-op.
      expect(resolveActiveProjectKey()).toBeNull();
    });
  });});

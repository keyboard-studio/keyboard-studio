// Confirmed P0: `reconcileRenamedProjectRows` must never lose a project's
// `status: "submitted"` / `prUrl` when it merges a duplicate-row pair away.
//
// `status` and `prUrl` live ONLY on the "My keyboards" INDEX ROW
// (draftTypes.ts's `ProjectIndexEntry` — never on the `DurableDraft` envelope
// itself), so whichever row the merge decides to delete takes its submission
// state with it unless the merge explicitly carries it forward first.
//
// `reconcileRenamedProjectRows` (draftPersistence.ts) has TWO branches that
// each decide what the surviving row's status ends up as:
//   - "stale is newer" (relocate branch): calls
//     `existingStatusOverrides(survivorKey)` — the SURVIVOR's OWN prior
//     status, never the stale row's.
//   - "survivor already newer" (the common branch): calls bare
//     `clearDraft(stale.projectKey)` with no status/prUrl carry-over at all.
//
// Neither branch ever asks "does the row I'm about to DELETE hold
// `submitted`/`prUrl` that the survivor does not?" — so the scenario the bug
// report names (an author submitted under the original base-id filing, then
// kept editing under a renamed key) loses the submission record entirely:
// the merge keeps the newer CONTENT but discards the older row's SUBMITTED
// status/prUrl, and a submitted project silently becomes "draft" again —
// re-opening `saveDraft`'s frozen-project guard (`isProjectFrozen`) on a
// project the author already has an open PR for.
//
// Both cases below seed the STALE row (the one the merge is about to delete)
// as the one carrying `submitted` + a `prUrl`, and the SURVIVOR as a plain,
// never-submitted `draft` row — the exact shape described in the bug report.
// If either assertion is red, name it precisely: which field silently
// downgraded, and under which of the two merge branches.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { BaseKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";

vi.mock("./serverDraftStore.ts", () => ({
  saveServerDraft: vi.fn(async () => true),
  saveServerDraftBeacon: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

import {
  draftKey,
  saveDraft,
  listDrafts,
  reconcileRenamedProjectRows,
  recordProjectSubmission,
  resolveActiveProjectKey,
  DRAFT_INDEX_KEY,
} from "./draftPersistence.ts";

/**
 * Read the "My keyboards" index RAW, bypassing `listDrafts()` — `listDrafts()`
 * calls `reconcileRenamedProjectRows()` itself, so using it for a "before the
 * merge" sanity check would silently run the very merge under test and merge
 * the fixture away before the explicit call below ever gets to run (the same
 * pitfall draftPersistence.reconcileRenamedProjectRows.test.ts's own comments
 * warn about).
 */
function readRawIndexEntries(): Array<{
  projectKey: string;
  status: "draft" | "submitted";
  prUrl: string | null;
}> {
  return JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY) ?? "[]") as Array<{
    projectKey: string;
    status: "draft" | "submitted";
    prUrl: string | null;
  }>;
}

function makeMinimalIr(): KeyboardIR {
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
  } as unknown as KeyboardIR;
}

function instantiateMinimal(baseId: string, displayName = "Status Preservation Test"): void {
  const base = { id: baseId, displayName, languages: [] } as unknown as BaseKeyboard;
  useWorkingCopyStore
    .getState()
    .instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });
}

beforeEach(() => {
  localStorage.clear();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("reconcileRenamedProjectRows — must never lose status:'submitted'/prUrl (confirmed P0)", () => {
  it("preserves 'submitted' + prUrl when the STALE row is the submitted one and the SURVIVOR is already newer (common branch)", () => {
    const baseId = "kbd_status_base_1";
    const customId = "kbd_status_renamed_1";
    const prUrl = "https://github.com/example/keyboards/pull/101";

    // Stale row: written under baseId, then submitted (author filed the PR
    // while the record was still under baseId — the plausible real-world
    // order the bug report names).
    instantiateMinimal(baseId);
    saveDraft(baseId);
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });
    saveDraft(baseId); // re-save under the SAME (stale) key — content now says customId
    expect(resolveActiveProjectKey()).toBe(baseId);
    void recordProjectSubmission(prUrl, null); // marks baseId's row submitted + prUrl

    // Survivor row: self-consistent, filed exactly where its own content
    // says, written AFTER the submission above — so it is the newer row and
    // the "survivor already newer" branch (bare clearDraft, no status
    // carry-over) is the one that fires.
    saveDraft(customId);

    const beforeMerge = readRawIndexEntries();
    const staleRow = beforeMerge.find((e) => e.projectKey === baseId);
    expect(staleRow?.status).toBe("submitted");
    expect(staleRow?.prUrl).toBe(prUrl);

    const merged = reconcileRenamedProjectRows();
    expect(merged).toBe(1);

    const after = listDrafts();
    expect(after).toHaveLength(1);
    const survivor = after[0];
    expect(survivor?.projectKey).toBe(customId);

    // THE ASSERTION THAT MATTERS: the submission record must have followed
    // the project to its surviving row, not vanished with the deleted one.
    expect(survivor?.status).toBe("submitted");
    expect(survivor?.prUrl).toBe(prUrl);

    // A submitted project must not become silently editable as a side
    // effect of the merge: saveDraft's frozen-project guard must still
    // refuse to overwrite it.
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId, displayName: "should not stick" });
    saveDraft(customId);
    const afterAttemptedEdit = listDrafts().find((e) => e.projectKey === customId);
    expect(afterAttemptedEdit?.status).toBe("submitted");
    const rawRecord = JSON.parse(localStorage.getItem(draftKey(customId))!) as { displayName: string | null };
    expect(rawRecord.displayName).not.toBe("should not stick");
  });

  it("preserves 'submitted' + prUrl when the STALE row is the submitted one and holds the NEWER savedAt (relocate branch)", () => {
    const baseId = "kbd_status_base_2";
    const customId = "kbd_status_renamed_2";
    const prUrl = "https://github.com/example/keyboards/pull/202";

    instantiateMinimal(baseId);
    // Identity set BEFORE either save, so both rows' stored CONTENT derives
    // to the same key (customId) — only their FILED key differs, mirroring
    // the real defect shape (one project, two filings) exactly like
    // draftPersistence.reconcileRenamedProjectRows.test.ts's own "carries the
    // newer content over" case.
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });

    let now = 2_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    saveDraft(customId); // survivor: self-consistent, written FIRST (older savedAt), never submitted
    now += 10_000;
    saveDraft(baseId); // stale: same content, filed at baseId, written SECOND (newer savedAt)

    nowSpy.mockRestore();

    expect(resolveActiveProjectKey()).toBe(baseId);
    void recordProjectSubmission(prUrl, null); // marks the STALE (baseId) row submitted + prUrl

    const beforeMerge = readRawIndexEntries();
    const staleRow = beforeMerge.find((e) => e.projectKey === baseId);
    expect(staleRow?.status).toBe("submitted");
    expect(staleRow?.prUrl).toBe(prUrl);

    const merged = reconcileRenamedProjectRows();
    expect(merged).toBe(1);

    const after = listDrafts();
    expect(after).toHaveLength(1);
    const survivor = after[0];
    expect(survivor?.projectKey).toBe(customId);

    // THE ASSERTION THAT MATTERS.
    expect(survivor?.status).toBe("submitted");
    expect(survivor?.prUrl).toBe(prUrl);
  });
});

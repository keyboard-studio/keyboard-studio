// Migration tests for `reconcileRenamedProjectRows` — the one-time,
// sibling-to-`reconcileProjectIndex` reconciliation pass that merges "My
// keyboards" index rows a browser already has duplicated from the pre-fix
// defect (see draftPersistence.resumeRename.test.ts /
// StudioShell.resumeRename.test.tsx for the defect itself, now closed at the
// source by `installDraftAutosave`'s own key-change migration).
//
// These tests seed BOTH rows via `saveDraft` directly — never
// `installDraftAutosave` — specifically so the fixture reproduces the
// PRE-FIX on-disk shape (a genuine duplicate pair already sitting in
// `ks.draftIndex.v1`) without the now-fixed `installDraftAutosave` migrating
// it away as it's created. `saveDraft` has no key-change migration of its
// own (only `installDraftAutosave` does), so it's the right primitive for
// "what a browser already has" fixtures.

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
  DRAFT_INDEX_KEY,
  PENDING_PROJECT_KEY,
  type DurableDraft,
} from "./draftPersistence.ts";

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

function instantiateMinimal(baseId: string, displayName = "Reconcile Test"): void {
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

describe("reconcileRenamedProjectRows — merges a pre-existing duplicate pair", () => {
  it("merges a stale base-id row into the self-consistent renamed-id row (survivor already newer — the typical shape)", () => {
    const baseId = "basic_kbdus";
    const customId = "my_renamed_project";

    // Stale row: content has moved on to customId, but is still filed at baseId.
    instantiateMinimal(baseId);
    saveDraft(baseId);
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });
    saveDraft(baseId); // re-save under the SAME (stale) key — mirrors the defect

    // Survivor row: self-consistent, filed exactly where its own content says.
    saveDraft(customId);

    // Sanity on the RAW records — not `listDrafts()`, which itself calls
    // `reconcileRenamedProjectRows()` and would merge this fixture away
    // before the explicit call below gets to run.
    expect(localStorage.getItem(draftKey(baseId))).not.toBeNull();
    expect(localStorage.getItem(draftKey(customId))).not.toBeNull();

    const merged = reconcileRenamedProjectRows();

    expect(merged).toBe(1);
    const entries = listDrafts();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.projectKey).toBe(customId);
    expect(localStorage.getItem(draftKey(baseId))).toBeNull();
    expect(localStorage.getItem(draftKey(customId))).not.toBeNull();
  });

  it("carries the newer content over to the survivor key when the STALE row happens to hold the newer savedAt", () => {
    const baseId = "basic_kbdus_2";
    const customId = "my_renamed_project_2";

    instantiateMinimal(baseId);
    // Identity is set BEFORE either save below, so both rows' stored content
    // derives to the SAME key (customId) — only their FILED key (the
    // `saveDraft` argument) differs, exactly mirroring the real defect shape
    // (one project, two filings) rather than accidentally seeding two
    // self-inconsistent-in-different-ways records.
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });

    let now = 1_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    saveDraft(customId); // survivor: self-consistent, written FIRST (older savedAt)
    now += 10_000;

    saveDraft(baseId); // stale: same content, filed at baseId, written SECOND (newer savedAt)

    nowSpy.mockRestore();

    const staleRaw = localStorage.getItem(draftKey(baseId));
    const survivorRaw = localStorage.getItem(draftKey(customId));
    expect(staleRaw).not.toBeNull();
    expect(survivorRaw).not.toBeNull();
    const staleSavedAt = (JSON.parse(staleRaw!) as DurableDraft).savedAt;
    const survivorSavedAtBefore = (JSON.parse(survivorRaw!) as DurableDraft).savedAt;
    expect(staleSavedAt).toBeGreaterThan(survivorSavedAtBefore);

    const merged = reconcileRenamedProjectRows();

    expect(merged).toBe(1);
    expect(localStorage.getItem(draftKey(baseId))).toBeNull();
    const survivorAfterRaw = localStorage.getItem(draftKey(customId));
    expect(survivorAfterRaw).not.toBeNull();
    const survivorAfter = JSON.parse(survivorAfterRaw!) as DurableDraft;
    // The newer (formerly stale) content's savedAt now lives under the survivor key.
    expect(survivorAfter.savedAt).toBe(staleSavedAt);
    expect(survivorAfter.projectKey).toBe(customId);

    const entries = listDrafts();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.projectKey).toBe(customId);
    expect(entries[0]?.savedAt).toBe(staleSavedAt);
  });

  it("is idempotent — a second call merges nothing further", () => {
    const baseId = "basic_kbdus_3";
    const customId = "my_renamed_project_3";

    instantiateMinimal(baseId);
    saveDraft(baseId);
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });
    saveDraft(baseId);
    saveDraft(customId);

    expect(reconcileRenamedProjectRows()).toBe(1);
    expect(reconcileRenamedProjectRows()).toBe(0);
  });

  // NEGATIVE CASE (required): two genuinely DISTINCT keyboards that happen to
  // share a display name must NEVER be fused. Each is self-consistent (its
  // own derived key equals its own filed key) — self-consistency is the
  // predicate's REFUSAL signal, not a match signal — so this must merge
  // nothing regardless of the shared label.
  it("does NOT merge two distinct keyboards that happen to share a display name", () => {
    const keyX = "kbd_distinct_x";
    const keyY = "kbd_distinct_y";
    const sharedDisplayName = "My Awesome Keyboard";

    instantiateMinimal(keyX, sharedDisplayName);
    saveDraft(keyX);

    useWorkingCopyStore.getState().reset();
    instantiateMinimal(keyY, sharedDisplayName);
    saveDraft(keyY);

    const before = listDrafts();
    expect(before.map((e) => e.projectKey).sort()).toEqual([keyX, keyY].sort());
    expect(before.every((e) => e.label === sharedDisplayName)).toBe(true);

    const merged = reconcileRenamedProjectRows();

    expect(merged).toBe(0);
    const after = listDrafts();
    expect(after).toHaveLength(2);
    expect(after.map((e) => e.projectKey).sort()).toEqual([keyX, keyY].sort());
    expect(localStorage.getItem(draftKey(keyX))).not.toBeNull();
    expect(localStorage.getItem(draftKey(keyY))).not.toBeNull();
  });

  it("does nothing when there is only one row, or none", () => {
    expect(reconcileRenamedProjectRows()).toBe(0);

    instantiateMinimal("only_one_project");
    saveDraft("only_one_project");
    expect(reconcileRenamedProjectRows()).toBe(0);
    expect(listDrafts()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Additional adversarial coverage — awkward inputs the tests above don't
// exercise: a PENDING_PROJECT_KEY record sitting alongside a real duplicate
// pair, a corrupt envelope on either side of a candidate merge, stronger
// (byte-identical) idempotency, and a THREE-row pile-up (two successive
// renames, not just one).
// ---------------------------------------------------------------------------

describe("reconcileRenamedProjectRows — awkward inputs", () => {
  it("never touches the PENDING_PROJECT_KEY record while merging an unrelated real duplicate pair", () => {
    const baseId = "kbd_awkward_pending_base";
    const customId = "kbd_awkward_pending_renamed";

    // The classic duplicate pair (same shape as the first test above).
    instantiateMinimal(baseId);
    saveDraft(baseId);
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });
    saveDraft(baseId);
    saveDraft(customId);

    // A pending-slot record, written alongside it. `saveDraft`'s VR-2 guard
    // only gates when the working copy is NOT instantiated; ours already is
    // (from the seeding above), so this writes a real
    // `ks.draft.__pending__.v1` record — deliberately excluded from the
    // index by `saveDraft`'s own `projectKey !== PENDING_PROJECT_KEY` gate —
    // exactly mirroring a browser that also has an uncommitted pre-
    // instantiation session sitting in the pending slot at the same time.
    saveDraft(PENDING_PROJECT_KEY);
    const pendingRawBefore = localStorage.getItem(draftKey(PENDING_PROJECT_KEY));
    expect(pendingRawBefore).not.toBeNull();

    const merged = reconcileRenamedProjectRows();

    expect(merged).toBe(1); // only the real baseId/customId pair
    // The pending record is byte-identical — never read as a merge
    // candidate (it has no index row to iterate over), never relocated,
    // never cleared.
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).toBe(pendingRawBefore);

    const entries = listDrafts();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.projectKey).toBe(customId);
    expect(entries.some((e) => e.projectKey === PENDING_PROJECT_KEY)).toBe(false);
  });

  it("does not crash and does not delete the good row when the STALE candidate's own record is corrupt", () => {
    const goodKey = "kbd_awkward_corrupt_stale_good";
    const corruptKey = "kbd_awkward_corrupt_stale_bad";

    instantiateMinimal(goodKey);
    saveDraft(goodKey);

    // Fabricate an index row for `corruptKey` directly (not via saveDraft,
    // which would write a well-formed record) so its INDEX entry exists but
    // its per-project RECORD is unparseable JSON — a partially-written
    // localStorage write (e.g. a tab closed mid-flush) is exactly this shape.
    const rawIndex = JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY)!) as unknown[];
    rawIndex.push({
      projectKey: corruptKey,
      savedAt: Date.now(),
      activeStepId: "identity",
      label: "Corrupt Stale",
      langTag: null,
      status: "draft",
      prUrl: null,
    });
    localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(rawIndex));
    localStorage.setItem(draftKey(corruptKey), "{not valid json");

    let merged = -1;
    expect(() => {
      merged = reconcileRenamedProjectRows();
    }).not.toThrow();

    // Neither row's own content self-consistently points anywhere else, so
    // nothing should merge — but the assertion that matters is that the
    // GOOD row survives untouched regardless.
    expect(merged).toBe(0);
    expect(localStorage.getItem(draftKey(goodKey))).not.toBeNull();
    const entries = listDrafts();
    expect(entries.some((e) => e.projectKey === goodKey)).toBe(true);
  });

  it("does not crash and does not delete the good row when the SURVIVOR target's record is corrupt", () => {
    const staleKey = "kbd_awkward_corrupt_survivor_stale";
    const corruptSurvivorKey = "kbd_awkward_corrupt_survivor_target";

    // `staleKey`'s own stored content genuinely derives to
    // `corruptSurvivorKey` (the real "renamed mid-session" shape), but the
    // record filed under `corruptSurvivorKey` is corrupt.
    instantiateMinimal(staleKey);
    saveDraft(staleKey);
    useWorkingCopyStore.getState().setIdentity({ keyboardId: corruptSurvivorKey });
    saveDraft(staleKey); // re-saved under the SAME (stale) key, content now points at corruptSurvivorKey

    const rawIndex = JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY)!) as unknown[];
    rawIndex.push({
      projectKey: corruptSurvivorKey,
      savedAt: Date.now(),
      activeStepId: "identity",
      label: "Corrupt Survivor Target",
      langTag: null,
      status: "draft",
      prUrl: null,
    });
    localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(rawIndex));
    localStorage.setItem(draftKey(corruptSurvivorKey), "{not valid json");

    let merged = -1;
    expect(() => {
      merged = reconcileRenamedProjectRows();
    }).not.toThrow();

    // The would-be survivor is unreadable, so the merge must refuse rather
    // than delete the stale row into a black hole.
    expect(merged).toBe(0);
    expect(localStorage.getItem(draftKey(staleKey))).not.toBeNull();
    const entries = listDrafts();
    expect(entries.some((e) => e.projectKey === staleKey)).toBe(true);
  });

  it("is idempotent byte-for-byte, not just in its returned merge count", () => {
    const baseId = "kbd_awkward_idempotent_base";
    const customId = "kbd_awkward_idempotent_renamed";

    instantiateMinimal(baseId);
    saveDraft(baseId);
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });
    saveDraft(baseId);
    saveDraft(customId);

    expect(reconcileRenamedProjectRows()).toBe(1);

    const indexSnapshot = localStorage.getItem(DRAFT_INDEX_KEY);
    const recordSnapshot = localStorage.getItem(draftKey(customId));
    expect(indexSnapshot).not.toBeNull();
    expect(recordSnapshot).not.toBeNull();
    expect(localStorage.getItem(draftKey(baseId))).toBeNull();

    expect(reconcileRenamedProjectRows()).toBe(0);

    // Not just "still one row" — the exact stored bytes must be unchanged,
    // so a second pass provably touches nothing.
    expect(localStorage.getItem(DRAFT_INDEX_KEY)).toBe(indexSnapshot);
    expect(localStorage.getItem(draftKey(customId))).toBe(recordSnapshot);
  });

  it("a three-row pile-up (base id + two successive renames) converges to exactly one row — the FINAL renamed id", () => {
    const baseId = "kbd_awkward_pileup_base";
    const midId = "kbd_awkward_pileup_mid";
    const finalId = "kbd_awkward_pileup_final";

    // Mirrors what a long-lived autosave subscription that never migrated
    // (the pre-fix defect, TWICE in a row) would leave on disk:
    //   1. Instantiated + saved under baseId (original filing).
    instantiateMinimal(baseId);
    saveDraft(baseId);
    //   2. Renamed to midId, but the still-baseId-scoped autosave keeps
    //      writing under baseId with content that now says midId.
    useWorkingCopyStore.getState().setIdentity({ keyboardId: midId });
    saveDraft(baseId);
    //   3. A (still-pre-fix) install writes the first self-consistent row
    //      under midId.
    saveDraft(midId);
    //   4. Renamed AGAIN to finalId, but the still-midId-scoped autosave
    //      keeps writing under midId with content that now says finalId.
    useWorkingCopyStore.getState().setIdentity({ keyboardId: finalId });
    saveDraft(midId);
    //   5. A self-consistent row lands under finalId — the true survivor.
    saveDraft(finalId);

    const before = JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY)!) as Array<{
      projectKey: string;
    }>;
    expect(before.map((e) => e.projectKey).sort()).toEqual(
      [baseId, midId, finalId].sort(),
    );

    // Run reconciliation to a fixed point — `listDrafts()` (the real public
    // entry point every caller actually uses) only runs ONE pass per call,
    // so a caller who relies on a single `listDrafts()` to fully converge a
    // multi-hop pile-up is exactly the scenario under test. Calling the
    // underlying function repeatedly here is a deliberately GENEROUS
    // allowance for the implementation to converge across several calls
    // (e.g. a browser that visits "My keyboards" more than once) rather than
    // demanding it in one shot.
    let totalMerged = 0;
    for (let i = 0; i < 5; i += 1) {
      totalMerged += reconcileRenamedProjectRows();
    }

    const after = listDrafts();
    expect(after).toHaveLength(1);
    expect(after[0]?.projectKey).toBe(finalId);
    expect(totalMerged).toBe(2);
    expect(localStorage.getItem(draftKey(baseId))).toBeNull();
    expect(localStorage.getItem(draftKey(midId))).toBeNull();
    expect(localStorage.getItem(draftKey(finalId))).not.toBeNull();
  });
});

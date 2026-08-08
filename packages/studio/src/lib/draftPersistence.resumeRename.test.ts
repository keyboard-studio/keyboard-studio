// Regression test (unit level, no shell mount) for the "duplicate My
// keyboards row after Resume" defect.
//
// Mechanism under test (see draftPersistence.ts's deriveProjectKeyFromWorkingCopy
// doc comment + installDraftAutosave's P1 synchronous save):
//
//   1. A working copy is instantiated under Track 1 before `identity` is set.
//      `deriveProjectKeyFromWorkingCopy` falls back to `baseKeyboard.id`, so
//      the FIRST autosave install writes the "My keyboards" index row keyed
//      on the base id ("key A").
//   2. The author later completes the identity step and picks a CUSTOM
//      keyboard id (TrackOneIdentityPanel -> workingCopyStore.setIdentity).
//      `deriveProjectKeyFromWorkingCopy` now resolves to that custom id
//      ("key B") — but the ALREADY-INSTALLED autosave subscription is still
//      closed over key A, so nothing currently move the existing record.
//   3. Something re-derives the project key from the CURRENT working copy and
//      re-installs autosave under it (this is exactly what StudioShell's
//      SurveyView mount effect does on every fresh mount — e.g. after a
//      Resume-then-navigate). That re-install's own synchronous save
//      (installDraftAutosave's P1 fix) upserts a SECOND "My keyboards" index
//      row under key B, because `upsertIndexEntry` matches by exact
//      `projectKey` — key A's row is untouched, not replaced.
//
// This test isolates step 3 without mounting any React component: install
// autosave under key A, mutate identity so the derived key becomes B, then
// do exactly what the mount effect does (tear down + reinstall under the
// freshly-derived key) and assert the index does NOT grow to two rows.
//
// See the shell-level counterpart in
// ../StudioShell.resumeRename.test.tsx for the same defect reproduced through
// an actual Resume click + SurveyView remount.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { BaseKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";

// Same idiom as draftPersistence.test.ts: serverDraftStore's fetch-based
// transport is mocked at the module boundary so nothing here touches the
// network (installDraftAutosave only calls the LOCAL saveDraft, but the
// module still statically imports serverDraftStore.ts).
vi.mock("./serverDraftStore.ts", () => ({
  saveServerDraft: vi.fn(async () => true),
  saveServerDraftBeacon: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

import {
  draftKey,
  deriveProjectKeyFromWorkingCopy,
  installDraftAutosave,
  listDrafts,
  loadDraft,
  resolveActiveProjectKey,
  saveDraft,
  migrateProjectKeyIfChanged,
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

function instantiateMinimal(baseId: string): void {
  const base = { id: baseId, displayName: "Rename Test", languages: [] } as unknown as BaseKeyboard;
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

describe("installDraftAutosave — re-deriving the project key after a live identity rename", () => {
  it("does not grow the 'My keyboards' index to two rows when re-installed under the post-rename key", () => {
    const baseId = "basic_kbdus";
    const customId = "my_custom_keyboard_id";

    // Step 1: Track 1 instantiation before identity is set. The derived key
    // is baseKeyboard.id (deriveProjectKeyFromWorkingCopy's documented
    // fallback), and installDraftAutosave's own synchronous install-time save
    // (P1 fix) writes the first "My keyboards" row under it.
    instantiateMinimal(baseId);
    expect(deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState())).toBe(baseId);
    const teardownA = installDraftAutosave(baseId);

    expect(listDrafts()).toHaveLength(1);
    expect(listDrafts()[0]?.projectKey).toBe(baseId);
    expect(localStorage.getItem(draftKey(baseId))).not.toBeNull();

    // Step 2: the author completes the identity step live and picks a custom
    // keyboard id — exactly what TrackOneIdentityPanel's setIdentity call
    // does. The derived key flips from baseId to customId...
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });
    expect(deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState())).toBe(customId);

    // ...but nothing has told the ALREADY-INSTALLED autosave (still closed
    // over baseId) to move — the index still shows exactly the one row from
    // step 1 at this point (sanity: this line alone is not the defect).
    expect(listDrafts()).toHaveLength(1);

    // Step 3: something re-derives the key from the NOW-current working copy
    // and re-installs autosave under it — this is exactly what StudioShell's
    // SurveyView mount effect does on every fresh mount (deriveProjectKeyFromWorkingCopy
    // + installDraftAutosave(restoredProjectKey), StudioShell.tsx ~L789-802).
    teardownA();
    installDraftAutosave(customId);

    // EXPECTED (post-fix): the index still has exactly one row, now keyed on
    // the current project id, and the stale baseId record is gone.
    // ACTUAL (bug): upsertIndexEntry matches by exact projectKey, so this
    // creates a SECOND row instead of replacing the first.
    const entries = listDrafts();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.projectKey).toBe(customId);
    expect(localStorage.getItem(draftKey(baseId))).toBeNull();
  });
});

describe("plain reload after a rename — no Resume click involved", () => {
  it("main.tsx's pre-mount loadDraft + the mount effect's re-derive-and-reinstall do not duplicate the row either", () => {
    // Same seeded shape as the test above (a completed Track-1 rename whose
    // autosave record is still filed under the ORIGINAL base id), but this
    // time the mismatch is discovered via a genuine loadDraft() round-trip
    // through localStorage — not via resumeProject() — because the whole
    // point of this test is that Resume was never clicked: this is a plain
    // browser refresh on a tab that already had the renamed project active.
    const baseId = "basic_kbdus";
    const customId = "my_custom_keyboard_id_reload";

    instantiateMinimal(baseId);
    const teardownA = installDraftAutosave(baseId);
    useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });
    teardownA();
    // Mirrors the real autosave's stale closure: the NEXT write after the
    // rename still lands under baseId, now carrying the renamed identity.
    const teardownB = installDraftAutosave(baseId);
    teardownB();

    expect(listDrafts()).toHaveLength(1);
    expect(resolveActiveProjectKey()).toBe(baseId);

    // Simulate the tab closing and reopening: the in-memory stores go back
    // to their pre-boot shape, and only localStorage + the active pointer
    // survive.
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();
    usePhaseBDraftStore.getState().reset();

    // main.tsx's pre-mount restore: resolve the active pointer, then
    // loadDraft() it. The pointer still names baseId — loadDraft() does not
    // itself move it — but the record's CONTENT (identity.keyboardId) is
    // customId.
    const activeKey = resolveActiveProjectKey();
    expect(activeKey).toBe(baseId);
    expect(loadDraft(activeKey!)).toBe(true);
    expect(
      deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState()),
    ).toBe(customId);

    // SurveyView's mount effect: derive the key from the JUST-RESTORED
    // working copy and install autosave under it. No resumeProject() call
    // anywhere in this test — this is the reload path, isolated.
    installDraftAutosave(customId);

    const entries = listDrafts();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.projectKey).toBe(customId);
    expect(localStorage.getItem(draftKey(baseId))).toBeNull();
  });
});

describe("migrateProjectKeyIfChanged — the extracted helper directly", () => {
  it("deletes the FROM record when TO is a real, different key", () => {
    instantiateMinimal("proj-from");
    saveDraft("proj-from");
    expect(localStorage.getItem(draftKey("proj-from"))).not.toBeNull();

    migrateProjectKeyIfChanged("proj-from", "proj-to");

    expect(localStorage.getItem(draftKey("proj-from"))).toBeNull();
  });

  it("is a no-op when the two keys are the same", () => {
    instantiateMinimal("proj-same");
    saveDraft("proj-same");

    migrateProjectKeyIfChanged("proj-same", "proj-same");

    expect(localStorage.getItem(draftKey("proj-same"))).not.toBeNull();
  });

  it("is a no-op when either key is null", () => {
    instantiateMinimal("proj-null-check");
    saveDraft("proj-null-check");

    migrateProjectKeyIfChanged(null, "proj-null-check");
    migrateProjectKeyIfChanged("proj-null-check", null);

    expect(localStorage.getItem(draftKey("proj-null-check"))).not.toBeNull();
  });
});

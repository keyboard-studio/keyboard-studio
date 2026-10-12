// Seed helpers for the draft-persistence and StudioShell project suites.
//
// Every helper builds its state with the REAL stores and the REAL
// draftPersistence writers (never a hand-rolled JSON envelope), so a seeded
// record is exactly as well-formed as one a real session leaves behind.

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { resetInventoryDraft } from "../survey/useInventoryDraft.ts";
import { installDraftAutosave, saveDraft } from "../lib/draftPersistence.ts";
import { makeScaffoldedIR } from "./irFixtures.ts";

export { makeScaffoldedIR };

/** Instantiate the live working copy from a bare base `startId` with an empty VFS and IR. */
export function instantiateMinimal(startId: string, displayName = "Test Keyboard"): void {
  const base = { id: startId, displayName, languages: [] } as unknown as StartKeyboard;
  useWorkingCopyStore.getState().instantiateFromStart(base, { vfs: createVirtualFS([]), ir: makeScaffoldedIR() });
}

/** Put the live stores back to their pre-boot shape, as a page reload would find them. */
function resetLiveStores(): void {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  resetInventoryDraft();
}

/**
 * Seed ONE self-consistent, standalone project (no rename anywhere in its
 * history) under `startId`, then reset the live stores, leaving only the
 * on-disk record and its "My keyboards" row.
 */
export function instantiateAndSave(startId: string, displayName: string): void {
  instantiateMinimal(startId, displayName);
  saveDraft(startId);
  resetLiveStores();
}

/**
 * Seed exactly the state a real "author renamed mid-session" project leaves
 * behind: ONE "My keyboards" index row + ONE per-project draft record filed
 * under `startId`, whose stored `workingCopy.identity.keyboardId` is already
 * `customId`. That is the record autosave kept writing under the ORIGINAL
 * project key after the author picked a custom id (see draftPersistence.ts's
 * deriveProjectKeyFromWorkingCopy doc comment: the derived key flips the moment
 * identity.keyboardId is set, but nothing moves an ALREADY-installed autosave
 * subscription's closure-captured key). The live stores are reset afterwards,
 * so the record is only applied again by whatever the test does next (a Resume
 * click, or main.tsx's pre-mount loadDraft()).
 */
export function seedRenamedProjectDraft(startId: string, customId: string): void {
  const base = { id: startId, displayName: "Base Keyboard", languages: [] } as unknown as StartKeyboard;
  useWorkingCopyStore.getState().instantiateFromStart(base, { vfs: createVirtualFS([]), ir: makeScaffoldedIR() });

  // Session 1: install autosave before identity exists. That writes the ONE
  // index row + draft record under startId (deriveProjectKeyFromWorkingCopy's
  // documented pre-identity fallback).
  const teardown = installDraftAutosave(startId);

  // The author completes Track 1's identity step with a custom keyboard id
  // (TrackOneIdentityPanel -> workingCopyStore.setIdentity), but the installed
  // autosave is still closed over startId, so its next save is still filed at
  // startId's key, now carrying the renamed identity in its payload.
  useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });
  teardown();
  // Re-install under startId once more (autosave never re-derives the key on its
  // own) so the on-disk record reflects the renamed identity while staying
  // filed under startId, matching a real in-session autosave write.
  const finalTeardown = installDraftAutosave(startId);
  finalTeardown();

  resetLiveStores();
}

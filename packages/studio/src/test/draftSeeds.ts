// Seed helpers for the draft-persistence and StudioShell project suites.
//
// Every helper builds its state with the REAL stores and the REAL
// draftPersistence writers (never a hand-rolled JSON envelope), so a seeded
// record is exactly as well-formed as one a real session leaves behind.

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { installDraftAutosave, saveDraft } from "../lib/draftPersistence.ts";
import { makeScaffoldedIR } from "./irFixtures.ts";

export { makeScaffoldedIR };

/** Instantiate the live working copy from a bare base `baseId` with an empty VFS and IR. */
export function instantiateMinimal(baseId: string, displayName = "Test Keyboard"): void {
  const base = { id: baseId, displayName, languages: [] } as unknown as BaseKeyboard;
  useWorkingCopyStore.getState().instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeScaffoldedIR() });
}

/** Put the live stores back to their pre-boot shape, as a page reload would find them. */
function resetLiveStores(): void {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
}

/**
 * Seed ONE self-consistent, standalone project (no rename anywhere in its
 * history) under `baseId`, then reset the live stores, leaving only the
 * on-disk record and its "My keyboards" row.
 */
export function instantiateAndSave(baseId: string, displayName: string): void {
  instantiateMinimal(baseId, displayName);
  saveDraft(baseId);
  resetLiveStores();
}

/**
 * Seed exactly the state a real "author renamed mid-session" project leaves
 * behind: ONE "My keyboards" index row + ONE per-project draft record filed
 * under `baseId`, whose stored `workingCopy.identity.keyboardId` is already
 * `customId`. That is the record autosave kept writing under the ORIGINAL
 * project key after the author picked a custom id (see draftPersistence.ts's
 * deriveProjectKeyFromWorkingCopy doc comment: the derived key flips the moment
 * identity.keyboardId is set, but nothing moves an ALREADY-installed autosave
 * subscription's closure-captured key). The live stores are reset afterwards,
 * so the record is only applied again by whatever the test does next (a Resume
 * click, or main.tsx's pre-mount loadDraft()).
 */
export function seedRenamedProjectDraft(baseId: string, customId: string): void {
  const base = { id: baseId, displayName: "Base Keyboard", languages: [] } as unknown as BaseKeyboard;
  useWorkingCopyStore.getState().instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeScaffoldedIR() });

  // Session 1: install autosave before identity exists. That writes the ONE
  // index row + draft record under baseId (deriveProjectKeyFromWorkingCopy's
  // documented pre-identity fallback).
  const teardown = installDraftAutosave(baseId);

  // The author completes Track 1's identity step with a custom keyboard id
  // (TrackOneIdentityPanel -> workingCopyStore.setIdentity), but the installed
  // autosave is still closed over baseId, so its next save is still filed at
  // baseId's key, now carrying the renamed identity in its payload.
  useWorkingCopyStore.getState().setIdentity({ keyboardId: customId });
  teardown();
  // Re-install under baseId once more (autosave never re-derives the key on its
  // own) so the on-disk record reflects the renamed identity while staying
  // filed under baseId, matching a real in-session autosave write.
  const finalTeardown = installDraftAutosave(baseId);
  finalTeardown();

  resetLiveStores();
}

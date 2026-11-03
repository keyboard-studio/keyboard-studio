// draftPersistence tests (autosave group) — split from draftPersistence.test.ts by behaviour.
// See draftPersistence.core.test.ts for the original coverage overview and the
// wasDraftRestoredThisBoot test-order note (that first-boot assertion lives there).

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { DEBOUNCE_MS } from "../hooks/useDebounce.ts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { deriveScaffoldSpec } from "../decisions/identitySelectors.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { getDecisionSnapshot, useDecisionStore } from "../stores/decisionStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { instantiateMinimal, makeScaffoldedIR } from "../test/draftSeeds.ts";
import { getCharacterInventoryValue, getInvisiblesInventoryValue, inventoryOps, resetInventoryDecisions, resetInventoryDraft } from "../survey/useInventoryDraft.ts";
import { snapshotFromValues } from "../survey/phaseBDraftOps.ts";
import { draftKey, saveDraft, loadDraft, clearDraft, resolveActiveProjectKey, setActiveProjectKey, clearActiveProjectKey, installDraftAutosave, resumeProject, flushActiveDraft, AUTOSAVE_DEBOUNCE_MS, type DurableDraft } from "./draftPersistence.ts";
import { currentDir, installDraftPersistenceHooks } from "./draftPersistence.testkit.ts";

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
  describe("installDraftAutosave + surveyAnswerStore: same timer, real teardown (spec 079 FR-034)", () => {
    it("teardown unsubscribes the answer store — a change made after teardown schedules no save", () => {
      vi.useFakeTimers();
      const pk = "autosave-answerstore-teardown";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      teardown();
      // Isolate the write this test cares about from installDraftAutosave's own
      // synchronous install-time save.
      localStorage.removeItem(draftKey(pk));

      useSurveyAnswerStore.getState().setPosition("identity", "q1");
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 1000);

      expect(localStorage.getItem(draftKey(pk))).toBeNull();
    });

    it("AUTOSAVE_DEBOUNCE_MS is 500 and a burst across working copy, survey session, decisions and surveyAnswer schedules exactly one save (single-cycle invariant)", () => {
      expect(AUTOSAVE_DEBOUNCE_MS).toBe(500);

      vi.useFakeTimers();
      const pk = "autosave-burst-four-stores";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      // The P1 install-time save already happened above the spy attach point.
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      useWorkingCopyStore.getState().lockDesktop();
      useSurveySessionStore.getState().advance("choose_base");
      inventoryOps("characters").add("q");
      useSurveyAnswerStore.getState().setPosition("identity", "q1");

      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

      const draftWrites = setItemSpy.mock.calls.filter(([key]) => key === draftKey(pk));
      expect(draftWrites).toHaveLength(1);

      const saved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(saved.workingCopy.desktopLocked).toBe(true);
      expect(saved.traversal.activeStepId).toBe("choose_base");
      expect((saved.decisions?.["character-inventory"]?.value as { chars: string[] }).chars).toEqual(["q"]);
      expect(saved.surveyAnswers?.steps["identity"]?.position).toBe("q1");

      teardown();
    });

    it("pagehide flushes a pending save, so a reload inside the debounce window keeps the last answer (FR-030)", () => {
      vi.useFakeTimers();
      const pk = "autosave-pagehide-flush";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      useSurveyAnswerStore.getState().setPosition("identity", "q2");
      window.dispatchEvent(new Event("pagehide"));

      const saved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(saved.surveyAnswers?.steps["identity"]?.position).toBe("q2");

      // The flush consumed the pending timer: no second write when it would have fired.
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 1000);
      expect(setItemSpy.mock.calls.filter(([key]) => key === draftKey(pk))).toHaveLength(0);

      teardown();
    });

    it("pagehide with no pending change writes nothing, and teardown removes the listener", () => {
      vi.useFakeTimers();
      const pk = "autosave-pagehide-idle";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
      window.dispatchEvent(new Event("pagehide"));
      expect(setItemSpy.mock.calls.filter(([key]) => key === draftKey(pk))).toHaveLength(0);

      teardown();
      useSurveyAnswerStore.getState().setPosition("identity", "q3");
      window.dispatchEvent(new Event("pagehide"));
      expect(setItemSpy.mock.calls.filter(([key]) => key === draftKey(pk))).toHaveLength(0);
    });
  });

  describe("sticky phase-B draft fields survive a reload (spec 044 FR-017 defect, surfaced by spec 075 US4)", () => {
    // `saveDraft` already writes every sticky decision the draft store keeps
    // (`rejected`, `provenance`, `proposalConfidence`, `exemplarMethodDeclined`,
    // `declaredRoles`), but the restore path used to rebuild the snapshot from
    // `chars`/`exemplarDigraphs`/`selectedFont` alone, so a reload silently
    // re-proposed every character the author had removed and flattened every
    // proposed chip to "author". Pinned as a full save -> cold reset -> load
    // round trip: every sticky field equals what was saved.
    function seedStickyDraft(): void {
      const store = inventoryOps("characters");
      store.seedFromProposal({
        resolvedTag: "ewo",
        source: "cldr",
        confidence: "approved",
        characters: [
          { char: "d", tier: "main", source: "cldr", confidence: "approved" },
          { char: "z", tier: "main", source: "cldr", confidence: "approved" },
        ],
        digraphs: [],
      });
      store.add("q");
      store.add("\uE000", { role: "mark" });
      store.remove("z"); // removing a PROPOSAL records a rejection
      store.declineExemplarMethod();
      // spec 075 sticky fields ride along the same way.
      store.seedProposals(["!"], "cldr", "punctuation:ewo");
      store.acceptInvisible("U+200C");
      store.declineInvisible("U+200D");
    }

    function coldReset(): void {
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      resetInventoryDraft();
      resetInventoryDecisions();
    }

    it("restores rejected, provenance, proposalConfidence, exemplarMethodDeclined and declaredRoles exactly as saved", () => {
      const pk = "phaseb-draft-sticky-fields";
      instantiateMinimal(pk);
      seedStickyDraft();
      const before = snapshotFromValues(getCharacterInventoryValue(), getInvisiblesInventoryValue());
      // Sanity: the fixture really exercises every sticky field.
      expect(before.rejected).toEqual(["z"]);
      expect(before.provenance).toMatchObject({ d: "cldr", q: "author" });
      expect(before.proposalConfidence).toEqual({ cldr: "approved" });
      expect(before.exemplarMethodDeclined).toBe(true);
      expect(before.declaredRoles).toEqual({ "\uE000": "mark" });
      expect(before.seededProposals).toEqual(["punctuation:ewo"]);
      expect(before.invisibleDecisions).toEqual({ "U+200C": "accepted", "U+200D": "declined" });

      saveDraft(pk);
      coldReset();
      expect(getCharacterInventoryValue().rejected).toEqual([]);
      expect(getCharacterInventoryValue().provenance).toEqual({});

      expect(loadDraft(pk)).toBe(true);
      const after = snapshotFromValues(getCharacterInventoryValue(), getInvisiblesInventoryValue());
      expect(after.chars).toEqual(before.chars);
      expect(after.rejected).toEqual(before.rejected);
      expect(after.provenance).toEqual(before.provenance);
      expect(after.proposalConfidence).toEqual(before.proposalConfidence);
      expect(after.exemplarMethodDeclined).toBe(true);
      expect(after.declaredRoles).toEqual(before.declaredRoles);
      expect(after.seededProposals).toEqual(before.seededProposals);
      expect(after.invisibleDecisions).toEqual(before.invisibleDecisions);
    });

    it("a restored rejection still vetoes the same proposal after reload (the ledger is load-bearing, not decorative)", () => {
      const pk = "phaseb-draft-sticky-veto";
      instantiateMinimal(pk);
      seedStickyDraft();
      saveDraft(pk);
      coldReset();
      expect(loadDraft(pk)).toBe(true);

      inventoryOps("characters").addProposed("z", "cldr");
      expect(getCharacterInventoryValue().chars).not.toContain("z");
    });
  });

  describe("spec 079 T041 — alphabetEvidenceKey rides the phase-B draft snapshot", () => {
    it("restores a string alphabetEvidenceKey", () => {
      const pk = "phaseb-alphabet-key";
      instantiateMinimal(pk);
      inventoryOps("characters").add("a");
      inventoryOps("characters").setAlphabetEvidenceKey("tl-Latn|Latn|Latn|basic_kbdus");
      saveDraft(pk);
      resetInventoryDraft();
      resetInventoryDecisions();
      expect(getCharacterInventoryValue().alphabetEvidenceKey).toBeUndefined();

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().alphabetEvidenceKey).toBe("tl-Latn|Latn|Latn|basic_kbdus");
    });

    it("a pre-079 draft (built alphabet, no key) is stamped on load from its restored identity and base (FR-032)", () => {
      const pk = "phaseb-alphabet-key-pre079";
      instantiateMinimal(pk);
      // Spec 089: the stamp derives the identity from the recorded
      // decisions (saved into the draft envelope, restored on load).
      {
        const record = useDecisionStore.getState().record;
        record({ id: "language-name", value: "Test", provenance: "asked" });
        record({ id: "language-autonym", value: "Test", provenance: "asked" });
        record({ id: "language-code", value: "tl", provenance: "asked" });
        record({ id: "target-script", value: "Latn", provenance: "asked" });
      }
      useSurveySessionStore.setState({
        localStart: { id: "basic_kbdus", path: "release/b/basic_kbdus", script: "Latn", displayName: "US" } as never,
      });
      inventoryOps("characters").add("a");
      saveDraft(pk);
      expect(getCharacterInventoryValue().alphabetEvidenceKey).toBeUndefined();
      resetInventoryDraft();
      useSurveySessionStore.getState().reset();
      useDecisionStore.getState().reset();

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().chars).toEqual(["a"]);
      expect(getCharacterInventoryValue().alphabetEvidenceKey).toBe("tl-Latn|Latn|Latn|basic_kbdus");
    });

    it("drops a non-string alphabetEvidenceKey in a legacy slice rather than coercing it (and surfaces it as an orphan, spec 090 T025)", () => {
      const pk = "phaseb-alphabet-key-bad";
      instantiateMinimal(pk);
      saveDraft(pk);
      // Pre-T025 record shape: the key rides the legacy slice, malformed.
      const raw = JSON.parse(localStorage.getItem(draftKey(pk))!) as Record<string, unknown>;
      const decisions = raw.decisions as Record<string, unknown>;
      delete decisions["character-inventory"];
      delete decisions["invisibles-inventory"];
      raw.phaseBDraft = { chars: ["a"], alphabetEvidenceKey: 42 };
      localStorage.setItem(draftKey(pk), JSON.stringify(raw));
      resetInventoryDraft();
      resetInventoryDecisions();

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().chars).toEqual(["a"]);
      expect(getCharacterInventoryValue().alphabetEvidenceKey).toBeUndefined();
      const orphanIds = useDecisionLogStore
        .getState()
        .record.entries.map((e) => (e.payload.kind === "survey-answer" ? e.payload.questionId : null));
      expect(orphanIds).toContain("phaseBDraft.alphabetEvidenceKey");
    });
  });

  describe("spec 075 SC-006 — a punctuation rejection survives the reload round trip", () => {
    const TIER = ["\u0964", "\u0965", "!", "?"];

    it("seed, remove N, save, cold-reset, load, re-seed: the chosen list is tier minus N and the ledger still lists the N", () => {
      const pk = "phaseb-punctuation-rejections";
      instantiateMinimal(pk);
      const store = inventoryOps("characters");
      store.seedProposals(TIER, "cldr", "punctuation:hi");
      store.remove("!");
      store.remove("?");
      expect(getCharacterInventoryValue().punctuation).toEqual(["\u0964", "\u0965"]);

      saveDraft(pk);
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      resetInventoryDraft();
      resetInventoryDecisions();
      expect(getCharacterInventoryValue().rejected).toEqual([]);
      expect(getCharacterInventoryValue().seededProposals).toEqual([]);

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().punctuation).toEqual(["\u0964", "\u0965"]);
      expect(getCharacterInventoryValue().rejected).toEqual(["!", "?"]);
      expect(getCharacterInventoryValue().seededProposals).toEqual(["punctuation:hi"]);

      // The same key is a no-op after reload; a NEW key (re-resolution) seeds
      // again and the restored ledger still vetoes the removed marks.
      inventoryOps("characters").seedProposals(TIER, "cldr", "punctuation:hi");
      expect(getCharacterInventoryValue().punctuation).toEqual(["\u0964", "\u0965"]);
      inventoryOps("characters").seedProposals(TIER, "cldr", "punctuation:hi-IN");
      expect(getCharacterInventoryValue().punctuation).toEqual(["\u0964", "\u0965"]);
      expect(getCharacterInventoryValue().rejected).toEqual(["!", "?"]);
    });
  });

  describe("(b) installDraftAutosave — independent ~500ms debounce (Article IV)", () => {
    it("writes the debounced mutation only after the ~500ms debounce elapses, not immediately on mutation (P1's install-time save already landed a pre-mutation record)", () => {
      vi.useFakeTimers();
      const pk = "autosave-a";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      // P1 fix: install performed ONE synchronous save already — a record exists,
      // but it reflects the PRE-mutation state (desktopLocked still false).
      const installTimeSaved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(installTimeSaved.workingCopy.desktopLocked).toBe(false);

      useWorkingCopyStore.getState().lockDesktop(); // triggers scheduleSave

      vi.advanceTimersByTime(499);
      // Still the install-time snapshot — the mutation's debounced write hasn't landed yet.
      const stillPreMutation = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(stillPreMutation.workingCopy.desktopLocked).toBe(false);

      vi.advanceTimersByTime(1);
      const saved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(saved.workingCopy.desktopLocked).toBe(true);

      teardown();
    });

    it("teardown unsubscribes AND clears any pending timer — a mutation scheduled just before teardown never writes", () => {
      vi.useFakeTimers();
      const pk = "autosave-b";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      useWorkingCopyStore.getState().lockDesktop();
      vi.advanceTimersByTime(500);
      expect(localStorage.getItem(draftKey(pk))).not.toBeNull(); // first save landed

      // Isolate the NEXT write.
      localStorage.removeItem(draftKey(pk));

      useWorkingCopyStore.getState().unlockDesktop(); // schedules a NEW pending timer
      teardown(); // must clear that pending timer AND unsubscribe both stores

      vi.advanceTimersByTime(5000); // well past 500ms
      expect(localStorage.getItem(draftKey(pk))).toBeNull();
    });

    it("FINDING 1 fix: an orphaned subscription (active pointer moved on without teardown) skips its debounced write instead of overwriting the wrong key", () => {
      vi.useFakeTimers();
      const abandoned = "autosave-orphan-a";
      const resumed = "autosave-orphan-b";

      // Install autosave for the FIRST project, same as SurveyView's mount
      // effect would for whatever project is active when the author starts.
      instantiateMinimal(abandoned);
      installDraftAutosave(abandoned); // no teardown captured — nothing ever tears this down

      const abandonedRecordBefore = localStorage.getItem(draftKey(abandoned));
      expect(abandonedRecordBefore).not.toBeNull();

      // The author switches to a DIFFERENT, already-instantiated project via
      // resumeProject() (the same primitive MyKeyboardsList's Resume button
      // and CurrentKeyboardIndicator's top-bar switcher both use) — WITHOUT
      // anything tearing down the FIRST subscription (the exact gap a switch
      // that happens while SurveyView stays mounted leaves behind — see
      // installDraftAutosave's own doc comment).
      instantiateMinimal(resumed);
      saveDraft(resumed); // create resumed's own real record to resume into
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      resetInventoryDraft();
      expect(resumeProject(resumed)).toBe(true);
      expect(resolveActiveProjectKey()).toBe(resumed);

      // The orphaned subscription (still closed over `abandoned`) is still
      // subscribed to the SAME stores, which now hold `resumed`'s data. Any
      // mutation would, absent the guard, schedule a write that would file
      // `resumed`'s content under `abandoned`'s key.
      useWorkingCopyStore.getState().lockDesktop();
      vi.advanceTimersByTime(1000); // well past the 500ms debounce window

      // The orphan's write must be SKIPPED: `abandoned`'s record is untouched
      // (not overwritten with `resumed`'s content) and the active pointer
      // must NOT have been re-pinned back onto `abandoned`.
      expect(localStorage.getItem(draftKey(abandoned))).toBe(abandonedRecordBefore);
      expect(resolveActiveProjectKey()).toBe(resumed);

      // `resumed`'s own record is also unaffected by the orphan (it never
      // wrote to `resumed`'s key at all — it wrote nowhere).
      const resumedEnvelope = JSON.parse(localStorage.getItem(draftKey(resumed))!) as DurableDraft;
      expect(resumedEnvelope.projectKey).toBe(resumed);
    });

    it("coalesces rapid mutations into a single write — the debounce restarts rather than stacking", () => {
      vi.useFakeTimers();
      const pk = "autosave-c";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      // The P1 install-time save already happened above (before the spy is
      // attached), so it is NOT among the writes the spy captures below —
      // draftWrites still counts only the mutation-triggered debounced write.
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      useWorkingCopyStore.getState().lockDesktop();
      vi.advanceTimersByTime(300);
      useWorkingCopyStore.getState().unlockDesktop(); // restarts the debounce window
      vi.advanceTimersByTime(300); // only 300ms since the SECOND mutation
      // Still the install-time (pre-mutation) record — the debounce hasn't fired yet.
      const stillPreMutation = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(stillPreMutation.workingCopy.desktopLocked).toBe(false);

      vi.advanceTimersByTime(200); // 500ms since the second mutation
      const saved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(saved.workingCopy.desktopLocked).toBe(false); // locked then unlocked — net unchanged

      const draftWrites = setItemSpy.mock.calls.filter(([key]) => key === draftKey(pk));
      expect(draftWrites).toHaveLength(1);

      teardown();
    });

    it("G-1 window (P1 fix): a draft record exists IMMEDIATELY at install time, synchronously, with no timer advance and no store mutation", () => {
      vi.useFakeTimers();
      const pk = "autosave-p1-sync";
      instantiateMinimal(pk);

      // Contrast case: nothing has fired yet — no mutation, no timer advance at all.
      expect(localStorage.getItem(draftKey(pk))).toBeNull();

      const teardown = installDraftAutosave(pk);

      // The record must be present RIGHT NOW — before vi.advanceTimersByTime is
      // ever called, and before any store subscription fires. Without the P1
      // fix, a reload in this exact window (instantiation succeeded, but the
      // author has not yet made a single edit) found only the active-project
      // pointer and no draft record, so loadDraft returned false and the
      // just-instantiated project was silently discarded on reload.
      const stored = localStorage.getItem(draftKey(pk));
      expect(stored).not.toBeNull();

      const saved = JSON.parse(stored!) as DurableDraft;
      expect(saved.projectKey).toBe(pk);
      expect(saved.workingCopy.instantiationMode).toBe("new-from-base");

      // The active-project pointer is also set at install time (pre-existing
      // behaviour) — confirmed alongside the draft record, not in place of it.
      expect(resolveActiveProjectKey()).toBe(pk);

      teardown();
    });
  });

  // ---------------------------------------------------------------------------
  // T027 — FR-014 forward-compat seam: save/load/clear are keyed BY PARAMETER,
  // and the envelope carries identity fields, so a future draft index + a
  // server-backed store are additive (no envelope change, no migration).
  // ---------------------------------------------------------------------------
  describe("T027/FR-014: projectKey-parameterized API + envelope identity fields", () => {
    it("save/clear are keyed by the projectKey PARAMETER — two distinct projects persist and clear independently", () => {
      instantiateMinimal("proj_a");
      saveDraft("proj_a");

      useWorkingCopyStore.getState().reset();
      instantiateMinimal("proj_b");
      saveDraft("proj_b");

      // Both per-project records coexist in storage at once (the keyed schema
      // supports this even though the MVP UI only ever actively uses one).
      expect(localStorage.getItem(draftKey("proj_a"))).not.toBeNull();
      expect(localStorage.getItem(draftKey("proj_b"))).not.toBeNull();

      const recA = JSON.parse(localStorage.getItem(draftKey("proj_a"))!) as DurableDraft;
      const recB = JSON.parse(localStorage.getItem(draftKey("proj_b"))!) as DurableDraft;
      expect(recA.projectKey).toBe("proj_a");
      expect(recB.projectKey).toBe("proj_b");

      // clearDraft is scoped to its own parameter — clearing "proj_a" must not
      // touch "proj_b"'s record.
      clearDraft("proj_a");
      expect(localStorage.getItem(draftKey("proj_a"))).toBeNull();
      expect(localStorage.getItem(draftKey("proj_b"))).not.toBeNull();
    });

    it("the DurableDraft envelope carries projectKey/displayName/languageTag identity fields (future project-list seam)", () => {
      const base: StartKeyboard = {
        id: "proj_x",
        displayName: "Base Display Name",
        languages: ["yo"],
      } as StartKeyboard;
      useWorkingCopyStore.getState().instantiateFromStart(base, {
        vfs: createVirtualFS([]),
        ir: makeScaffoldedIR(),
      });

      // Spec 089: the envelope's displayName/languageTag derive from the
      // recorded decisions (project + identity), not session fields.
      {
        const record = useDecisionStore.getState().record;
        record({ id: "authoring-track", value: "copy", provenance: "asked" });
        record({ id: "project-display-name", value: "My Custom Keyboard", provenance: "asked" });
        record({ id: "project-keyboard-id", value: "proj_x", provenance: "asked" });
        record({ id: "language-name", value: "Test", provenance: "asked" });
        record({ id: "language-autonym", value: "Test", provenance: "asked" });
        record({ id: "language-code", value: "yo", provenance: "asked" });
        record({ id: "target-script", value: "Latn", provenance: "asked" });
      }

      saveDraft("proj_x");

      const rec = JSON.parse(localStorage.getItem(draftKey("proj_x"))!) as DurableDraft;
      expect(rec.projectKey).toBe("proj_x");
      // Track-1 scaffoldSpec.displayName wins over the base's own displayName.
      expect(rec.displayName).toBe("My Custom Keyboard");
      expect(rec.languageTag).toBe("yo-Latn");
    });

    // #1578: a same-session switch (no intervening reload) between a
    // Track-1 scaffolded project (A, whose label comes from the derived
    // scaffoldSpec — deriveProjectLabel's tier 1) and a plain adapted
    // project (B, whose label falls back to the base's own displayName)
    // must not let A's scaffoldSpec leak into B's derived label.
    // Spec 089: the scaffoldSpec is derived from the decision set, and the
    // envelope's per-project decision snapshot (088) is applied wholesale
    // on every `loadDraft` call — this pins that behavior so it can't
    // silently regress.
    it("switching FROM a Track-1 scaffolded project TO a plain one, in one session, does not leak the former's scaffoldSpec into the latter's label", () => {
      instantiateMinimal("proj_a");
      {
        const record = useDecisionStore.getState().record;
        record({ id: "authoring-track", value: "copy", provenance: "asked" });
        record({ id: "project-display-name", value: "Testish Keyboard", provenance: "asked" });
        record({ id: "project-keyboard-id", value: "proj_a", provenance: "asked" });
      }
      saveDraft("proj_a");
      expect(
        (JSON.parse(localStorage.getItem(draftKey("proj_a"))!) as DurableDraft).displayName,
      ).toBe("Testish Keyboard");

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      useDecisionStore.getState().reset();
      const baseB = {
        id: "proj_b",
        displayName: "French Basic",
        languages: [],
      } as unknown as StartKeyboard;
      useWorkingCopyStore.getState().instantiateFromStart(baseB, {
        vfs: createVirtualFS([]),
        ir: makeScaffoldedIR(),
      });
      saveDraft("proj_b");
      expect(
        (JSON.parse(localStorage.getItem(draftKey("proj_b"))!) as DurableDraft).displayName,
      ).toBe("French Basic");

      // The same-session switch: resume A, then resume B — as "My
      // keyboards"'s Resume action does, with no reload in between.
      expect(loadDraft("proj_a")).toBe(true);
      expect(deriveScaffoldSpec(getDecisionSnapshot())?.displayName).toBe("Testish Keyboard");

      expect(loadDraft("proj_b")).toBe(true);
      // B never scaffolded — its own decision snapshot has no project
      // records, so resuming it must clear A's leftover, not leave it standing.
      expect(deriveScaffoldSpec(getDecisionSnapshot())).toBeNull();

      saveDraft("proj_b");
      expect(
        (JSON.parse(localStorage.getItem(draftKey("proj_b"))!) as DurableDraft).displayName,
      ).toBe("French Basic");

      // Switching back confirms A's own record was never touched either.
      expect(loadDraft("proj_a")).toBe(true);
      expect(deriveScaffoldSpec(getDecisionSnapshot())?.displayName).toBe("Testish Keyboard");
    });
  });

  // ---------------------------------------------------------------------------
  // flushActiveDraft (km-review #3) — synchronous pre-OAuth-redirect save so the
  // durable draft can't lag the sessionStorage snapshot across the redirect.
  // ---------------------------------------------------------------------------
  describe("flushActiveDraft: synchronous save of the active project (km-review #3)", () => {
    it("persists the CURRENT store state immediately, with no debounce timer advance", () => {
      vi.useFakeTimers();
      const pk = "flush-current";
      instantiateMinimal(pk);
      setActiveProjectKey(pk);

      // Mutate AFTER any prior save so the change is un-persisted until flushed.
      useWorkingCopyStore.getState().lockDesktop();

      // No timer advance at all — flush must write synchronously (unlike the
      // 500ms autosave debounce).
      flushActiveDraft();

      const rec = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(rec.workingCopy.desktopLocked).toBe(true);
    });

    it("is a no-op (no throw, no write) when there is no active project", () => {
      clearActiveProjectKey();
      instantiateMinimal("flush-noactive");
      // Active pointer is absent, so flush resolves nothing to save.
      expect(() => flushActiveDraft()).not.toThrow();
      expect(localStorage.getItem(draftKey("flush-noactive"))).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // T029 — Article IV guard: the autosave subscription is a SEPARATE lightweight
  // timer, NOT a second validation debounce cycle and NOT a parallel validation
  // path. Two complementary assertions:
  //   (1) by inspection — draftPersistence.ts imports no validator/oracle and
  //       reuses no 300ms validate debounce; its own timer is the 500ms
  //       autosave window, distinct from DEBOUNCE_MS (300).
  //   (2) at runtime — a store mutation that fires the autosave performs exactly
  //       one localStorage write (serialize + setItem) and no validation work.
  // ---------------------------------------------------------------------------
  describe("T029/Article IV: autosave is an independent lightweight timer, not a second validate cycle", () => {
    it("draftPersistence.ts wires no validator/oracle and does not reuse the 300ms validate debounce (inspection)", () => {
      const raw = readFileSync(path.join(currentDir, "draftPersistence.ts"), "utf-8");
      // Strip comments first: the module's DOC PROSE deliberately names the
      // validator/useValidator/DEBOUNCE_MS to explain what the autosave is NOT,
      // so a raw text match would be a false positive. We assert against CODE.
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
        .replace(/^[ \t]*\/\/.*$/gm, ""); // whole-line // comments

      // No validation surface is imported or invoked from the persistence path.
      expect(code).not.toMatch(/validateWithOracle|runAllChecks/);
      expect(code).not.toMatch(/\buseValidator\b/);
      // It does not reuse the validator's 300ms debounce hook/constant — the
      // autosave timer is its OWN locally-declared 500ms window.
      expect(code).not.toMatch(/\buseDebounce\b/);
      expect(code).not.toMatch(/\bDEBOUNCE_MS\b/); // the 300ms validate constant
      expect(code).toMatch(/AUTOSAVE_DEBOUNCE_MS\s*=\s*500/);
    });

    it("the autosave debounce window (500ms) is distinct from the single validate cycle (300ms)", () => {
      // The validate cycle owns 300ms (Decision D3); the autosave owns 500ms.
      // A regression that folded autosave into the validate timer would collapse
      // these to one value — this pins them apart.
      expect(AUTOSAVE_DEBOUNCE_MS).toBe(500);
      expect(DEBOUNCE_MS).toBe(300);
      expect(AUTOSAVE_DEBOUNCE_MS).not.toBe(DEBOUNCE_MS);
    });

    it("an autosaved mutation performs exactly one localStorage write and zero validation work", () => {
      vi.useFakeTimers();
      const pk = "t029-no-validate";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk); // one synchronous install-time save
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      useWorkingCopyStore.getState().lockDesktop(); // schedules the autosave
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

      // The mutation produced a single draft write — no fan-out into a second
      // (validation) timer that would re-enter and write again.
      const draftWrites = setItemSpy.mock.calls.filter(([key]) => key === draftKey(pk));
      expect(draftWrites).toHaveLength(1);

      teardown();
    });
  });});

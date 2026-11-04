// draftPersistence tests (restore group) — split from draftPersistence.test.ts by behaviour.
// See draftPersistence.core.test.ts for the original coverage overview and the
// wasDraftRestoredThisBoot test-order note (that first-boot assertion lives there).

import { describe, it, expect, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { instantiateMinimal, makeScaffoldedIR } from "../test/draftSeeds.ts";
import { getCharacterInventoryValue, inventoryOps, resetInventoryDraft } from "../survey/useInventoryDraft.ts";
import { DEFAULT_PHASE_B_FONT } from "../survey/surveyStyles.ts";
import { DRAFT_VERSION, draftKey, saveDraft, loadDraft, applyRemoteDraft, installDraftAutosave, wasDraftRestoredThisBoot, restoredDraftSavedAt, AUTOSAVE_DEBOUNCE_MS, restoreSurveyAnswerSnapshot, type DurableDraft } from "./draftPersistence.ts";
import { makeIrWithRemovableRule, installDraftPersistenceHooks } from "./draftPersistence.testkit.ts";

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
  // km-triage (PR #1642): applyRemoteDraft drives the cloud-restore banner's
  // Resume button with untrusted server data, but had no dedicated coverage of
  // its VR-1/VR-2/VR-3-mirroring validation branches or its catch path.
  describe("applyRemoteDraft: cloud-restore banner Resume validation + apply", () => {
    it("applies a valid remote envelope, restoring both stores without touching the boot-restore flags", () => {
      const base: StartKeyboard = {
        id: "remote_valid_project",
        displayName: "Remote Valid",
        languages: ["en"],
      } as StartKeyboard;
      const ir = makeIrWithRemovableRule();
      useWorkingCopyStore.getState().instantiateFromStart(base, { vfs: createVirtualFS([]), ir });
      useWorkingCopyStore.getState().deleteNode("rule-s01-1");
      useSurveySessionStore.getState().advance("choose_base");

      saveDraft("remote_valid_project");
      const stored = localStorage.getItem(draftKey("remote_valid_project"));
      expect(stored).not.toBeNull();
      const envelope = JSON.parse(stored!) as DurableDraft;

      // Cold reset — nothing left to inherit from, and this is a REMOTE apply,
      // not a local loadDraft(), so localStorage is cleared first to prove the
      // restore came from the passed-in envelope, not a local record.
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      localStorage.clear();
      const wasRestoredBefore = wasDraftRestoredThisBoot();
      const savedAtBefore = restoredDraftSavedAt();

      expect(applyRemoteDraft(envelope)).toBe(true);

      const wc = useWorkingCopyStore.getState();
      expect(wc.instantiationMode).toBe("new-from-base");
      expect(wc.startKeyboard?.id).toBe("remote_valid_project");
      expect(wc.deletedNodeIds.has("rule-s01-1")).toBe(true);
      expect(useSurveySessionStore.getState().activeStepId).toBe("choose_base");

      // Per the function's own doc comment: never touches the local-boot flags.
      expect(wasDraftRestoredThisBoot()).toBe(wasRestoredBefore);
      expect(restoredDraftSavedAt()).toBe(savedAtBefore);
    });

    it("rejects a version-mismatched envelope without applying it", () => {
      const mismatched = { version: DRAFT_VERSION + 1, workingCopy: { instantiationMode: "new-from-base" }, traversal: {} } as unknown as DurableDraft;

      expect(applyRemoteDraft(mismatched)).toBe(false);
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
    });

    it("rejects an envelope with a missing/malformed workingCopy without applying it", () => {
      const missingWorkingCopy = {
        version: DRAFT_VERSION,
        workingCopy: null,
        traversal: {},
      } as unknown as DurableDraft;
      expect(applyRemoteDraft(missingWorkingCopy)).toBe(false);

      const nonObjectWorkingCopy = {
        version: DRAFT_VERSION,
        workingCopy: "not-an-object",
        traversal: {},
      } as unknown as DurableDraft;
      expect(applyRemoteDraft(nonObjectWorkingCopy)).toBe(false);

      // Uninstantiated AND not the pending slot: rejected the same way loadDraft's
      // VR-2 guard rejects it.
      const uninstantiatedNonPending = {
        version: DRAFT_VERSION,
        projectKey: "some_other_key",
        workingCopy: { instantiationMode: null },
        traversal: {},
      } as unknown as DurableDraft;
      expect(applyRemoteDraft(uninstantiatedNonPending)).toBe(false);
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
    });

    it("rejects an envelope with a missing/malformed traversal without applying it", () => {
      const missingTraversal = {
        version: DRAFT_VERSION,
        workingCopy: { instantiationMode: "new-from-base" },
        traversal: null,
      } as unknown as DurableDraft;

      expect(applyRemoteDraft(missingTraversal)).toBe(false);
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
    });

    it("returns false and leaves the stores untouched when null is passed (no cloud draft found)", () => {
      expect(applyRemoteDraft(null)).toBe(false);
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
    });

    it("catch path: an envelope that parses the shape checks but throws while applying (corrupt Base64 VFS entry) returns false and never partially restores", () => {
      const base: StartKeyboard = {
        id: "remote_corrupt_project",
        displayName: "Remote Corrupt",
        languages: [],
      } as unknown as StartKeyboard;
      const vfs = createVirtualFS([
        { path: "source/welcome/welcome.htm", content: new Uint8Array([1, 2, 3, 4]), isBinary: true },
      ]);
      useWorkingCopyStore.getState().instantiateFromStart(base, { vfs, ir: makeScaffoldedIR() });
      saveDraft("remote_corrupt_project");
      const stored = localStorage.getItem(draftKey("remote_corrupt_project"));
      expect(stored).not.toBeNull();
      const envelope = JSON.parse(stored!) as DurableDraft;

      const entries = (envelope.workingCopy as unknown as { startVfsEntries: Array<{ isBinary: boolean; content: string }> })
        .startVfsEntries;
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0]!.isBinary).toBe(true);
      entries[0]!.content = "!!!not-valid-base64!!!";

      useWorkingCopyStore.getState().reset();

      let result: boolean | undefined;
      expect(() => {
        result = applyRemoteDraft(envelope);
      }).not.toThrow();
      expect(result).toBe(false);
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
    });
  });

  // P1 regression (review finding 2): StudioShell's cloud-restore offer needs
  // the RESTORED draft's savedAt to compare against a cloud draft's, without
  // re-reading localStorage itself. restoredDraftSavedAt() is that accessor —
  // set alongside wasDraftRestoredThisBoot(), same lifetime, same "before
  // React mounts" guarantee.
  describe("restoredDraftSavedAt: the F5 cloud-offer freshness accessor", () => {
    it("is null before any successful loadDraft this boot (mirrors wasDraftRestoredThisBoot's own initial-state test)", () => {
      // NOTE: this only holds because no earlier test in this file has yet
      // performed a successful loadDraft() — same ordering caveat as the
      // very first test in this file (see the module header note).
      // Asserted here defensively, not as a claim about global ordering.
      if (wasDraftRestoredThisBoot()) return;
      expect(restoredDraftSavedAt()).toBeNull();
    });

    it("holds the restored envelope's savedAt after a successful loadDraft, distinct from Date.now() at call time", () => {
      const base: StartKeyboard = {
        id: "restored_savedat_project",
        displayName: "Restored SavedAt",
        languages: ["en"],
      } as StartKeyboard;
      useWorkingCopyStore.getState().instantiateFromStart(base, {
        vfs: createVirtualFS([]),
        ir: makeScaffoldedIR(),
      });

      const fixedSavedAt = 1_700_000_000_000; // an arbitrary, recognizable timestamp
      vi.spyOn(Date, "now").mockReturnValue(fixedSavedAt);
      saveDraft("restored_savedat_project");
      vi.restoreAllMocks();

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();

      expect(loadDraft("restored_savedat_project")).toBe(true);
      expect(restoredDraftSavedAt()).toBe(fixedSavedAt);
    });

    it("reflects only the MOST RECENT successful loadDraft — a second restore under a different key overwrites it", () => {
      const olderSavedAt = 1_600_000_000_000;
      const newerSavedAt = 1_650_000_000_000;

      useWorkingCopyStore.getState().instantiateFromStart(
        { id: "restored_savedat_a", displayName: "A", languages: ["en"] } as StartKeyboard,
        { vfs: createVirtualFS([]), ir: makeScaffoldedIR() },
      );
      vi.spyOn(Date, "now").mockReturnValue(olderSavedAt);
      saveDraft("restored_savedat_a");
      vi.restoreAllMocks();
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      expect(loadDraft("restored_savedat_a")).toBe(true);
      expect(restoredDraftSavedAt()).toBe(olderSavedAt);

      useWorkingCopyStore.getState().instantiateFromStart(
        { id: "restored_savedat_b", displayName: "B", languages: ["en"] } as StartKeyboard,
        { vfs: createVirtualFS([]), ir: makeScaffoldedIR() },
      );
      vi.spyOn(Date, "now").mockReturnValue(newerSavedAt);
      saveDraft("restored_savedat_b");
      vi.restoreAllMocks();
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      expect(loadDraft("restored_savedat_b")).toBe(true);
      expect(restoredDraftSavedAt()).toBe(newerSavedAt);
    });
  });

  describe("P0 fix: the build-list alphabet folds into the durable draft round-trip (decisions-carried since spec 090; legacy slice migrates at T025)", () => {
    it("restores the in-progress build-list alphabet on load, not an empty array (km-review P0 — no silent discard of the author's typed/toggled chars)", () => {
      const pk = "phaseb-draft-project";
      instantiateMinimal(pk);
      useSurveySessionStore.getState().setDiscoveryMethod("build-list");
      useSurveySessionStore.getState().setCharactersSubStage("B");
      inventoryOps("characters").setAll(["a", "b", "ɛ"]);

      saveDraft(pk);

      // Cold reset ALL THREE stores — nothing left to inherit from.
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      resetInventoryDraft();
      expect(getCharacterInventoryValue().chars).toEqual([]);

      expect(loadDraft(pk)).toBe(true);

      // The build-list screen substage/discoveryMethod resume as before...
      const session = useSurveySessionStore.getState();
      expect(session.discoveryMethod).toBe("build-list");
      expect(session.charactersSubStage).toBe("B");
      // ...AND the alphabet the author had already built is intact, not blanked.
      expect(getCharacterInventoryValue().chars).toEqual(["a", "b", "ɛ"]);
    });

    it("restores exemplar-attested digraphs alongside the alphabet, never into it", () => {
      const pk = "phaseb-draft-digraphs";
      instantiateMinimal(pk);
      inventoryOps("characters").seedFromProposal({
        resolvedTag: "ewo",
        source: "cldr",
        confidence: "approved",
        characters: [
          { char: "d", tier: "main", source: "cldr", confidence: "approved" },
          { char: "z", tier: "main", source: "cldr", confidence: "approved" },
        ],
        digraphs: ["dz", "kp"],
      });

      saveDraft(pk);
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      resetInventoryDraft();
      expect(getCharacterInventoryValue().exemplarDigraphs).toEqual([]);

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().exemplarDigraphs).toEqual(["dz", "kp"]);
      // The clusters are a fact about the orthography, not characters to type —
      // the alphabet still holds only their constituent letters.
      expect(getCharacterInventoryValue().chars).not.toContain("dz");
      expect(getCharacterInventoryValue().chars).toContain("d");
    });

    it("a legacy slice written before digraphs were recorded migrates to an empty list, not undefined (spec 090 T025 slice migration)", () => {
      const pk = "phaseb-draft-legacy-digraphs";
      instantiateMinimal(pk);
      saveDraft(pk);

      // Simulate a pre-T025 record: the inventory rides the legacy
      // phaseBDraft slice (here: no exemplarDigraphs field), and the
      // decisions slice carries no inventory records.
      const envelope = JSON.parse(localStorage.getItem(draftKey(pk))!) as Record<string, unknown>;
      const decisions = envelope.decisions as Record<string, unknown>;
      delete decisions["character-inventory"];
      delete decisions["invisibles-inventory"];
      envelope.phaseBDraft = { chars: ["a"] };
      localStorage.setItem(draftKey(pk), JSON.stringify(envelope));

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().exemplarDigraphs).toEqual([]);
      expect(getCharacterInventoryValue().chars).toEqual(["a"]);
    });

    it("a pre-fix record with no phaseBDraft field restores to an empty alphabet (backward compat — additive optional field, not a version bump)", () => {
      const pk = "phaseb-draft-legacy";
      instantiateMinimal(pk);
      saveDraft(pk);

      // Simulate a record written before this field existed.
      const envelope = JSON.parse(localStorage.getItem(draftKey(pk))!) as Record<string, unknown>;
      delete envelope.phaseBDraft;
      localStorage.setItem(draftKey(pk), JSON.stringify(envelope));

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      inventoryOps("characters").setAll(["stale"]); // must be cleared by restore, not left dangling

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().chars).toEqual([]);
    });

    it("a legacy slice with no selectedFont field migrates to DEFAULT_PHASE_B_FONT (backward compat — additive optional field, not a version bump)", () => {
      const pk = "phaseb-draft-legacy-font";
      instantiateMinimal(pk);
      saveDraft(pk);

      // Simulate a pre-T025 record whose slice predates selectedFont.
      const envelope = JSON.parse(localStorage.getItem(draftKey(pk))!) as Record<string, unknown>;
      const decisions = envelope.decisions as Record<string, unknown>;
      delete decisions["character-inventory"];
      delete decisions["invisibles-inventory"];
      envelope.phaseBDraft = { chars: ["a"] };
      localStorage.setItem(draftKey(pk), JSON.stringify(envelope));

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      inventoryOps("characters").setSelectedFont("charis-sil"); // must be overwritten by restore, not left dangling

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().selectedFont).toBe(DEFAULT_PHASE_B_FONT);
      expect(getCharacterInventoryValue().chars).toEqual(["a"]);
    });

    it("a malformed selectedFont in a legacy slice migrates to DEFAULT_PHASE_B_FONT and surfaces as a decision-trail orphan, never dropped (spec 090 T025)", () => {
      const pk = "phaseb-draft-malformed-font";
      instantiateMinimal(pk);
      saveDraft(pk);

      const envelope = JSON.parse(localStorage.getItem(draftKey(pk))!) as Record<string, unknown>;
      const decisions = envelope.decisions as Record<string, unknown>;
      delete decisions["character-inventory"];
      delete decisions["invisibles-inventory"];
      envelope.phaseBDraft = { chars: [], selectedFont: "comic-sans" };
      localStorage.setItem(draftKey(pk), JSON.stringify(envelope));

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      inventoryOps("characters").setSelectedFont("charis-sil");

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().selectedFont).toBe(DEFAULT_PHASE_B_FONT);
      const orphanIds = useDecisionLogStore
        .getState()
        .record.entries.map((e) => (e.payload.kind === "survey-answer" ? e.payload.questionId : null));
      expect(orphanIds).toContain("phaseBDraft.selectedFont");
    });

    it("a valid persisted selectedFont ('charis-sil') round-trips intact through save + load", () => {
      const pk = "phaseb-draft-valid-font";
      instantiateMinimal(pk);
      inventoryOps("characters").setSelectedFont("charis-sil");
      saveDraft(pk);

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      resetInventoryDraft();
      inventoryOps("characters").setSelectedFont(DEFAULT_PHASE_B_FONT);

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().selectedFont).toBe("charis-sil");
    });

    it("a valid persisted selectedFont ('andika') round-trips intact through save + load", () => {
      const pk = "phaseb-draft-valid-font-andika";
      instantiateMinimal(pk);
      inventoryOps("characters").setSelectedFont("andika");
      saveDraft(pk);

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      resetInventoryDraft();
      inventoryOps("characters").setSelectedFont(DEFAULT_PHASE_B_FONT);

      expect(loadDraft(pk)).toBe(true);
      expect(getCharacterInventoryValue().selectedFont).toBe("andika");
    });

    it("installDraftAutosave also debounce-saves an inventory decision mutation (same 500ms window, no new timer)", () => {
      vi.useFakeTimers();
      const pk = "phaseb-draft-autosave";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      inventoryOps("characters").add("q");

      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
      const saved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect((saved.decisions?.["character-inventory"]?.value as { chars: string[] }).chars).toEqual(["q"]);

      teardown();
    });
  });

  // ---------------------------------------------------------------------------
  // spec 079 R-01/FR-032/FR-034: surveyAnswerStore rides the same durable draft
  // and the same autosave timer as everything else.
  // ---------------------------------------------------------------------------
  describe("restoreSurveyAnswerSnapshot (spec 079 FR-032): tolerant restore, symmetric with restorePhaseBDraftSnapshot", () => {
    function validAnswer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        value: "x",
        answerType: "text",
        origin: "confirmed",
        stage: "draft",
        evidenceKey: null,
        screenId: "q1",
        savedAt: 123,
        ...overrides,
      };
    }

    it("keeps a saved answer's proposal, and drops only a malformed proposal (never the answer)", () => {
      const stepWith = (answers: Record<string, unknown>) => ({
        steps: {
          phase_f_helpdocs: { answers, position: null, status: { kind: "in-progress" }, lastRecorded: {} },
        },
        recordedScreenOf: {},
      });
      const restored = restoreSurveyAnswerSnapshot(
        stepWith({
          kept: validAnswer({ origin: "proposed", proposal: { value: "x", source: "identity" } }),
          plain: validAnswer({ origin: "proposed", proposal: { value: "false" } }),
          badSource: validAnswer({ origin: "overturned", proposal: { value: "y", source: "not-a-source" } }),
        }),
      );
      const answers = restored.steps["phase_f_helpdocs"]?.answers;

      expect(answers?.["kept"]?.proposal).toEqual({ value: "x", source: "identity" });
      expect(answers?.["plain"]?.proposal).toEqual({ value: "false" });
      expect(answers?.["badSource"]?.value).toBe("x");
      expect(answers?.["badSource"]?.proposal).toBeUndefined();
    });

    it("keeps an unknown step id verbatim (forward-compat — a future step this build doesn't know about)", () => {
      const raw = {
        steps: {
          some_future_step: {
            answers: { q1: validAnswer() },
            position: "q1",
            status: { kind: "in-progress" },
            lastRecorded: {},
          },
        },
        recordedScreenOf: {},
      };

      const restored = restoreSurveyAnswerSnapshot(raw);

      expect(restored.steps["some_future_step"]?.answers["q1"]?.value).toBe("x");
      expect(restored.steps["some_future_step"]?.position).toBe("q1");
    });

    it("drops a malformed SavedAnswer with a bad answerType, keeping the rest of the step's good answers", () => {
      const raw = {
        steps: {
          identity: {
            answers: {
              good: validAnswer({ screenId: "good" }),
              bad: validAnswer({ answerType: "not-a-real-answer-type", screenId: "bad" }),
            },
            position: null,
            status: { kind: "in-progress" },
            lastRecorded: {},
          },
        },
        recordedScreenOf: {},
      };

      const restored = restoreSurveyAnswerSnapshot(raw);

      expect(restored.steps["identity"]?.answers["good"]?.value).toBe("x");
      expect(restored.steps["identity"]?.answers["bad"]).toBeUndefined();
    });

    it("drops a malformed SavedAnswer with a non-string screenId", () => {
      const raw = {
        steps: {
          identity: {
            answers: { bad: validAnswer({ screenId: 42 }) },
            position: null,
            status: { kind: "in-progress" },
            lastRecorded: {},
          },
        },
        recordedScreenOf: {},
      };

      expect(restoreSurveyAnswerSnapshot(raw).steps["identity"]?.answers["bad"]).toBeUndefined();
    });

    it("drops a malformed SavedAnswer with a bad origin", () => {
      const raw = {
        steps: {
          identity: {
            answers: { bad: validAnswer({ origin: "invented" }) },
            position: null,
            status: { kind: "in-progress" },
            lastRecorded: {},
          },
        },
        recordedScreenOf: {},
      };

      expect(restoreSurveyAnswerSnapshot(raw).steps["identity"]?.answers["bad"]).toBeUndefined();
    });

    it("drops a malformed SavedAnswer with a bad stage", () => {
      const raw = {
        steps: {
          identity: {
            answers: { bad: validAnswer({ stage: "half-done" }) },
            position: null,
            status: { kind: "in-progress" },
            lastRecorded: {},
          },
        },
        recordedScreenOf: {},
      };

      expect(restoreSurveyAnswerSnapshot(raw).steps["identity"]?.answers["bad"]).toBeUndefined();
    });

    it("yields an empty store when surveyAnswers is absent from the envelope (FR-032 — a pre-079 draft)", () => {
      expect(restoreSurveyAnswerSnapshot(undefined)).toEqual({ steps: {}, recordedScreenOf: {} });
    });
  });});

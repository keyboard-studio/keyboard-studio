// draftPersistence tests (migration group) — split from draftPersistence.test.ts by behaviour.
// See draftPersistence.core.test.ts for the original coverage overview and the
// wasDraftRestoredThisBoot test-order note (that first-boot assertion lives there).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useSurveyAnswerStore, getSurveyAnswerSnapshot } from "../stores/surveyAnswerStore.ts";
import { getDecisionSnapshot } from "../stores/decisionStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { instantiateMinimal } from "../test/draftSeeds.ts";
import { getCharacterInventoryValue } from "../survey/useInventoryDraft.ts";
import { DRAFT_VERSION, draftKey, saveDraft, loadDraft, applyRemoteDraft, setActiveProjectKey, clearActiveProjectKey, installDraftAutosave, AUTOSAVE_DEBOUNCE_MS, listDrafts, reconcileProjectIndex, DRAFT_INDEX_KEY, recordProjectSubmission, migrateDraftEnvelope, type DurableDraft } from "./draftPersistence.ts";
import { useTestingStore } from "../stores/testingStore.ts";
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
  describe("US3/SC-003: reconcileProjectIndex adopts pre-index drafts (zero silent data loss)", () => {
    /**
     * Seed a genuine main-era draft: write it through the real `saveDraft`
     * path, then drop `ks.draftIndex.v1`. That is exactly the on-disk state of
     * every draft an author saved before "My keyboards" shipped — a valid
     * `ks.draft.<key>.v1` record with no index row — without hand-rolling an
     * envelope shape that could drift from the real one.
     */
    function seedPreIndexDraft(projectKey: string): void {
      instantiateMinimal(projectKey);
      saveDraft(projectKey);
      localStorage.removeItem(DRAFT_INDEX_KEY);
      clearActiveProjectKey();
      useWorkingCopyStore.getState().reset();
    }

    it("lists a draft written before the index existed (the SC-003 gate)", () => {
      seedPreIndexDraft("legacy-kbd");

      // Precondition: the record is on disk but the index is empty — without
      // reconciliation this draft is unreachable from "My keyboards".
      expect(localStorage.getItem(draftKey("legacy-kbd"))).not.toBeNull();
      expect(localStorage.getItem(DRAFT_INDEX_KEY)).toBeNull();

      const listed = listDrafts();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.projectKey).toBe("legacy-kbd");
      expect(listed[0]?.status).toBe("draft");
      expect(listed[0]?.prUrl).toBeNull();
      expect(typeof listed[0]?.savedAt).toBe("number");
    });

    it("is idempotent — a second pass adopts nothing and creates no duplicate row", () => {
      seedPreIndexDraft("idem-kbd");

      expect(reconcileProjectIndex()).toBe(1);
      expect(reconcileProjectIndex()).toBe(0);
      expect(listDrafts().filter((e) => e.projectKey === "idem-kbd")).toHaveLength(1);
    });

    it("adopts every pre-index record, not just the first", () => {
      seedPreIndexDraft("kbd-a");
      seedPreIndexDraft("kbd-b");
      seedPreIndexDraft("kbd-c");

      expect(reconcileProjectIndex()).toBe(3);
      expect(listDrafts().map((e) => e.projectKey).sort()).toEqual(["kbd-a", "kbd-b", "kbd-c"]);
    });

    it("leaves an already-indexed row alone — a submitted project is not reverted to draft", async () => {
      const pk = "submitted-kbd";
      instantiateMinimal(pk);
      saveDraft(pk);
      await recordProjectSubmission("https://github.com/x/y/pull/9", null);
      const before = listDrafts().find((e) => e.projectKey === pk);
      expect(before?.status).toBe("submitted");

      expect(reconcileProjectIndex()).toBe(0);
      expect(listDrafts().find((e) => e.projectKey === pk)).toEqual(before);
    });

    it("ignores the active-project pointer, the index key itself, and unrelated keys", () => {
      setActiveProjectKey("some-project");
      localStorage.setItem("ks.visited", "1");
      localStorage.setItem("unrelated", "{}");

      expect(reconcileProjectIndex()).toBe(0);
      expect(listDrafts()).toEqual([]);
    });

    it("skips a version-mismatched record WITHOUT deleting it (VR-1 stays loadDraft's call)", () => {
      const stale = { version: DRAFT_VERSION + 1, savedAt: 1, projectKey: "stale" };
      localStorage.setItem(draftKey("stale"), JSON.stringify(stale));

      expect(reconcileProjectIndex()).toBe(0);
      expect(listDrafts()).toEqual([]);
      // Enumeration must not destroy data — the record is still there for
      // loadDraft to discard when the author actually opens it.
      expect(localStorage.getItem(draftKey("stale"))).not.toBeNull();
    });

    it("skips a malformed record without throwing and leaves it in place", () => {
      localStorage.setItem(draftKey("corrupt"), "{not json");

      expect(() => reconcileProjectIndex()).not.toThrow();
      expect(listDrafts()).toEqual([]);
      expect(localStorage.getItem(draftKey("corrupt"))).toBe("{not json");
    });

    it("skips a record whose working copy was never really instantiated (VR-2)", () => {
      // loadDraft refuses such a record, so listing it would render a card
      // whose Resume button does nothing.
      const notInstantiated = {
        version: DRAFT_VERSION,
        savedAt: 1,
        projectKey: "empty",
        displayName: null,
        languageTag: null,
        workingCopy: { instantiationMode: null },
        traversal: { activeStepId: "identity" },
      };
      localStorage.setItem(draftKey("empty"), JSON.stringify(notInstantiated));

      expect(reconcileProjectIndex()).toBe(0);
      expect(listDrafts()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // spec 052 FR-021 / SC-010 — a pre-feature draft loads UNMIGRATED
  // -------------------------------------------------------------------------
  //
  // Spec 052 replaced the marks station's answer type outright
  // (MentalModelAnswer -> MarkTreatmentAnswer). The reason that is safe for
  // saved drafts is a claim about WHAT PERSISTS: the station's answers are
  // transient React state and never reach the draft — only the DERIVED
  // `marksWorklist` and `marksOutputForm` do, and `PlacementWorklist`'s shape
  // is unchanged (a promoted composed character occupies the same
  // `ownLetterUnits` slot a composed unit already occupied).
  //
  // This test makes that claim falsifiable rather than merely asserted: it
  // saves a draft whose phase result is byte-for-byte what a PRE-052 marks
  // series produced — worklist + output form, and NO `computedAxes` — and
  // requires it to load back identical, with no migration step and no
  // injected default.
  describe("spec 052 FR-021/SC-010: a draft saved before the marks-treatment change loads unmigrated", () => {
    it("round-trips a pre-052 marks phase result unchanged — worklist shape intact, no computedAxes invented", () => {
      const pk = "pre-052-draft-project";
      instantiateMinimal(pk);

      // Exactly the shape MarksSeriesStep emitted before spec 052: the derived
      // worklist and the output form, with computedAxes ABSENT (its omission
      // was the US4 defect, and an old draft must not acquire one on load).
      const preFeatureMarksResult = {
        phase: "C",
        answers: [],
        marksWorklist: {
          ownLetterUnits: ["a", "e", "é"],
          markUnits: [{ mark: "́", inputOrder: "postfix" }],
          blockedCombinations: [{ base: "k", mark: "́" }],
        },
        marksOutputForm: "ready-made",
      } as unknown as SurveyPhaseResult;

      useWorkingCopyStore.getState().recordPhase(preFeatureMarksResult);
      saveDraft(pk);

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      expect(loadDraft(pk)).toBe(true);

      const restored = useWorkingCopyStore
        .getState()
        .phaseResults.find((r) => r.phase === "C");
      expect(restored).toBeDefined();

      // The worklist survives byte-identically — no field added, renamed, or
      // retyped, so no migration was needed or performed.
      expect(restored?.marksWorklist).toEqual(preFeatureMarksResult.marksWorklist);
      expect(restored?.marksOutputForm).toBe("ready-made");

      // And nothing was invented on the way in: an old draft carries no
      // computedAxes, and load must not fabricate one (a fabricated A4 would
      // silently change strategy selection for every pre-052 project).
      expect(restored?.computedAxes).toBeUndefined();
    });

    it("the dual-reachability worklist a post-052 answer produces persists through the same path", () => {
      // The other half of the compatibility claim: the NEW state — a mark unit
      // AND its promoted composed characters as keyed units at the same time —
      // needs no schema change to persist either.
      const pk = "post-052-draft-project";
      instantiateMinimal(pk);

      const dualReachable = {
        phase: "C",
        answers: [],
        marksWorklist: {
          ownLetterUnits: ["a", "e", "á", "é"],
          markUnits: [{ mark: "́", inputOrder: "prefix" }],
          blockedCombinations: [],
        },
        marksOutputForm: "base-plus-mark",
        computedAxes: { diacriticBehavior: "stacking-combining", markInputOrder: "prefix" },
      } as unknown as SurveyPhaseResult;

      useWorkingCopyStore.getState().recordPhase(dualReachable);
      saveDraft(pk);

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      expect(loadDraft(pk)).toBe(true);

      const restored = useWorkingCopyStore
        .getState()
        .phaseResults.find((r) => r.phase === "C");
      expect(restored?.marksWorklist).toEqual(dualReachable.marksWorklist);
      expect(restored?.computedAxes).toEqual(dualReachable.computedAxes);
    });
  });


  // -------------------------------------------------------------------------
  // Spec 079 US4 (T068, T069) — answers and positions survive a reload
  // -------------------------------------------------------------------------

  describe("spec 079 US4 — answers and positions survive a reload", () => {
    function saved(value: string | boolean | string[], screenId: string, stage: "draft" | "confirmed" = "confirmed") {
      return {
        value,
        answerType: (Array.isArray(value) ? "char-list" : typeof value === "boolean" ? "boolean" : "select") as
          | "char-list"
          | "boolean"
          | "select",
        origin: "confirmed" as const,
        stage,
        evidenceKey: `key-${screenId}`,
        screenId,
      };
    }

    it("T068 (FR-053): partial marks answers at station 3 and a half-answered identity question round-trip through the autosave path exactly", () => {
      vi.useFakeTimers();
      const pk = "us4-reload-roundtrip";
      instantiateMinimal(pk);
      const teardown = installDraftAutosave(pk);

      const answers = useSurveyAnswerStore.getState();
      answers.saveAnswer("marks", "marks.attachments.́", saved(["a", "e"], "attachments"));
      answers.saveAnswer("marks", "marks.treatment.acute", saved("dead-key", "treatment"));
      answers.saveAnswer("marks", "marks.stacking.allowed", saved(false, "stacking", "draft"));
      answers.setPosition("marks", "stacking");
      answers.markScreenRecorded("marks", "attachments", "hash-1");
      answers.setRecordedScreen("entry-1", "attachments");
      answers.saveAnswer("identity", "il_language_name", saved("Ewondo", "il_language_name", "draft"));
      answers.setPosition("identity", "il_target_script");

      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
      teardown();
      const before = JSON.parse(JSON.stringify(getSurveyAnswerSnapshot())) as ReturnType<typeof getSurveyAnswerSnapshot>;
      expect(Object.keys(before.steps["marks"]?.answers ?? {})).toHaveLength(3);

      useSurveyAnswerStore.getState().reset();
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      expect(useSurveyAnswerStore.getState().steps).toEqual({});

      expect(loadDraft(pk)).toBe(true);
      const after = getSurveyAnswerSnapshot();
      expect(after.steps["marks"]).toEqual(before.steps["marks"]);
      expect(after.steps["identity"]).toEqual(before.steps["identity"]);
      expect(after.steps["marks"]?.position).toBe("stacking");
      expect(after.steps["identity"]?.position).toBe("il_target_script");
      expect(after.recordedScreenOf).toEqual({ "entry-1": "attachments" });
    });

    it("T069 (FR-032, US4 scenario 3): a checked-in pre-079 draft restores cleanly — empty answer store, no stamp invented; its stored phase answers are inert and clear at the next record (spec 090 T063)", () => {
      const fixture = readFileSync(path.join(currentDir, "__fixtures__", "pre079-draft.json"), "utf8");
      const envelope = JSON.parse(fixture) as Record<string, unknown> & { workingCopy: Record<string, unknown>; phaseBDraft: Record<string, unknown> };
      // The fixture really is pre-079: none of the three additive fields.
      expect(envelope.surveyAnswers).toBeUndefined();
      expect(envelope.workingCopy.phaseAnswersByStep).toBeUndefined();
      expect(envelope.phaseBDraft.alphabetEvidenceKey).toBeUndefined();

      // Answers from a previous project must not survive into this one.
      useSurveyAnswerStore.getState().saveAnswer("identity", "stale", saved("x", "stale"));
      localStorage.setItem(draftKey("pre079"), fixture);

      expect(() => loadDraft("pre079")).not.toThrow();
      expect(useSurveyAnswerStore.getState().steps).toEqual({});
      expect(useSurveyAnswerStore.getState().recordedScreenOf).toEqual({});
      expect(getCharacterInventoryValue().chars).toEqual(["a", "ŋ"]);
      // No base in the fixture's traversal, so nothing to derive a stamp from.
      expect(getCharacterInventoryValue().alphabetEvidenceKey).toBeUndefined();

      // Spec 090 T063: the restored phase-C answers sit in the slot as inert
      // legacy data (no production reader remains), the retired sidecar
      // never reappears, and the next recordPhase clears the slot's answers
      // — decision records are the only answer state now.
      const phaseC = () => useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C");
      expect(phaseC()?.answers.map((a) => a.questionId)).toEqual(["invisibles.u200c"]);
      expect("phaseAnswersByStep" in useWorkingCopyStore.getState()).toBe(false);
      useWorkingCopyStore
        .getState()
        .recordPhase(
          { phase: "C", answers: [{ questionId: "convenience.x", answerType: "boolean", value: false }] },
          { stepId: "convenience" },
        );
      expect(phaseC()?.answers).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Spec 088: v1 → v2 migration (T009; US3's end-to-end tests live in the
  // US3 section added with T027–T029).
  // -------------------------------------------------------------------------
  describe("spec 088 v1 migration (migrateDraftEnvelope)", () => {
    const fixtureRaw = readFileSync(
      path.join(currentDir, "__fixtures__", "v1-draft-18e63aa4.json"),
      "utf8",
    );

    it("maps the fixture's identity/track/project_name answers onto decision ids", () => {
      const result = migrateDraftEnvelope(JSON.parse(fixtureRaw));
      expect(result).not.toBeNull();
      const decisions = result!.envelope.decisions ?? {};
      expect(decisions["language-code"]).toMatchObject({ value: "fr", provenance: "asked", step: "identity" });
      expect(decisions["copyright-holder"]).toMatchObject({ value: "Fixture Author", provenance: "asked", step: "identity" });
      expect(decisions["authoring-track"]).toMatchObject({ value: "copy", provenance: "asked", step: "track" });
      expect(decisions["project-display-name"]).toMatchObject({ value: "Fixture Keyboard", provenance: "asked", step: "project_name" });
      expect(decisions["project-keyboard-id"]).toMatchObject({ value: "fixture_keyboard", provenance: "asked", step: "project_name" });
      expect(result!.migrationOrphans).toEqual([]);
      // The migrated surveyAnswers slice holds no survey-question answers.
      const steps = result!.envelope.surveyAnswers?.steps ?? {};
      for (const stepId of ["identity", "track", "project_name"]) {
        expect(steps[stepId]?.answers ?? {}).toEqual({});
      }
    });

    it("is an identity pass-through for a current-version envelope and null for non-objects", () => {
      const v2 = { version: 2, savedAt: 1 };
      expect(migrateDraftEnvelope(v2)?.envelope).toEqual(v2);
      expect(migrateDraftEnvelope(null)).toBeNull();
      expect(migrateDraftEnvelope("nope")).toBeNull();
    });
  });

  describe("spec 088 US3 — v1 draft end-to-end (SC-003) + orphan surfacing (T030)", () => {
    const fixtureRaw = readFileSync(
      path.join(currentDir, "__fixtures__", "v1-draft-18e63aa4.json"),
      "utf8",
    );
    const V1_KEY = "ks.draft.fixture_keyboard.v1";

    interface V1FixtureStep {
      answers?: Record<string, { value?: unknown; [k: string]: unknown }>;
    }
    interface V1FixtureDraft {
      surveyAnswers?: { steps?: Record<string, V1FixtureStep> };
      traversal?: { selectedTrack?: string };
      [k: string]: unknown;
    }

    function fixtureVariant(mutate: (draft: V1FixtureDraft) => void): string {
      const draft = JSON.parse(fixtureRaw) as V1FixtureDraft;
      mutate(draft);
      return JSON.stringify(draft);
    }

    it("T027: loadDraft finds the .v1 key, migrates it, and opens the project with the answers as decisions", () => {
      localStorage.setItem(V1_KEY, fixtureRaw);

      expect(loadDraft("fixture_keyboard")).toBe(true);

      const decisions = getDecisionSnapshot();
      expect(decisions["language-code"]).toMatchObject({ value: "fr", step: "identity" });
      expect(decisions["copyright-holder"]).toMatchObject({ value: "Fixture Author" });
      expect(decisions["authoring-track"]).toMatchObject({ value: "copy" });
      expect(decisions["project-display-name"]).toMatchObject({ value: "Fixture Keyboard" });
      expect(decisions["project-keyboard-id"]).toMatchObject({ value: "fixture_keyboard" });
      // The project actually opened: the working copy was restored.
      expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");
    });

    it("T028: an answer whose question id is absent from the registry becomes exactly one orphan — full accounting", () => {
      const variant = fixtureVariant((draft) => {
        const answers = draft.surveyAnswers?.steps?.["identity"]?.answers;
        if (answers) {
          answers["zz_removed_question"] = {
            value: "orphan-value",
            answerType: "text",
            origin: "confirmed",
            stage: "confirmed",
            evidenceKey: null,
            screenId: "capture",
            savedAt: 1791334913771,
          };
        }
      });

      const result = migrateDraftEnvelope(JSON.parse(variant));
      expect(result).not.toBeNull();
      expect(result!.migrationOrphans).toEqual([
        { questionId: "zz_removed_question", stepId: "identity", value: "orphan-value" },
      ]);

      // 100% accounting: 6 v1 answers = 5 decision records + 0 retained
      // gallery answers (the fixture has no settles-step answers) + 1 orphan.
      const totalAnswers = Object.values(
        (JSON.parse(variant) as V1FixtureDraft).surveyAnswers?.steps ?? {},
      ).reduce(
        (n: number, step: V1FixtureStep) => n + Object.keys(step.answers ?? {}).length,
        0,
      );
      const recordCount = Object.keys(result!.envelope.decisions ?? {}).length;
      const retainedCount = Object.values(result!.envelope.surveyAnswers?.steps ?? {}).reduce(
        (n: number, step) => n + Object.keys(step.answers ?? {}).length,
        0,
      );
      expect(totalAnswers).toBe(6);
      expect(recordCount + retainedCount + result!.migrationOrphans.length).toBe(totalAnswers);
    });

    it("T029: a session-field/answer disagreement migrates with the session value winning, and logs it", () => {
      const variant = fixtureVariant((draft) => {
        if (draft.traversal) draft.traversal.selectedTrack = "adapt"; // track_choice answer stays "copy"
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const result = migrateDraftEnvelope(JSON.parse(variant));
        expect(result!.envelope.decisions?.["authoring-track"]).toMatchObject({ value: "adapt" });
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("session field for authoring-track disagrees"),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it("T030: loading a v1 draft with an orphan writes it to the decision trail, carrying its value, exactly once", () => {
      const variant = fixtureVariant((draft) => {
        const answers = draft.surveyAnswers?.steps?.["identity"]?.answers;
        if (answers) {
          answers["zz_removed_question"] = {
            value: "orphan-value",
            answerType: "text",
            origin: "confirmed",
            stage: "confirmed",
            evidenceKey: null,
            screenId: "capture",
            savedAt: 1791334913771,
          };
        }
      });
      localStorage.setItem(V1_KEY, variant);

      expect(loadDraft("fixture_keyboard")).toBe(true);

      const orphanEntries = () =>
        useDecisionLogStore.getState().record.entries.filter(
          (e) => e.payload.kind === "survey-answer" && e.payload.questionId === "zz_removed_question",
        );
      expect(orphanEntries()).toHaveLength(1);
      expect(orphanEntries()[0]).toMatchObject({
        stepId: "identity",
        provenance: { agency: "hand-set" },
        payload: { kind: "survey-answer", questionId: "zz_removed_question", value: "orphan-value" },
      });

      // Re-applying the same v1 draft does not duplicate the trail entry.
      expect(loadDraft("fixture_keyboard")).toBe(true);
      expect(orphanEntries()).toHaveLength(1);
    });
  });
});

describe("spec 094: the testing record rides the draft", () => {
  const testing = () => useTestingStore.getState();
  const recordOneBuild = (fingerprint = "a".repeat(64)) =>
    testing().recordBuild({ version: "0.1", fingerprint, decisionCursor: 0, changedSections: [] });

  beforeEach(() => {
    testing().reset();
  });

  it("round-trips builds and reports through save, reset and load (SC-005)", () => {
    instantiateMinimal("testing_rt");
    recordOneBuild();
    testing().addReport({ text: "wrong vowel", foundInBuild: 1, sectionId: "rules" });
    const before = testing().snapshot();
    saveDraft("testing_rt");

    testing().reset();
    useWorkingCopyStore.getState().reset();
    expect(loadDraft("testing_rt")).toBe(true);
    expect(testing().snapshot()).toEqual(before);
  });

  it("a draft without a testing field loads with an empty record, never another project's", () => {
    instantiateMinimal("testing_none");
    saveDraft("testing_none");
    const stored = JSON.parse(localStorage.getItem(draftKey("testing_none"))!) as DurableDraft;
    expect(stored).not.toHaveProperty("testing");

    recordOneBuild(); // live state from some other project
    expect(loadDraft("testing_none")).toBe(true);
    expect(testing().snapshot()).toBeUndefined();
  });

  it("applyRemoteDraft merges with the local record stored under the same key", () => {
    instantiateMinimal("testing_merge");
    recordOneBuild("1".repeat(64));
    saveDraft("testing_merge");
    const localBuild = testing().builds[0]!;

    const remote = JSON.parse(localStorage.getItem(draftKey("testing_merge"))!) as DurableDraft;
    remote.testing = {
      nextBuildNumber: 2,
      builds: [{ ...localBuild, buildId: "feedfacefeedface", fingerprint: "2".repeat(64) }],
      reports: [],
    };

    testing().reset();
    expect(applyRemoteDraft(remote)).toBe(true);
    expect(testing().builds.map((b) => b.buildId).sort()).toEqual([localBuild.buildId, "feedfacefeedface"].sort());
    expect(testing().nextBuildNumber).toBe(2);
  });

  it("applyRemoteDraft for project B never merges in project A's live builds", () => {
    instantiateMinimal("testing_b");
    saveDraft("testing_b");
    const remoteB = JSON.parse(localStorage.getItem(draftKey("testing_b"))!) as DurableDraft;
    remoteB.testing = {
      nextBuildNumber: 2,
      builds: [
        {
          buildId: "bbbbbbbbbbbbbbbb",
          number: 1,
          version: "0.1",
          createdAt: "2026-10-09T00:00:00.000Z",
          fingerprint: "b".repeat(64),
          decisionCursor: 0,
          changedSections: [],
        },
      ],
      reports: [],
    };

    recordOneBuild("a".repeat(64)); // project A, live
    expect(applyRemoteDraft(remoteB)).toBe(true);
    expect(testing().builds.map((b) => b.buildId)).toEqual(["bbbbbbbbbbbbbbbb"]);
  });

  it("a submitted project freezes the record and writes nothing more", async () => {
    instantiateMinimal("testing_frozen");
    recordOneBuild();
    saveDraft("testing_frozen");
    await recordProjectSubmission("https://github.com/x/y/pull/1", null);

    expect(testing().frozen).toBe(true);
    expect(recordOneBuild("c".repeat(64))).toBeNull();

    const before = localStorage.getItem(draftKey("testing_frozen"));
    setActiveProjectKey("testing_frozen");
    saveDraft("testing_frozen");
    expect(localStorage.getItem(draftKey("testing_frozen"))).toBe(before);
  });

  it("autosave fires on a testing-store change, on the same debounce", () => {
    vi.useFakeTimers();
    instantiateMinimal("testing_autosave");
    const teardown = installDraftAutosave("testing_autosave");

    recordOneBuild();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    const stored = JSON.parse(localStorage.getItem(draftKey("testing_autosave"))!) as DurableDraft;
    expect(stored.testing?.builds).toHaveLength(1);

    teardown();
  });
});

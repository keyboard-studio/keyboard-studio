// A draft saved BEFORE the decision-backend reordering (spec 087) must still
// load unchanged on the current build.
//
// Why no migration is needed (evidence this test pins):
//   - The persisted envelope is DRAFT_VERSION 1 and the modules that define and
//     restore its shape (draftPersistence, draftTypes, surveyAnswerStore,
//     surveySessionStore, decisionLogStore) are untouched by the reordering.
//   - Everything persisted is keyed by STEP ID and ANSWER ID, never by position
//     or by an order list. The reordering only changes how STEP_ORDER is
//     derived; the set of step ids is identical, and STEP_ORDER is used only to
//     rank owners when concatenating phase answers, never written to a draft.
//
// The fixture was written by the real `saveDraft` with the stores seeded the way
// the pre-reordering flow left them (persistence code is byte-identical on both
// sides, so the envelope shape is the one origin/main produces).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { STEP_ORDER } from "../steps/stepOrder.ts";
import { draftKey, loadDraft, type DurableDraft } from "./draftPersistence.ts";

vi.mock("./serverDraftStore.ts", () => ({
  saveServerDraft: vi.fn(async () => true),
  saveServerDraftBeacon: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureText = readFileSync(path.join(here, "__fixtures__", "prePrDraft.json"), "utf8");
const fixture = JSON.parse(fixtureText) as DurableDraft;

// The step ids the manifest listed before the reordering (origin/main's STEP_ORDER).
const PRE_REORDER_STEP_IDS = [
  "identity", "layout", "choose_base", "track", "project_name", "characters",
  "marks", "punctuation", "invisibles", "convenience", "carve", "deadkeys",
  "rules", "mechanisms", "touch_seed_source", "touch", "help", "package",
];

describe("pre-reordering draft loads on the current build", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();
    useSurveyAnswerStore.getState().reset();
  });

  it("the reordering changed the order of steps, not the set of step ids", () => {
    expect([...STEP_ORDER].sort()).toEqual([...PRE_REORDER_STEP_IDS].sort());
  });

  it("every step id the draft persists is still a known step", () => {
    const persisted = new Set<string>([
      fixture.traversal.activeStepId,
      ...fixture.traversal.history,
      ...fixture.traversal.visited,
      ...Object.keys(fixture.surveyAnswers?.steps ?? {}),
    ]);
    expect(persisted.size).toBeGreaterThan(5);
    for (const id of persisted) expect(STEP_ORDER).toContain(id);
  });

  it("loadDraft restores traversal and every saved answer verbatim", () => {
    localStorage.setItem(draftKey(fixture.projectKey), fixtureText);

    expect(loadDraft(fixture.projectKey)).toBe(true);

    const session = useSurveySessionStore.getState();
    expect(session.activeStepId).toBe(fixture.traversal.activeStepId);
    expect(session.history).toEqual(fixture.traversal.history);
    expect(session.visited).toEqual(fixture.traversal.visited);
    expect(useWorkingCopyStore.getState().instantiationMode).toBe(fixture.workingCopy.instantiationMode);

    const restored = useSurveyAnswerStore.getState().steps;
    const saved = fixture.surveyAnswers?.steps ?? {};
    expect(Object.keys(restored).sort()).toEqual(Object.keys(saved).sort());
    for (const [stepId, step] of Object.entries(saved)) {
      expect(restored[stepId]?.answers).toEqual(step.answers);
      expect(restored[stepId]?.position).toBe(step.position);
      expect(restored[stepId]?.status).toEqual(step.status);
    }
  });
});

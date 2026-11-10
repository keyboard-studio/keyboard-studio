// A draft saved BEFORE the decision-backend reordering (spec 087) must still
// load on the current build.
//
// What spec 087 needed (and this test originally pinned): no migration —
// everything persisted is keyed by STEP ID and ANSWER ID, never by position
// or by an order list, and the reordering only changed how STEP_ORDER is
// derived.
//
// What spec 088 changed (the premise update recorded here): a DRAFT_VERSION 1
// envelope is now MIGRATED on load (v1→v2). Traversal, position, and status
// still restore verbatim, and every answer VALUE survives — but survey
// answers now arrive via decision records: an answer whose question id
// resolves through the registry is projected back from its record (value
// preserved; the SavedAnswer's screenId/savedAt are the projection's, not
// the v1 original's). An unresolvable id on a step WITH settles is retained
// as an answer (here: `pb_alphabet` on characters); an unresolvable id
// elsewhere (`language_name` — the old identity_lite flow's internal id) is
// NOT dropped either: it surfaces as an orphan entry in the decision trail
// (spec 088 T030, OPEN-088-1 ruling).
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
import { getDecisionSnapshot } from "../stores/decisionStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { STEP_ORDER } from "../steps/stepOrder.ts";
import { resolveLegacyStepId } from "../decisions/legacyStepIds.ts";
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
  "rules", "mechanisms", "osk", "touch_seed_source", "touch", "css", "help", "html", "package",
];

// Step ids a pre-reordering draft may name that the current manifest no
// longer lists: "track" was retired with the track question (#2568). The
// loader restores them verbatim (see the loadDraft test below); they are
// known-retired, not unknown.
const RETIRED_STEP_IDS = ["track"];

describe("pre-reordering draft loads on the current build", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();
    useSurveyAnswerStore.getState().reset();
  });

  it("the reordering changed the order of steps, not the set of step ids (deliberate additions since: attribution, #1901; open_languages, open_missing_letters, open_upgrades, spec 111; icon, #2485; fallback_policy, #2549; trial, publish, #2540; deliberate removal: track, #2568 — its decision lives on choose_base)", () => {
    // The 091 reordering itself changed no ids. #1901 deliberately ADDED
    // one step (attribution), spec 111 added open_languages (Open only),
    // open_missing_letters and open_upgrades, #2485 added icon, and #2549
    // added fallback_policy, and #2540 added trial and publish (the Output
    // screen split, spec 113) — and #2568 deliberately REMOVED the track
    // step, whose decision now lives on choose_base. Every other
    // pre-reordering id still exists, so a draft persisted before any of
    // these changes names only known (or legacy-mapped) steps.
    expect([...STEP_ORDER].sort()).toEqual(
      [...PRE_REORDER_STEP_IDS.filter((id) => !RETIRED_STEP_IDS.includes(id)), "attribution", "open_languages", "open_missing_letters", "open_upgrades", "icon", "fallback_policy", "trial", "publish"].sort(),
    );
  });

  it("every step id the draft persists is still a known step", () => {
    const persisted = new Set<string>([
      fixture.traversal.activeStepId,
      ...fixture.traversal.history,
      ...fixture.traversal.visited,
      ...Object.keys(fixture.surveyAnswers?.steps ?? {}),
    ]);
    expect(persisted.size).toBeGreaterThan(5);
    // "Known" means the id resolves through the frozen legacy map to a
    // step in the current order: the fixture's history still names the
    // retired "track" step verbatim (traversal restores verbatim — see the
    // test below), and the map resolves it to choose_base.
    for (const id of persisted) expect(STEP_ORDER).toContain(resolveLegacyStepId(id));
  });

  it("loadDraft restores traversal (legacy ids mapped through the frozen map); answers restore per the spec 088 migration contract", () => {
    localStorage.setItem(draftKey(fixture.projectKey), fixtureText);

    expect(loadDraft(fixture.projectKey)).toBe(true);

    const session = useSurveySessionStore.getState();
    expect(session.activeStepId).toBe(fixture.traversal.activeStepId);
    // Not verbatim for legacy ids: the fixture's history names the retired
    // "track" step, which the frozen map lands on choose_base (#2568) —
    // collapsing into the choose_base entry that precedes it. Everything
    // else restores verbatim.
    expect(session.history).toEqual(["identity", "layout", "choose_base", "project_name", "characters"]);
    expect(session.visited).toEqual(["identity", "layout", "choose_base", "project_name", "characters", "marks"]);
    expect(useWorkingCopyStore.getState().instantiationMode).toBe(fixture.workingCopy.instantiationMode);

    const restored = useSurveyAnswerStore.getState().steps;
    const saved = fixture.surveyAnswers?.steps ?? {};
    expect(Object.keys(restored).sort()).toEqual(Object.keys(saved).sort());
    for (const [stepId, step] of Object.entries(saved)) {
      // Position and status are slice state the migration never touches.
      expect(restored[stepId]?.position).toBe(step.position);
      expect(restored[stepId]?.status).toEqual(step.status);
      // Every answer VALUE survives migration (via its decision record, or
      // retained in place) — except the orphan asserted below.
      for (const [questionId, answer] of Object.entries(step.answers)) {
        if (stepId === "identity" && questionId === "language_name") continue;
        expect(restored[stepId]?.answers[questionId]?.value).toEqual(answer.value);
      }
    }
    // pb_alphabet does not resolve through the registry and its step has
    // settles, so the answer itself is retained verbatim.
    expect(restored["characters"]?.answers["pb_alphabet"]).toEqual(
      saved["characters"]?.answers["pb_alphabet"],
    );

    // The four resolvable questions are decision records now.
    expect(getDecisionSnapshot()).toMatchObject({
      "reserve-script-family": { value: "latin", step: "identity" },
      "char-count": { value: "42", step: "characters" },
      "mark-input-order": { value: "mark_first", step: "marks" },
      "help-canonical-order": { value: true, step: "punctuation" },
    });
    const identityAnswers = restored["identity"]?.answers ?? {};
    // language_name does not resolve — it is not in the answer store, and
    // it is NOT dropped: it surfaces in the decision trail as an orphan
    // entry carrying its value (spec 088 T030).
    expect(identityAnswers["language_name"]).toBeUndefined();
    const orphanEntries = useDecisionLogStore.getState().record.entries.filter(
      (e) => e.payload.kind === "survey-answer" && e.payload.questionId === "language_name",
    );
    expect(orphanEntries).toHaveLength(1);
    expect(orphanEntries[0]?.payload).toMatchObject({ value: "French" });
    expect(orphanEntries[0]?.stepId).toBe("identity");
  });
});

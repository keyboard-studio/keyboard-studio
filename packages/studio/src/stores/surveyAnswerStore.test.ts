// surveyAnswerStore — spec 079 R-01 (FR-001, FR-002, FR-033).

import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applySurveyAnswerSnapshot,
  getSurveyAnswerSnapshot,
  useSurveyAnswerStore,
  type SavedAnswer,
} from "./surveyAnswerStore.ts";

const answer = (over: Partial<Omit<SavedAnswer, "savedAt">> = {}): Omit<SavedAnswer, "savedAt"> => ({
  value: "yes",
  answerType: "select",
  origin: "confirmed",
  stage: "draft",
  evidenceKey: null,
  screenId: "q1",
  ...over,
});

beforeEach(() => {
  useSurveyAnswerStore.getState().reset();
});

describe("saveAnswer", () => {
  it("is synchronous: the answer reads back on the very next line (FR-001)", () => {
    useSurveyAnswerStore.getState().saveAnswer("identity", "q1", answer({ value: "Bambara" }));
    expect(useSurveyAnswerStore.getState().steps["identity"]?.answers["q1"]?.value).toBe("Bambara");
  });

  it("does not depend on the step finishing (FR-002)", () => {
    const s = useSurveyAnswerStore.getState();
    s.saveAnswer("marks", "marks_attachment.́|e", answer({ value: false, answerType: "boolean" }));
    expect(useSurveyAnswerStore.getState().steps["marks"]?.status).toEqual({ kind: "in-progress" });
    expect(useSurveyAnswerStore.getState().steps["marks"]?.answers["marks_attachment.́|e"]?.value).toBe(false);
  });

  it("is a no-op for an identical save, so subscribers are not notified", () => {
    const s = useSurveyAnswerStore.getState();
    s.saveAnswer("identity", "q1", answer());
    const before = useSurveyAnswerStore.getState().steps;
    s.saveAnswer("identity", "q1", answer());
    expect(useSurveyAnswerStore.getState().steps).toBe(before);
  });
});

describe("setStepAnswers", () => {
  it("replaces the step's answer set, dropping answers no longer given", () => {
    const s = useSurveyAnswerStore.getState();
    s.setStepAnswers("identity", { q1: answer(), q2: answer({ screenId: "q2" }) });
    s.setStepAnswers("identity", { q1: answer() });
    expect(Object.keys(useSurveyAnswerStore.getState().steps["identity"]!.answers)).toEqual(["q1"]);
  });

  it("keeps a confirmed answer's stage while its value is unchanged, and drafts it on change", () => {
    const s = useSurveyAnswerStore.getState();
    s.setStepAnswers("identity", { q1: answer() });
    s.markScreenRecorded("identity", "q1", "h1");
    s.setStepAnswers("identity", { q1: answer() });
    expect(useSurveyAnswerStore.getState().steps["identity"]!.answers["q1"]!.stage).toBe("confirmed");
    s.setStepAnswers("identity", { q1: answer({ value: "no" }) });
    expect(useSurveyAnswerStore.getState().steps["identity"]!.answers["q1"]!.stage).toBe("draft");
  });
});

describe("position, status, recording", () => {
  it("round-trips setPosition and setStatus", () => {
    const s = useSurveyAnswerStore.getState();
    s.setPosition("marks", "marks_stacking");
    s.setStatus("convenience", { kind: "not-asked", reason: { code: "no-surplus" }, evidenceKey: "k" });
    const steps = useSurveyAnswerStore.getState().steps;
    expect(steps["marks"]?.position).toBe("marks_stacking");
    expect(steps["convenience"]?.status).toEqual({
      kind: "not-asked",
      reason: { code: "no-surplus" },
      evidenceKey: "k",
    });
  });

  it("markScreenRecorded stores the hash and confirms only that screen's drafts", () => {
    const s = useSurveyAnswerStore.getState();
    s.saveAnswer("identity", "q1", answer({ screenId: "q1" }));
    s.saveAnswer("identity", "q2", answer({ screenId: "q2" }));
    s.markScreenRecorded("identity", "q1", "hash-1");
    const step = useSurveyAnswerStore.getState().steps["identity"]!;
    expect(step.lastRecorded["q1"]).toBe("hash-1");
    expect(step.answers["q1"]!.stage).toBe("confirmed");
    expect(step.answers["q2"]!.stage).toBe("draft");
  });

  it("setRecordedScreen maps an entry id to its screen", () => {
    useSurveyAnswerStore.getState().setRecordedScreen("d7", "marks_treatment");
    expect(useSurveyAnswerStore.getState().recordedScreenOf).toEqual({ d7: "marks_treatment" });
  });

  it("reset() clears every step and the screen map", () => {
    const s = useSurveyAnswerStore.getState();
    s.saveAnswer("identity", "q1", answer());
    s.setRecordedScreen("d1", "q1");
    s.reset();
    expect(useSurveyAnswerStore.getState().steps).toEqual({});
    expect(useSurveyAnswerStore.getState().recordedScreenOf).toEqual({});
  });

  it("snapshot / apply round-trips the persisted part", () => {
    const s = useSurveyAnswerStore.getState();
    s.saveAnswer("identity", "q1", answer());
    s.setRecordedScreen("d1", "q1");
    const snap = getSurveyAnswerSnapshot();
    s.reset();
    applySurveyAnswerSnapshot(snap);
    expect(getSurveyAnswerSnapshot()).toEqual(snap);
  });
});

// ---------------------------------------------------------------------------
// FR-033: reset only on start-over and new project.
// ---------------------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && name !== "test-setup.ts") {
      out.push(full);
    }
  }
  return out;
}

describe("reset() call sites (FR-033)", () => {
  it("are exactly StudioShell's start-over and WelcomeScreen's new project", () => {
    const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const callers = sourceFiles(srcRoot)
      .filter((f) => readFileSync(f, "utf8").includes("useSurveyAnswerStore.getState().reset()"))
      .map((f) => relative(srcRoot, f).split(sep).join("/"))
      .sort();
    expect(callers).toEqual(["StudioShell.tsx", "components/WelcomeScreen.tsx"]);
  });
});

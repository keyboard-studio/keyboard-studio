// SC-009 in BOTH directions: a record-bearing build and a record-free build read
// each other's drafts (specs/053-decision-audit T048; FR-005).
//
// This is the whole reason `decisionRecord` is an ADDITIVE OPTIONAL field on the
// existing envelope with no `DRAFT_VERSION` bump (research D-08, the `phaseBDraft`
// precedent). `loadDraft` discards any draft whose `version !== DRAFT_VERSION`
// (VR-1), so bumping the version to carry the audit would have thrown away every
// in-flight draft on the day this shipped, and would have made a rollback throw
// them away again. Both halves of that compatibility claim are asserted here:
//
//   older -> this build   a draft with no `decisionRecord` loads, and the trail is
//                         simply empty. Not an error, not a discard.
//   this build -> older   a draft WITH `decisionRecord` still carries an untouched
//                         `version`, so a reader that has never heard of the field
//                         accepts the envelope and ignores it.
//
// The second direction is asserted structurally rather than by importing an old
// build: the field is additive and the version is unchanged, which is exactly what
// an ignoring reader needs. A test that "loaded it in the old build" is not
// available to us; a test that pins the two properties the old build depends on is.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { BaseKeyboard, DecisionRecord, KeyboardIR } from "@keyboard-studio/contracts";
import { makeEmptyDecisionRecord } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import {
  useDecisionLogStore,
  resetDecisionEntryIds,
} from "../decisions/decisionLogStore.ts";

vi.mock("./serverDraftStore.ts", () => ({
  saveServerDraft: vi.fn(async () => true),
  saveServerDraftBeacon: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

import {
  DRAFT_VERSION,
  draftKey,
  saveDraft,
  loadDraft,
  type DurableDraft,
} from "./draftPersistence.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMinimalIr(): KeyboardIR {
  return {
    origin: "scaffolded" as const,
    header: {
      keyboardId: "hausa_std",
      name: "Hausa",
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

function instantiate(projectId: string): void {
  const base = {
    id: projectId,
    displayName: "Decision Record Test",
    languages: [],
  } as unknown as BaseKeyboard;
  useWorkingCopyStore
    .getState()
    .instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });
}

/** Record one decision into the log, the way a step completion would. */
function recordOneDecision(): void {
  useDecisionLogStore.getState().append({
    stepId: "identity",
    payload: {
      kind: "survey-answer",
      questionId: "il_language_english",
      answerType: "text",
      value: "Hausa",
    },
    provenance: { agency: "hand-set" },
  });
  useDecisionLogStore.getState().setKeyboardId("hausa_std");
}

function readEnvelope(projectKey: string): DurableDraft & Record<string, unknown> {
  const raw = localStorage.getItem(draftKey(projectKey));
  if (raw === null) throw new Error("no draft was written");
  return JSON.parse(raw) as DurableDraft & Record<string, unknown>;
}

const PROJECT = "hausa_std";

beforeEach(() => {
  localStorage.clear();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// older build -> this build
// ---------------------------------------------------------------------------

describe("SC-009 — a draft written without a decision record", () => {
  /** An envelope exactly as a pre-feature build wrote it: no `decisionRecord` key. */
  function seedRecordFreeDraft(): void {
    instantiate(PROJECT);
    saveDraft(PROJECT);
    const envelope = readEnvelope(PROJECT);
    delete envelope.decisionRecord;
    expect("decisionRecord" in envelope).toBe(false);
    localStorage.setItem(draftKey(PROJECT), JSON.stringify(envelope));
    // Clear the live state so the load has something to restore INTO.
    useWorkingCopyStore.getState().reset();
    useDecisionLogStore.getState().reset();
  }

  it("loads successfully — the missing field is not a malformed draft", () => {
    seedRecordFreeDraft();
    expect(loadDraft(PROJECT)).toBe(true);
  });

  it("leaves the trail empty rather than unreadable", () => {
    seedRecordFreeDraft();
    loadDraft(PROJECT);
    const state = useDecisionLogStore.getState();
    expect(state.record.entries).toEqual([]);
    // `droppedCount > 0` renders a "part of this could not be read" notice. An
    // absent record was never written, so nothing was dropped and the trail must
    // say nothing was.
    expect(state.droppedCount).toBe(0);
    expect(state.record).toEqual(makeEmptyDecisionRecord());
  });

  it("is not discarded from storage on load", () => {
    seedRecordFreeDraft();
    loadDraft(PROJECT);
    expect(localStorage.getItem(draftKey(PROJECT))).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// this build -> older build
// ---------------------------------------------------------------------------

describe("SC-009 — a draft written WITH a decision record", () => {
  it("keeps DRAFT_VERSION unchanged, so an ignoring reader still accepts it", () => {
    instantiate(PROJECT);
    recordOneDecision();
    saveDraft(PROJECT);

    const envelope = readEnvelope(PROJECT);
    expect(envelope.version).toBe(DRAFT_VERSION);
    expect(envelope.decisionRecord).toBeDefined();
  });

  it("carries the record as one additive field beside the pre-existing ones", () => {
    // The compatibility claim is that a reader which knows only the older fields
    // finds all of them intact and one field it does not recognise.
    instantiate(PROJECT);
    recordOneDecision();
    saveDraft(PROJECT);

    const envelope = readEnvelope(PROJECT);
    for (const key of [
      "version",
      "savedAt",
      "projectKey",
      "displayName",
      "languageTag",
      "workingCopy",
      "traversal",
      "phaseBDraft",
    ]) {
      expect(envelope[key]).toBeDefined();
    }
  });

  it("survives being read by a reader that strips the field it does not know", () => {
    // Simulating the round trip an older build would perform: read the envelope,
    // rewrite it from the fields it understands, and hand it back. This build must
    // still load the result — with an empty trail, which is the honest outcome
    // (the older build could not have preserved a record it never read).
    instantiate(PROJECT);
    recordOneDecision();
    saveDraft(PROJECT);

    const envelope = readEnvelope(PROJECT);
    const { decisionRecord: _dropped, ...asOlderBuildWouldRewriteIt } = envelope;
    localStorage.setItem(draftKey(PROJECT), JSON.stringify(asOlderBuildWouldRewriteIt));
    useWorkingCopyStore.getState().reset();
    useDecisionLogStore.getState().reset();

    expect(loadDraft(PROJECT)).toBe(true);
    expect(useDecisionLogStore.getState().record.entries).toEqual([]);
  });

  it("round-trips the record through save and load in this build", () => {
    instantiate(PROJECT);
    recordOneDecision();
    const before: DecisionRecord = useDecisionLogStore.getState().record;
    saveDraft(PROJECT);

    useWorkingCopyStore.getState().reset();
    useDecisionLogStore.getState().reset();
    expect(useDecisionLogStore.getState().record.entries).toEqual([]);

    expect(loadDraft(PROJECT)).toBe(true);
    const after = useDecisionLogStore.getState().record;
    expect(after.entries).toEqual(before.entries);
    expect(after.keyboardId).toBe("hausa_std");
    expect(useDecisionLogStore.getState().droppedCount).toBe(0);
  });
});

// Spec 084 D5 in BOTH directions: a record-bearing build and a pre-084 build
// read each other's drafts.
//
// This is the whole reason `criteriaRecord` is an ADDITIVE OPTIONAL field on
// the existing envelope with no `DRAFT_VERSION` bump, following the
// `decisionRecord` precedent (draftPersistence.decisionRecord.test.ts). Both
// halves of that compatibility claim are asserted here:
//
//   older -> this build   a draft with no `criteriaRecord` loads, and the
//                         criteria record is simply empty. Not an error,
//                         not a discard.
//   this build -> older   a draft WITH `criteriaRecord` still carries an
//                         untouched `version`, so a reader that has never
//                         heard of the field accepts the envelope and
//                         ignores it.
//
// The second direction is asserted structurally, as in the decisionRecord
// harness: the field is additive and the version is unchanged, which is
// exactly what an ignoring reader needs.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  useDecisionLogStore,
  resetDecisionEntryIds,
} from "../decisions/decisionLogStore.ts";
import {
  useCriteriaRecordStore,
  getCriteriaRecordSnapshot,
  EMPTY_CRITERIA_RECORD,
  type CriteriaRecord,
} from "../stores/criteriaRecordStore.ts";

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
import { makeScaffoldedIR } from "../test/irFixtures.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMinimalIr(): KeyboardIR {
  return makeScaffoldedIR({ header: { keyboardId: "hausa_std", name: "Hausa" } });
}

function instantiate(projectId: string): void {
  const base = {
    id: projectId,
    displayName: "Criteria Record Test",
    languages: [],
  } as unknown as StartKeyboard;
  useWorkingCopyStore
    .getState()
    .instantiateFromStart(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });
}

/** Record attestations and a confirmation, the way the criteria page would. */
function recordCriteriaEntries(): void {
  useCriteriaRecordStore.getState().attest("criterion-a", "yes");
  useCriteriaRecordStore.getState().attest("criterion-b", "not-applicable");
  useCriteriaRecordStore.getState().confirm("criterion-c");
}

function readEnvelope(projectKey: string): DurableDraft & Record<string, unknown> {
  const raw = localStorage.getItem(draftKey(projectKey));
  if (raw === null) throw new Error("no draft was written");
  return JSON.parse(raw) as DurableDraft & Record<string, unknown>;
}

const PROJECT = "hausa_std";

beforeEach(() => {
  localStorage.clear();
  resetDecisionEntryIds();
  useCriteriaRecordStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  useCriteriaRecordStore.getState().reset();
});

// ---------------------------------------------------------------------------
// older build -> this build
// ---------------------------------------------------------------------------

describe("spec 084 — a draft written without a criteria record", () => {
  /** An envelope exactly as a pre-084 build wrote it: no `criteriaRecord` key. */
  function seedRecordFreeDraft(): void {
    instantiate(PROJECT);
    saveDraft(PROJECT);
    const envelope = readEnvelope(PROJECT);
    delete envelope.criteriaRecord;
    expect("criteriaRecord" in envelope).toBe(false);
    localStorage.setItem(draftKey(PROJECT), JSON.stringify(envelope));
    // Clear the live state so the load has something to restore INTO, and
    // leave a stale criteria record behind so the load must clear it rather
    // than inherit another project's record.
    useWorkingCopyStore.getState().reset();
    useDecisionLogStore.getState().reset();
    recordCriteriaEntries();
    expect(getCriteriaRecordSnapshot()).not.toEqual(EMPTY_CRITERIA_RECORD);
  }

  it("loads successfully — the missing field is not a malformed draft", () => {
    seedRecordFreeDraft();
    expect(loadDraft(PROJECT)).toBe(true);
  });

  it("leaves the criteria record empty rather than unreadable", () => {
    seedRecordFreeDraft();
    loadDraft(PROJECT);
    expect(getCriteriaRecordSnapshot()).toEqual(EMPTY_CRITERIA_RECORD);
    expect(getCriteriaRecordSnapshot()).toEqual({
      attestations: {},
      confirmations: {},
      contrastiveAttestation: null,
    });
  });

  it("is not discarded from storage on load", () => {
    seedRecordFreeDraft();
    loadDraft(PROJECT);
    expect(localStorage.getItem(draftKey(PROJECT))).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// this build -> older build, and this build's own round-trip
// ---------------------------------------------------------------------------

describe("spec 084 — a draft written WITH a criteria record", () => {
  it("keeps DRAFT_VERSION unchanged, so an ignoring reader still accepts it", () => {
    instantiate(PROJECT);
    recordCriteriaEntries();
    saveDraft(PROJECT);

    const envelope = readEnvelope(PROJECT);
    expect(envelope.version).toBe(DRAFT_VERSION);
    expect(envelope.criteriaRecord).toBeDefined();
  });

  it("round-trips the record through save and load in this build", () => {
    instantiate(PROJECT);
    recordCriteriaEntries();
    const before: CriteriaRecord = getCriteriaRecordSnapshot();
    saveDraft(PROJECT);

    useWorkingCopyStore.getState().reset();
    useDecisionLogStore.getState().reset();
    useCriteriaRecordStore.getState().reset();
    expect(getCriteriaRecordSnapshot()).toEqual(EMPTY_CRITERIA_RECORD);

    expect(loadDraft(PROJECT)).toBe(true);
    const after = getCriteriaRecordSnapshot();
    expect(after).toEqual(before);
    expect(after.attestations["criterion-a"]?.answer).toBe("yes");
    expect(after.attestations["criterion-b"]?.answer).toBe("not-applicable");
    expect(after.confirmations["criterion-c"]?.at).toBe(
      before.confirmations["criterion-c"]?.at,
    );
  });
});

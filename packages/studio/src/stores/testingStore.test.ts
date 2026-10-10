// Tests for testingStore (spec 094 contracts C4, data-model.md).

import { describe, it, expect, beforeEach } from "vitest";
import { useTestingStore, mergeTestingRecords, collidingBuildNumbers } from "./testingStore.ts";
import type { TestBuild, TestingRecord } from "../lib/draftTypes.ts";

const store = () => useTestingStore.getState();

function build(fingerprint = "a".repeat(64), decisionCursor = 0) {
  return store().recordBuild({ version: "2.3.1", fingerprint, decisionCursor, changedSections: [] });
}

beforeEach(() => {
  store().reset();
});

describe("recordBuild", () => {
  it("numbers builds from 1 and advances only on call (FR-011)", () => {
    expect(store().nextBuildNumber).toBe(1);
    expect(build()?.number).toBe(1);
    expect(build("b".repeat(64))?.number).toBe(2);
    expect(store().nextBuildNumber).toBe(3);
    expect(store().builds.map((b) => b.buildId)).toHaveLength(2);
    expect(store().builds[0]!.buildId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("sets identicalTo when the fingerprint matches the previous build", () => {
    build("f".repeat(64));
    expect(build("f".repeat(64))?.identicalTo).toBe(1);
    expect(build("e".repeat(64))?.identicalTo).toBeUndefined();
  });

  it("stamps fixedInBuild on reports marked fixed since the previous build (FR-014)", () => {
    build();
    const fixed = store().addReport({ text: "wrong vowel", foundInBuild: 1 })!;
    const open = store().addReport({ text: "key missing", foundInBuild: 1 })!;
    store().setReportStatus(fixed.reportId, "fixed", 4);
    build("b".repeat(64));
    build("c".repeat(64));

    const byId = new Map(store().reports.map((r) => [r.reportId, r]));
    expect(byId.get(fixed.reportId)).toMatchObject({ status: "fixed", markedFixedAt: 4, fixedInBuild: 2 });
    expect(byId.get(open.reportId)?.fixedInBuild).toBeUndefined();
  });
});

describe("reports", () => {
  it("rejects an unknown foundInBuild, empty text and over-long text", () => {
    expect(store().addReport({ text: "x", foundInBuild: 1 })).toBeNull();
    build();
    expect(store().addReport({ text: "   ", foundInBuild: 1 })).toBeNull();
    expect(store().addReport({ text: "x".repeat(2001), foundInBuild: 1 })).toBeNull();
    expect(store().addReport({ text: "ok", foundInBuild: 1, sectionId: "rules" })).toMatchObject({
      status: "open",
      sectionId: "rules",
    });
  });

  it("reopening clears markedFixedAt and fixedInBuild", () => {
    build();
    const r = store().addReport({ text: "x", foundInBuild: 1 })!;
    store().setReportStatus(r.reportId, "fixed", 2);
    build("b".repeat(64));
    store().setReportStatus(r.reportId, "open");
    const reopened = store().reports[0]!;
    expect(reopened.status).toBe("open");
    expect(reopened).not.toHaveProperty("markedFixedAt");
    expect(reopened).not.toHaveProperty("fixedInBuild");
  });
});

describe("mergeRemote", () => {
  function remoteBuild(over: Partial<TestBuild>): TestBuild {
    return {
      buildId: "r".repeat(16),
      number: 1,
      version: "2.3.1",
      createdAt: "2026-10-09T10:00:00.000Z",
      fingerprint: "9".repeat(64),
      decisionCursor: 0,
      changedSections: [],
      ...over,
    };
  }

  it("unions by id, takes the highest nextBuildNumber, and flags shared numbers", () => {
    build();
    const local = store().builds[0]!;
    const remote: TestingRecord = {
      nextBuildNumber: 2,
      builds: [remoteBuild({}), { ...local }],
      reports: [{ reportId: "rep1", text: "from phone", foundInBuild: 1, status: "open" }],
    };
    store().mergeRemote(remote);

    expect(store().builds).toHaveLength(2);
    expect(store().reports).toHaveLength(1);
    expect(store().nextBuildNumber).toBe(2);
    expect(collidingBuildNumbers(store().builds)).toEqual(new Set([1]));
  });

  it("never lets nextBuildNumber fall to or below a merged build's number", () => {
    const merged = mergeTestingRecords(
      { nextBuildNumber: 1, builds: [], reports: [] },
      { nextBuildNumber: 1, builds: [remoteBuild({ number: 4 })], reports: [] },
    );
    expect(merged.nextBuildNumber).toBe(5);
  });

  it("ignores a malformed remote record", () => {
    build();
    store().mergeRemote({ nonsense: true } as unknown as TestingRecord);
    expect(store().builds).toHaveLength(1);
  });
});

describe("snapshot / hydrate / reset / frozen", () => {
  it("snapshot is undefined with nothing recorded, and round-trips through hydrate", () => {
    expect(store().snapshot()).toBeUndefined();
    build();
    const snap = store().snapshot();
    store().reset();
    expect(store().builds).toHaveLength(0);
    store().hydrate(snap);
    expect(store().snapshot()).toEqual(snap);
  });

  it("every mutator is a no-op while frozen", () => {
    build();
    const r = store().addReport({ text: "x", foundInBuild: 1 })!;
    store().markFrozen();
    const before = store().snapshot();

    expect(build("b".repeat(64))).toBeNull();
    expect(store().addReport({ text: "y", foundInBuild: 1 })).toBeNull();
    store().setReportStatus(r.reportId, "fixed");
    store().mergeRemote({ nextBuildNumber: 9, builds: [], reports: [] });

    expect(store().snapshot()).toEqual(before);
  });

  it("hydrate sets the frozen flag; reset clears it", () => {
    store().hydrate(undefined, { frozen: true });
    expect(store().frozen).toBe(true);
    store().reset();
    expect(store().frozen).toBe(false);
  });
});

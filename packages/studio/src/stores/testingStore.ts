// testingStore — the project's test builds and the author's notes on tester
// reports (spec 094 contracts C4, data-model.md).
//
// Durable: the record rides the existing draft envelope as `testing`
// (draftPersistence saveDraft / hydrate / mergeRemote) and the existing 500 ms
// autosave. Nothing here builds a package or reads the working copy — callers
// record a build only after it succeeded (FR-011).
//
// Frozen: a submitted project is read-only (draftPersistence's
// isProjectFrozen). Every mutator is a no-op while `frozen` is set.

import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { TestBuild, TesterReport, TestingRecord } from "../lib/draftTypes.ts";

export const REPORT_TEXT_MAX = 2000;

const EMPTY: TestingRecord = { nextBuildNumber: 1, builds: [], reports: [] };

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RecordBuildInput {
  version: string;
  fingerprint: string;
  decisionCursor: number;
  changedSections: string[];
}

export interface AddReportInput {
  text: string;
  foundInBuild: number;
  sectionId?: string;
}

interface TestingState extends TestingRecord {
  frozen: boolean;
  /** Record a build that already succeeded; stamps reports fixed since the previous build. */
  recordBuild: (input: RecordBuildInput) => TestBuild | null;
  /** Returns null for empty or over-long text, an unknown build, or a frozen project. */
  addReport: (input: AddReportInput) => TesterReport | null;
  /** `decisionCursor` is the decision-record entry count at the time of the change. */
  setReportStatus: (reportId: string, status: TesterReport["status"], decisionCursor?: number) => void;
  /** Union with a record from another device (research R6). */
  mergeRemote: (remote: TestingRecord | undefined) => void;
  reset: () => void;
  snapshot: () => TestingRecord | undefined;
  hydrate: (record: TestingRecord | undefined, opts?: { frozen?: boolean }) => void;
  markFrozen: () => void;
}

/** Union two records by id, keeping both sides' builds and reports (research R6). */
export function mergeTestingRecords(local: TestingRecord, remote: TestingRecord): TestingRecord {
  const builds = [...local.builds];
  const buildIds = new Set(builds.map((b) => b.buildId));
  for (const b of remote.builds) if (!buildIds.has(b.buildId)) builds.push(b);
  builds.sort((a, b) => a.number - b.number || a.createdAt.localeCompare(b.createdAt));

  const reports = [...local.reports];
  const reportIds = new Set(reports.map((r) => r.reportId));
  for (const r of remote.reports) if (!reportIds.has(r.reportId)) reports.push(r);

  const highest = builds.reduce((max, b) => Math.max(max, b.number), 0);
  return {
    nextBuildNumber: Math.max(local.nextBuildNumber, remote.nextBuildNumber, highest + 1),
    builds,
    reports,
  };
}

/** Build numbers claimed by more than one build — made on two devices before they synced. */
export function collidingBuildNumbers(builds: readonly TestBuild[]): Set<number> {
  const seen = new Set<number>();
  const colliding = new Set<number>();
  for (const b of builds) {
    if (seen.has(b.number)) colliding.add(b.number);
    seen.add(b.number);
  }
  return colliding;
}

function isRecord(value: unknown): value is TestingRecord {
  if (value === null || typeof value !== "object") return false;
  const r = value as Partial<TestingRecord>;
  return typeof r.nextBuildNumber === "number" && Array.isArray(r.builds) && Array.isArray(r.reports);
}

export const useTestingStore: UseBoundStore<StoreApi<TestingState>> = create<TestingState>()((set, get) => ({
  ...EMPTY,
  frozen: false,

  recordBuild(input) {
    const s = get();
    if (s.frozen) return null;
    const previous = s.builds[s.builds.length - 1];
    const build: TestBuild = {
      buildId: randomId(),
      number: s.nextBuildNumber,
      version: input.version,
      createdAt: new Date().toISOString(),
      fingerprint: input.fingerprint,
      decisionCursor: input.decisionCursor,
      changedSections: [...input.changedSections],
      ...(previous !== undefined && previous.fingerprint === input.fingerprint ? { identicalTo: previous.number } : {}),
    };
    set({
      builds: [...s.builds, build],
      nextBuildNumber: s.nextBuildNumber + 1,
      reports: s.reports.map((r) =>
        r.status === "fixed" && r.fixedInBuild === undefined ? { ...r, fixedInBuild: build.number } : r,
      ),
    });
    return build;
  },

  addReport(input) {
    const s = get();
    if (s.frozen) return null;
    const text = input.text.trim();
    if (text.length === 0 || text.length > REPORT_TEXT_MAX) return null;
    if (!s.builds.some((b) => b.number === input.foundInBuild)) return null;
    const report: TesterReport = {
      reportId: randomId(),
      text,
      foundInBuild: input.foundInBuild,
      ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
      status: "open",
    };
    set({ reports: [...s.reports, report] });
    return report;
  },

  setReportStatus(reportId, status, decisionCursor = 0) {
    const s = get();
    if (s.frozen) return;
    set({
      reports: s.reports.map((r) => {
        if (r.reportId !== reportId || r.status === status) return r;
        if (status === "fixed") return { ...r, status, markedFixedAt: decisionCursor };
        const { markedFixedAt: _m, fixedInBuild: _f, ...rest } = r;
        return { ...rest, status };
      }),
    });
  },

  mergeRemote(remote) {
    const s = get();
    if (s.frozen || !isRecord(remote)) return;
    set(mergeTestingRecords(s.snapshot() ?? EMPTY, remote));
  },

  reset() {
    set({ ...EMPTY, frozen: false });
  },

  snapshot() {
    const { nextBuildNumber, builds, reports } = get();
    if (builds.length === 0 && reports.length === 0) return undefined;
    return { nextBuildNumber, builds, reports };
  },

  hydrate(record, opts) {
    const r = isRecord(record) ? record : EMPTY;
    set({ nextBuildNumber: r.nextBuildNumber, builds: r.builds, reports: r.reports, frozen: opts?.frozen ?? false });
  },

  markFrozen() {
    set({ frozen: true });
  },
}));

/** True once the project has at least one test build — the three-part publish rule's input (research R1). */
export function useHasTestBuilds(): boolean {
  return useTestingStore((s) => s.builds.length > 0);
}

/** Non-reactive read for output-time code. */
export function hasTestBuilds(): boolean {
  return useTestingStore.getState().builds.length > 0;
}

/**
 * The stage ids changed since a build (research R7): the distinct steps of the
 * decision-record entries appended after `fromCursor`, in the order first
 * touched. When the files changed but no decision was recorded, the change can
 * only have come from Output's direct source editor, reported as "source".
 */
export function changedSectionsSince(
  entries: readonly { stepId: string }[],
  fromCursor: number,
  filesChanged: boolean,
): string[] {
  const sections: string[] = [];
  for (const entry of entries.slice(fromCursor)) {
    if (!sections.includes(entry.stepId)) sections.push(entry.stepId);
  }
  if (sections.length === 0 && filesChanged) sections.push("source");
  return sections;
}

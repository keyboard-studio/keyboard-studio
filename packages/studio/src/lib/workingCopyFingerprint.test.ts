// workingCopyFingerprint (spec 094 T025, research R7).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createVirtualFS, type VirtualFSEntry } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useTestingStore } from "../stores/testingStore.ts";
import { computeWorkingCopyFingerprint, fingerprintEntries } from "./workingCopyFingerprint.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

function kmnText(version: string): string {
  return `store(&NAME) 'Fingerprint'\nstore(&KEYBOARDVERSION) '${version}'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n`;
}

function seedAdapt(version: string) {
  const { ir } = parseKmn(kmnText(version), basicKbdus.id);
  const vfs = createVirtualFS([{ path: `source/${basicKbdus.id}.kmn`, content: kmnText(version), isBinary: false }]);
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
  useWorkingCopyStore.getState().setAttribution({ authorName: "A", copyrightHolder: "A" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  useTestingStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
  useWorkingCopyStore.getState().reset();
  useTestingStore.getState().reset();
});

describe("fingerprintEntries", () => {
  const a: VirtualFSEntry = { path: "a.txt", content: "alpha", isBinary: false };
  const b: VirtualFSEntry = { path: "b.bin", content: new Uint8Array([1, 2, 3]), isBinary: true };

  it("is a 64-hex SHA-256, independent of entry order", async () => {
    const one = await fingerprintEntries([a, b]);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(await fingerprintEntries([b, a])).toBe(one);
  });

  it("changes when one character changes", async () => {
    const one = await fingerprintEntries([a, b]);
    expect(await fingerprintEntries([{ ...a, content: "alphb" }, b])).not.toBe(one);
  });
});

describe("computeWorkingCopyFingerprint", () => {
  it("identical working copies give identical fingerprints", async () => {
    seedAdapt("2.3");
    const first = await computeWorkingCopyFingerprint();
    seedAdapt("2.3");
    expect(await computeWorkingCopyFingerprint()).toBe(first);
  });

  it("a one-character .kmn edit changes it", async () => {
    seedAdapt("2.3");
    const before = await computeWorkingCopyFingerprint();
    // The display name projects into the .kmn &NAME store.
    useWorkingCopyStore.getState().setIdentity({ displayName: "Fingerprinu" });
    expect(await computeWorkingCopyFingerprint()).not.toBe(before);
  });

  it("three-part adapt base: unchanged across recording the first build (R7)", async () => {
    seedAdapt("1.2.3");
    const before = await computeWorkingCopyFingerprint();
    useTestingStore.getState().recordBuild({ version: "1.2.4", fingerprint: before!, decisionCursor: 0, changedSections: [] });
    expect(await computeWorkingCopyFingerprint()).toBe(before);
  });

  it("unchanged across days with no confirmed HISTORY entry", async () => {
    seedAdapt("2.3");
    const today = await computeWorkingCopyFingerprint();
    vi.setSystemTime(new Date("2027-02-14T12:00:00Z"));
    expect(await computeWorkingCopyFingerprint()).toBe(today);
  });

  it("is null before anything is instantiated", async () => {
    expect(await computeWorkingCopyFingerprint()).toBeNull();
  });
});

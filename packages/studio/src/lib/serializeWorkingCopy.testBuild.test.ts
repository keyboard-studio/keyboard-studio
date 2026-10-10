// Test-build projection (spec 094 T024, contracts C2, research R1/R2/R7).
//
// (a) With no test build and no test builds recorded, the projection is
//     byte-identical to the snapshot taken before this feature (FR-010, SC-004).
// (b) A test build replaces the publish version everywhere it ships and labels
//     the package name, description and welcome page — never the .kmn &NAME.
// (b2) Stable (fingerprint) mode differs from the default only in the publish
//     version and the HISTORY fallback date.
// (c) A three-part adapt base publishes at a.(b+1).0 once a test build exists
//     (SC-004a), including over a HISTORY entry stamped before the first build.
//
// The clock is pinned: the projection reads it for the HISTORY date and the
// LICENSE year. Real projection; only the services boundary is mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useTestingStore } from "../stores/testingStore.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

function kmnText(version: string): string {
  return `store(&NAME) 'Test Build'\nstore(&KEYBOARDVERSION) '${version}'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n`;
}

function fetchedVfs(keyboardId: string, version: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: kmnText(version), isBinary: false },
    { path: `source/${keyboardId}.kvks`, content: "<KeyboardVisualKeyboard/>", isBinary: false },
  ]);
}

function seedAdaptTrack(version: string) {
  // Parsed from the .kmn text, as an import is, so the IR carries the
  // &KEYBOARDVERSION store the projection rewrites.
  const { ir } = parseKmn(kmnText(version), basicKbdus.id);
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs: fetchedVfs(basicKbdus.id, version), ir });
  const wc = useWorkingCopyStore.getState();
  wc.setIdentity({ keyboardId: basicKbdus.id, displayName: "Bambara", bcp47: "bm-Latn", languageName: "Bambara" });
  wc.setAttribution({ authorName: "Alice Example", copyrightHolder: "Alice Example" });
  wc.setBaseHistoryMdText(`## ${version} (2020-01-01)\n* Initial release.\n`);
  wc.setHelpDocs({ description: "Author prose.", usageTips: [] });
}

function seedCopyTrack(version: string) {
  // Parsed from the .kmn text, as an import is, so the IR carries the
  // &KEYBOARDVERSION store the projection rewrites.
  const { ir } = parseKmn(kmnText(version), basicKbdus.id);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: fetchedVfs(basicKbdus.id, version), ir });
  const wc = useWorkingCopyStore.getState();
  wc.setIdentity({ keyboardId: "bambara_test", displayName: "Bambara", bcp47: "bm-Latn", languageName: "Bambara" });
  wc.setAttribution({ authorName: "Alice Example", copyrightHolder: "Alice Example" });
  wc.setHelpDocs({ description: "Author prose.", usageTips: [] });
}

function recordOneBuild() {
  useTestingStore.getState().recordBuild({ version: "x", fingerprint: "a".repeat(64), decisionCursor: 0, changedSections: [] });
}

async function textFiles(opts?: Parameters<typeof projectWorkingCopyForOutput>[0]) {
  const projected = await projectWorkingCopyForOutput(opts);
  expect(projected).not.toBeNull();
  const out: Record<string, string> = {};
  for (const entry of projected!.vfs.entries()) {
    if (!entry.isBinary) out[entry.path] = String(entry.content);
  }
  return { files: out, version: projected!.version, keyboardId: projected!.keyboardId };
}

function kpsOf(files: Record<string, string>): string {
  const path = Object.keys(files).find((p) => p.endsWith(".kps"));
  expect(path).toBeDefined();
  return files[path!]!;
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

describe("(a) default projection unchanged (FR-010, SC-004)", () => {
  it("adapt track", async () => {
    seedAdaptTrack("2.3");
    expect((await textFiles()).files).toMatchSnapshot();
  });

  it("copy track", async () => {
    seedCopyTrack("2.3");
    expect((await textFiles()).files).toMatchSnapshot();
  });
});

describe("(b) test-build overrides", () => {
  it("adapt 2.3, build 2: version 2.3.2 everywhere it ships, labels on the package and welcome page", async () => {
    seedAdaptTrack("2.3");
    const { files: base } = await textFiles();
    const { files, version } = await textFiles({ testBuild: { number: 2, version: "2.3.2" } });

    expect(version).toBe("2.3.2");
    const kmn = files["source/basic_kbdus.kmn"]!;
    expect(kmn).toMatch(/store\(&KEYBOARDVERSION\)\s+'2\.3\.2'/);
    const kps = kpsOf(files);
    expect(kps).toMatch(/<Keyboard>[\s\S]*?<Version>2\.3\.2<\/Version>/);
    expect(kps).toMatch(/<Info>[\s\S]*?<Name URL="">Bambara \(Test build 2\)<\/Name>/);
    expect(kps).toMatch(/<Description URL="">Test build 2 — Bambara keyboard/);
    expect(files["HISTORY.md"]!.split("\n").find((l) => l.startsWith("## "))).toMatch(/^## 2\.3\.2 /);
    expect(files["source/welcome/welcome.htm"]).toMatch(/Test build 2/);
    // &NAME is the keyboard's identity across the upgrade to the release.
    expect(kmn.match(/store\(&NAME\)[^\n]*/)?.[0]).toBe(base["source/basic_kbdus.kmn"]!.match(/store\(&NAME\)[^\n]*/)?.[0]);
  });

  it("copy track, build 1: version 0.1 reaches the .kmn and the descriptor", async () => {
    seedCopyTrack("2.3");
    const { files, version } = await textFiles({ testBuild: { number: 1, version: "0.1" } });

    expect(version).toBe("0.1");
    expect(files["source/bambara_test.kmn"]).toMatch(/store\(&KEYBOARDVERSION\)\s+'0\.1'/);
    expect(kpsOf(files)).toMatch(/<Keyboard>[\s\S]*?<Version>0\.1<\/Version>/);
    expect(kpsOf(files)).toMatch(/\(Test build 1\)<\/Name>/);
  });

  it("the publish projection carries no label or test version after two test builds (FR-010, SC-004)", async () => {
    seedAdaptTrack("2.3");
    recordOneBuild();
    recordOneBuild();
    const { files, version } = await textFiles();
    expect(version).toBe("2.4");
    const all = Object.values(files).join("\n");
    expect(all).not.toMatch(/Test build/);
    expect(all).not.toMatch(/2\.3\.[12]\b/);
    expect(all).not.toMatch(/data-ks-test-build/);
  });
});

describe("(b2) stable mode", () => {
  it("differs from the default only in the publish version and the HISTORY date", async () => {
    seedAdaptTrack("1.2.3");
    const { files: plain } = await textFiles();
    vi.setSystemTime(new Date("2027-03-01T12:00:00Z"));
    const { files: stable, version } = await textFiles({ stableForFingerprint: true });
    vi.setSystemTime(new Date("2028-07-01T12:00:00Z"));
    const { files: stableLater } = await textFiles({ stableForFingerprint: true });

    expect(version).toBe("1.3.0");
    expect(stableLater).toEqual(stable);
    const differing = Object.keys(plain).filter((p) => plain[p] !== stable[p]);
    for (const p of differing) {
      expect(plain[p]!.replaceAll("1.2.4", "1.3.0").replace(/\d{4}-\d{2}-\d{2}/, "D")).toBe(
        stable[p]!.replace(/\d{4}-\d{2}-\d{2}/, "D"),
      );
    }
  });

  it("stable mode ignores whether test builds exist", async () => {
    seedAdaptTrack("1.2.3");
    const before = await textFiles({ stableForFingerprint: true });
    recordOneBuild();
    const after = await textFiles({ stableForFingerprint: true });
    expect(after.files).toEqual(before.files);
  });
});

describe("(c) three-part publish rule (SC-004a)", () => {
  it("publishes 1.2.4 without test builds and 1.3.0 with them", async () => {
    seedAdaptTrack("1.2.3");
    const without = await textFiles();
    expect(without.version).toBe("1.2.4");
    expect(without.files["source/basic_kbdus.kmn"]).toMatch(/'1\.2\.4'/);

    recordOneBuild();
    const withBuilds = await textFiles();
    expect(withBuilds.version).toBe("1.3.0");
    expect(withBuilds.files["source/basic_kbdus.kmn"]).toMatch(/store\(&KEYBOARDVERSION\)\s+'1\.3\.0'/);
    expect(kpsOf(withBuilds.files)).toMatch(/<Version>1\.3\.0<\/Version>/);
    expect(withBuilds.files["HISTORY.md"]).toMatch(/^## 1\.3\.0 /m);
  });

  it("a HISTORY entry confirmed at 1.2.4 before the first build renders a 1.3.0 heading", async () => {
    seedAdaptTrack("1.2.3");
    useWorkingCopyStore.getState().setHistoryEntryState({
      status: "confirmed",
      proposal: { version: "1.2.4", dateIso: "2026-10-01", bullets: ["Added ɛ."] },
      editedBullets: null,
    });
    recordOneBuild();
    const { files } = await textFiles();
    expect(files["HISTORY.md"]).toMatch(/^## 1\.3\.0 \(2026-10-01\)/m);
    expect(files["HISTORY.md"]).not.toMatch(/^## 1\.2\.4 /m);
  });
});

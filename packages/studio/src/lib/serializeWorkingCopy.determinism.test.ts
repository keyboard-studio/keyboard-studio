// Byte-identical documentation across productions (spec 076 SC-004 / FR-014).
//
// Seeded by US2 (T022) and EXTENDED by later phases: US5 adds the confirmed
// HISTORY entry, US6 adds the generated layout charts. Each phase appends to
// `DOC_MEMBER_PATHS` / the per-track seeders rather than writing a second
// determinism test, so there is one place that proves "produce twice, same
// bytes" for everything the projection emits.
//
// The two known clock inputs (the HISTORY entry date on the adapt track, the
// LICENSE year on the copy track) are pinned by faking `Date` — the projection
// reads the clock, so an unpinned run would only be deterministic by luck at a
// midnight boundary. Real projection; only the services boundary is mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const KMN_TEXT = "store(&NAME) 'Determinism'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n";

/** The six documentation members (spec 076 FR-001), plus whatever later phases add. */
function docMemberPaths(keyboardId: string): string[] {
  return [
    "README.md",
    "HISTORY.md",
    "LICENSE.md",
    "source/readme.htm",
    "source/welcome/welcome.htm",
    `source/help/${keyboardId}.php`,
  ];
}

const BASE_IMAGES = [
  { path: "welcome/desktop_default.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
  { path: "welcome/phone_default.png", bytes: new Uint8Array([7, 8, 9]) },
];

function fetchedVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: KMN_TEXT, isBinary: false },
    { path: `source/${keyboardId}.kvks`, content: "<KeyboardVisualKeyboard/>", isBinary: false },
  ]);
}

function seedAdaptTrack() {
  const ir = makeTestIR([]);
  ir.header.version = "1.0";
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs: fetchedVfs(basicKbdus.id), ir });
  const wc = useWorkingCopyStore.getState();
  wc.setIdentity({ keyboardId: basicKbdus.id, displayName: "Bambara", bcp47: "bm-Latn", languageName: "Bambara" });
  wc.setBaseWelcomeConvention("folder");
  wc.setBaseWelcomeHtmText('<html><body><p>Base prose.</p><img src="desktop_default.png"></body></html>');
  wc.setBaseWelcomeImages(BASE_IMAGES);
  wc.setBaseHistoryMdText("## 1.0 (2020-01-01)\n* Initial release.\n");
  wc.setHelpDocs({ description: "Author prose.", usageTips: ["Tip one.", "Tip two."], credits: "Someone." });
}

function seedCopyTrack() {
  const ir = makeTestIR([]);
  ir.header.version = "1.0";
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: fetchedVfs(basicKbdus.id), ir });
  const wc = useWorkingCopyStore.getState();
  wc.setBaseWelcomeImages(BASE_IMAGES);
  wc.setBaseWelcomeConvention("folder");
  wc.setHelpDocs({ description: "Author prose.", usageTips: [] });
}

/** Produce once and return every document member's bytes, plus every welcome-folder file. */
async function produce(): Promise<Map<string, string | Uint8Array>> {
  const projected = await projectWorkingCopyForOutput();
  expect(projected).not.toBeNull();
  const out = new Map<string, string | Uint8Array>();
  for (const path of docMemberPaths(projected!.keyboardId)) {
    const entry = projected!.vfs.get(path);
    expect(entry, `${path} must be produced`).toBeDefined();
    out.set(path, entry!.content);
  }
  for (const path of projected!.vfs.list("source/welcome/")) {
    out.set(path, projected!.vfs.get(path)!.content);
  }
  return out;
}

function expectIdentical(a: Map<string, string | Uint8Array>, b: Map<string, string | Uint8Array>) {
  expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
  for (const [path, first] of a) {
    const second = b.get(path)!;
    if (typeof first === "string") {
      expect(second, `${path} must be text on both productions`).toBeTypeOf("string");
      expect(second, `${path} differs between productions`).toBe(first);
    } else {
      expect([...(second as Uint8Array)], `${path} differs between productions`).toEqual([...first]);
    }
  }
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-12T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  useWorkingCopyStore.getState().reset();
});

describe("SC-004 — producing an unchanged working copy twice yields byte-identical documentation", () => {
  it("adapt track (Track 2): all six members and every carried image", async () => {
    seedAdaptTrack();
    const first = await produce();
    const second = await produce();
    expectIdentical(first, second);
    // Sanity: the members really carry content (not six empty strings agreeing).
    expect(first.get("source/welcome/welcome.htm")).toContain("Author prose.");
    expect(first.get("HISTORY.md")).toContain("2026-09-12");
    expect(first.get("source/welcome/desktop_default.png")).toBeInstanceOf(Uint8Array);
  });

  it("copy track (Track 1): all six members and every carried image", async () => {
    seedCopyTrack();
    const first = await produce();
    const second = await produce();
    expectIdentical(first, second);
    // No attribution was captured, so the notice line (and its year) is
    // deliberately omitted (spec 064 FR-004); the MIT body still ships.
    expect(first.get("LICENSE.md")).toContain("MIT License");
    expect(first.get("HISTORY.md")).toContain("2026-09-12");
  });

  it("the clock is the only nondeterministic input: a different injected date changes only the dated members", async () => {
    seedAdaptTrack();
    const first = await produce();
    vi.setSystemTime(new Date("2027-01-01T10:00:00Z"));
    const second = await produce();
    for (const [path, content] of first) {
      if (path === "HISTORY.md") continue; // carries the injected date by design (R12)
      const other = second.get(path)!;
      if (typeof content === "string") expect(other, path).toBe(content);
      else expect([...(other as Uint8Array)], path).toEqual([...content]);
    }
    expect(second.get("HISTORY.md")).toContain("2027-01-01");
  });
});

// spec 076 US5/US6 (T045/T054): the confirmed HISTORY entry and the generated
// charts join the byte-identity guarantee.
describe("SC-004 — later-phase members", () => {
  it("a confirmed HISTORY entry carries its own stored date, so the clock no longer moves HISTORY.md (R12)", async () => {
    seedAdaptTrack();
    useWorkingCopyStore.getState().setHistoryEntryState({
      status: "confirmed",
      proposal: { version: "1.1", dateIso: "2026-09-12", bullets: ["Added 2 characters: a, b"] },
      editedBullets: null,
    });
    const first = await produce();
    vi.setSystemTime(new Date("2027-01-01T10:00:00Z"));
    const second = await produce();
    expectIdentical(first, second);
    expect(first.get("HISTORY.md")).toContain("## 1.1 (2026-09-12)");
    expect(first.get("HISTORY.md")).toContain("* Adapted from basic_kbdus v1.0 via keyboard-studio.");
    expect(first.get("HISTORY.md")).toContain("* Added 2 characters: a, b");
  });

  it("regenerated layout charts are byte-identical across two productions (FR-014)", async () => {
    seedCopyTrack();
    useWorkingCopyStore.getState().setChartPreference("regenerate");
    const first = await produce();
    const second = await produce();
    expectIdentical(first, second);
    const charts = [...first.keys()].filter((p) => /ks-layout-.*\.svg$/.test(p));
    expect(charts.length).toBeGreaterThan(0);
    // The base images ride along untouched beside the charts.
    expect(first.get("source/welcome/desktop_default.png")).toBeInstanceOf(Uint8Array);
  });

  it("a net-new keyboard (no base images) charts by default, byte-identically", async () => {
    const ir = makeTestIR([]);
    ir.header.version = "1.0";
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: fetchedVfs(basicKbdus.id), ir });
    const first = await produce();
    const second = await produce();
    expectIdentical(first, second);
    expect([...first.keys()].some((p) => p.startsWith("source/welcome/ks-layout-desktop-"))).toBe(true);
  });
});

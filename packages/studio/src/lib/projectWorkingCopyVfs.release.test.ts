// projectWorkingCopyVfs tests: release version reset on id rename, package descriptor.
// Split from the former projectWorkingCopyVfs.test.ts; shared fixtures live in
// ../test/projectWorkingCopyVfsTestkit.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// Spy on the engine functions this projection calls
// ---------------------------------------------------------------------------

const applyCarveToVfsSpy = vi.fn(
  (_vfs: unknown, _id: string, _ir: unknown, _ids: unknown) => ({
    warnings: [] as string[],
  }),
);
/** Records the order the projection invokes touchKeycapRemovals / keyEdits /
 *  assignments in — the T052 "1.7 runs after 1.6 and before 2" obligation. */
const callOrder: string[] = [];
const applyAssignmentsToVfsSpy = vi.fn(
  (_vfs: unknown, _id: string, _a: unknown, _fn: unknown) => {
    callOrder.push("assignments");
    return { kmn: "c mock", warnings: [] as string[] };
  },
);
const applyIdentityStubMutationSpy = vi.fn(
  (_vfs: unknown, _id: string, _identity: unknown): void => {
    /* no-op */
  },
);
// Passthrough-by-default spies (real implementation, wired below once the
// module is first resolved) — unlike the three above, these two need their
// REAL behaviour for the ordering/correctness tests, while still letting
// individual tests override with `.mockImplementationOnce` to simulate a
// pass failure without touching every other test in this file.
const applyTouchKeycapRemovalsToVfsSpy = vi.fn();
const applyKeyEditsToVfsSpy = vi.fn();
/** Passthrough-by-default spy on `emitKmn`, so the rule-half-failure test can
 *  force a single throw from inside projectWorkingCopyVfs's own try/catch
 *  without touching the (many) other tests in this file that rely on a real
 *  .kmn re-emit (id-rename, etc.). */
const emitKmnSpy = vi.fn();

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@keyboard-studio/engine")>();
  applyTouchKeycapRemovalsToVfsSpy.mockImplementation((...args: Parameters<typeof original.applyTouchKeycapRemovalsToVfs>) => {
    callOrder.push("touchKeycapRemovals");
    return original.applyTouchKeycapRemovalsToVfs(...args);
  });
  applyKeyEditsToVfsSpy.mockImplementation((...args: Parameters<typeof original.applyKeyEditsToVfs>) => {
    callOrder.push("keyEdits");
    return original.applyKeyEditsToVfs(...args);
  });
  emitKmnSpy.mockImplementation((...args: Parameters<typeof original.emitKmn>) => original.emitKmn(...args));
  return {
    ...original,
    applyCarveToVfs: applyCarveToVfsSpy,
    applyAssignmentsToVfs: applyAssignmentsToVfsSpy,
    applyIdentityStubMutation: applyIdentityStubMutationSpy,
    applyTouchKeycapRemovalsToVfs: applyTouchKeycapRemovalsToVfsSpy,
    applyKeyEditsToVfs: applyKeyEditsToVfsSpy,
    emitKmn: emitKmnSpy,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
});

// ---------------------------------------------------------------------------
// Id-rename (Track-1 copy) takes the overlay's release version, or 1.0.
// Spec 102 FR-004: a copy is a new keyboard and ships at 1.0. The serializer
// resolves that version and passes it in the identity overlay, so the .kmn,
// .kps and file name agree by construction; with no overlay version the
// rename falls back to resetIdentity's own 1.0 default.
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs — id rename resets the release version", () => {
  const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Base KB'
store(&TARGETS) 'any'
store(&KEYBOARDVERSION) '2.3'

begin Unicode > use(main)

group(main) using keys
+ [K_A] > U+0061
`;

  it("resets &KEYBOARDVERSION to 1.0 when renaming to a new id with no overlay version", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/base_kb.kmn", content: BASE_KMN, isBinary: false },
    ]);
    const result = projectWorkingCopyVfs({
      vfs,
      keyboardId: "base_kb",
      targetKeyboardId: "new_kb",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(result.effectiveKeyboardId).toBe("new_kb");
    const renamed = vfs.entries().find((e) => e.path === "source/new_kb.kmn");
    expect(renamed).toBeDefined();
    const kmn = renamed?.content as string;
    expect(kmn).toContain("store(&KEYBOARDVERSION) '1.0'");
    expect(kmn).not.toContain("store(&KEYBOARDVERSION) '2.3'");
  });
});

// ---------------------------------------------------------------------------
// Step 3.6 — package-descriptor identity (spec 057 T015)
// ---------------------------------------------------------------------------
//
// The projection is the seam FR-004 names: the author's language reaches the
// `.kps` because it rides the same helper the OSK preview, the zip, and the pull
// request all call. These tests exercise the REAL engine writer (it is not among
// the three functions this file spies on), so what they assert is the descriptor
// the artifact actually carries.

describe("projectWorkingCopyVfs — package descriptor (step 3.6)", () => {
  /** A French base's scaffolded descriptor — the copy track's starting state. */
  const FRENCH_KPS =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    "<Package>\n" +
    "  <System>\n    <KeymanDeveloperVersion>17.0.0.0</KeymanDeveloperVersion>\n  </System>\n" +
    "  <Options>\n    <FollowKeyboardVersion/>\n  </Options>\n" +
    '  <Info>\n    <Name URL="">French AZERTY</Name>\n' +
    '    <Description URL="">French AZERTY keyboard, generated by Keyboard Studio.</Description>\n  </Info>\n' +
    "  <Files>\n    <File>\n      <Name>..\\build\\basic_kbdfr.kmx</Name>\n      <FileType>.kmx</FileType>\n    </File>\n  </Files>\n" +
    "  <Keyboards>\n    <Keyboard>\n      <Name>French AZERTY</Name>\n      <ID>basic_kbdfr</ID>\n" +
    "      <Version>1.0</Version>\n      <Languages>\n" +
    '        <Language ID="fr">fr</Language>\n' +
    "      </Languages>\n    </Keyboard>\n  </Keyboards>\n" +
    "</Package>\n";

  function copyTrackVfs() {
    return createVirtualFS([
      { path: "source/basic_kbdfr.kmn", content: "c base\nstore(&TARGETS) 'any'\n", isBinary: false },
      { path: "source/basic_kbdfr.kps", content: FRENCH_KPS, isBinary: false },
    ]);
  }

  const BAMBARA = { displayName: "Bambara", bcp47: "bm-Latn", languageName: "Bambara" };

  it("declares the author's language and name, not the base's (US1, FR-001…FR-003)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = copyTrackVfs();
    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "basic_kbdfr",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: BAMBARA,
    });

    const kps = vfs.get("source/basic_kbdfr.kps")?.content;
    expect(typeof kps).toBe("string");
    expect(kps).toContain('<Language ID="bm-Latn">Bambara</Language>');
    expect(kps).not.toContain('ID="fr"');
    expect(kps).toContain('<Name URL="">Bambara</Name>');
    expect(kps).not.toContain("French AZERTY");
    expect(warnings).toEqual([]);
  });

  // D-02: step 3.6 runs BEFORE the rename, writing under the pre-rename id, and
  // rewriteKpsFilePaths's skip of non-path-shaped <Name> values is what carries the
  // display names through. Inverting the two steps breaks one or the other.
  it("survives the step-4 rename with the identity intact", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = copyTrackVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "basic_kbdfr",
      targetKeyboardId: "bm_sil",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: BAMBARA,
    });

    expect(vfs.get("source/basic_kbdfr.kps")).toBeUndefined();
    const kps = vfs.get("source/bm_sil.kps")?.content;
    expect(kps).toContain('<Language ID="bm-Latn">Bambara</Language>');
    expect(kps).toContain('<Name URL="">Bambara</Name>');
    // The rename pass owns <ID> and the <Files> paths — step 3.6 left both alone
    // and this is what it looks like when the two compose.
    expect(kps).toContain("<ID>bm_sil</ID>");
    expect(kps).toContain("..\\build\\bm_sil.kmx");
  });

  it("generates a descriptor when the track has none (US3, FR-006)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = createVirtualFS([
      { path: "source/bm_sil.kmn", content: "c adapt\nstore(&TARGETS) 'any'\n", isBinary: false },
    ]);
    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "bm_sil",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: BAMBARA,
    });

    const kps = vfs.get("source/bm_sil.kps")?.content;
    expect(kps).toContain('<Language ID="bm-Latn">Bambara</Language>');
    // Generation is the designed path, not a fault: FR-006 names FAILURES only.
    expect(warnings).toEqual([]);
  });

  it("declares the und placeholder, never the base's tag, on a blank code (US1-3, FR-007)", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = copyTrackVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "basic_kbdfr",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: { displayName: "Bambara" },
    });

    const kps = vfs.get("source/basic_kbdfr.kps")?.content;
    expect(kps).toContain('<Language ID="und">und</Language>');
    expect(kps).not.toContain('ID="fr"');
  });

  it("leaves the descriptor untouched when there is no identity overlay at all", async () => {
    const { projectWorkingCopyVfs } = await import("./projectWorkingCopyVfs.ts");
    const vfs = copyTrackVfs();
    projectWorkingCopyVfs({
      vfs,
      keyboardId: "basic_kbdfr",
      startIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    expect(vfs.get("source/basic_kbdfr.kps")?.content).toBe(FRENCH_KPS);
  });
});

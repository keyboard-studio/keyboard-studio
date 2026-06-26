// persistWorkingCopy.test.ts — round-trip tests for working-copy snapshot/rehydrate.
//
// Critical case: a VFS entry with isBinary=true (Uint8Array) must survive the
// JSON sessionStorage round-trip byte-for-byte via Base64. Raw JSON.stringify
// of a Uint8Array produces `{"0":n,"1":n,...}`, a corrupt sparse object — Base64
// is mandatory for binary entries.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createVirtualFS, mergePhaseResults } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  snapshotWorkingCopyToSession,
  rehydrateWorkingCopyFromSession,
} from "./persistWorkingCopy.ts";

// ---------------------------------------------------------------------------
// sessionStorage stub (jsdom provides it but let's ensure clean isolation)
// ---------------------------------------------------------------------------

beforeEach(() => {
  sessionStorage.clear();
  // Use the store's own reset action for full isolation. (A bare setState is a
  // partial merge — it would only patch the enumerated keys and leave any field
  // a prior test left dirty, e.g. `ir` / `removalCapabilities`, uncleared.)
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Helper — minimal KeyboardIR-like object
// ---------------------------------------------------------------------------

function makeMinimalIr() {
  return {
    origin: "scaffolded" as const,
    header: {
      keyboardId: "test",
      name: "test",
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
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("persistWorkingCopy", () => {
  it("no-ops on snapshot when instantiationMode is null", () => {
    snapshotWorkingCopyToSession();
    expect(sessionStorage.getItem("ks.working-copy.draft")).toBeNull();
  });

  it("no-ops on snapshot when ir is null even if instantiationMode set", () => {
    useWorkingCopyStore.setState({ instantiationMode: "new-from-base", ir: null });
    snapshotWorkingCopyToSession();
    expect(sessionStorage.getItem("ks.working-copy.draft")).toBeNull();
  });

  it("rehydrateWorkingCopyFromSession returns false when no snapshot present", () => {
    const result = rehydrateWorkingCopyFromSession();
    expect(result).toBe(false);
  });

  it("round-trips a string VFS entry verbatim", () => {
    const ir = makeMinimalIr() as unknown as import("@keyboard-studio/contracts").KeyboardIR;
    const vfs = createVirtualFS([
      { path: "source/test.kmn", content: "c Test keyboard\nstore(&NAME) 'Test'\n", isBinary: false },
    ]);

    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseKeyboard: { id: "test_keyboard", displayName: "Test Keyboard", languages: ["en"] } as import("@keyboard-studio/contracts").BaseKeyboard,
      baseVfs: vfs,
      baseIr: ir,
      ir,
      identity: { keyboardId: "test_keyboard", bcp47: "en", displayName: "Test Keyboard" },
      deletedNodeIds: new Set(["node-1", "node-2"]),
      deletedItemIds: new Set(["node-1#0"]),
      undoStack: [{ k: "n", id: "node-1" }],
      phaseResults: [],
      irAxes: {},
      desktopLocked: false,
      touchLayoutJson: null,
      touchDraft: null,
      galleryIntrosSeen: { mechanism: true, touch: false },
    });

    snapshotWorkingCopyToSession();
    expect(sessionStorage.getItem("ks.working-copy.draft")).not.toBeNull();

    // Full cold reset — clears ALL fields to initial state so rehydration has
    // nothing to inherit. A partial setState would mask derived-field regressions.
    useWorkingCopyStore.getState().reset();

    const result = rehydrateWorkingCopyFromSession();
    expect(result).toBe(true);

    const s = useWorkingCopyStore.getState();
    expect(s.instantiationMode).toBe("new-from-base");
    expect(s.baseVfs?.get("source/test.kmn")?.content).toBe(
      "c Test keyboard\nstore(&NAME) 'Test'\n",
    );
    expect(s.deletedNodeIds.has("node-1")).toBe(true);
    expect(s.deletedNodeIds.has("node-2")).toBe(true);
    expect(s.deletedItemIds.has("node-1#0")).toBe(true);
    expect(s.undoStack).toEqual([{ k: "n", id: "node-1" }]);
    expect(s.galleryIntrosSeen.mechanism).toBe(true);
    expect(s.galleryIntrosSeen.touch).toBe(false);

    // Key must be cleared after consume.
    expect(sessionStorage.getItem("ks.working-copy.draft")).toBeNull();
  });

  it("round-trips a binary VFS entry byte-for-byte (the Base64 critical case)", () => {
    const ir = makeMinimalIr() as unknown as import("@keyboard-studio/contracts").KeyboardIR;

    // Fake .ico: 16 bytes with varied values including 0x00 and 0xFF.
    const fakeIco = new Uint8Array([0x00, 0x01, 0x7F, 0x80, 0xFF, 0xFE, 0x0A, 0x0D,
                                    0x10, 0x20, 0x40, 0x60, 0xAB, 0xCD, 0xEF, 0x99]);

    const vfs = createVirtualFS([
      { path: "source/test.kmn", content: "c test\n", isBinary: false },
      { path: "source/test.ico", content: fakeIco, isBinary: true },
    ]);

    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseKeyboard: { id: "test_keyboard", displayName: "Test", languages: [] } as import("@keyboard-studio/contracts").BaseKeyboard,
      baseVfs: vfs,
      baseIr: ir,
      ir,
      identity: null,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      undoStack: [],
      phaseResults: [],
      irAxes: {},
      desktopLocked: false,
      touchLayoutJson: null,
      touchDraft: null,
      galleryIntrosSeen: { mechanism: false, touch: false },
    });

    snapshotWorkingCopyToSession();

    // Full cold reset — clears ALL fields to initial state.
    useWorkingCopyStore.getState().reset();

    const result = rehydrateWorkingCopyFromSession();
    expect(result).toBe(true);

    const s = useWorkingCopyStore.getState();
    const rehydratedEntry = s.baseVfs?.get("source/test.ico");
    expect(rehydratedEntry).toBeDefined();
    expect(rehydratedEntry?.isBinary).toBe(true);

    // Byte-for-byte equality — this fails silently if Base64 was missed.
    const rehydratedBytes = rehydratedEntry?.content as Uint8Array;
    expect(rehydratedBytes.length).toBe(fakeIco.length);
    for (let i = 0; i < fakeIco.length; i++) {
      expect(rehydratedBytes[i]).toBe(fakeIco[i]);
    }

    // Verify the JSON in sessionStorage was NOT a sparse object (Base64 check).
    // If Base64 was skipped, the raw JSON would contain integer keys like "0", "1", ...
    // The snapshot key was already cleared by rehydrate; we can verify by checking
    // that the raw JSON stored contained a base64 string rather than integer keys.
    // Since sessionStorage was already cleared by rehydrate, we snapshot again and inspect.
    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseVfs: vfs,
      ir,
    });
    snapshotWorkingCopyToSession();
    const raw = sessionStorage.getItem("ks.working-copy.draft")!;
    const parsed = JSON.parse(raw) as { baseVfsEntries: Array<{ path: string; content: unknown; isBinary: boolean }> };
    const icoEntry = parsed.baseVfsEntries.find((e) => e.path === "source/test.ico");
    expect(icoEntry).toBeDefined();
    // content must be a string (Base64), not an object (corrupt Uint8Array serialization).
    expect(typeof icoEntry?.content).toBe("string");
  });

  it("clears the snapshot key after rehydration (consume-and-clear)", () => {
    const ir = makeMinimalIr() as unknown as import("@keyboard-studio/contracts").KeyboardIR;
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.setState({
      instantiationMode: "adapt-existing",
      baseVfs: vfs,
      ir,
      baseKeyboard: null,
      baseIr: null,
      identity: null,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      undoStack: [],
      phaseResults: [],
      irAxes: {},
      desktopLocked: false,
      touchLayoutJson: null,
      touchDraft: null,
      galleryIntrosSeen: { mechanism: false, touch: false },
    });

    snapshotWorkingCopyToSession();
    expect(sessionStorage.getItem("ks.working-copy.draft")).not.toBeNull();

    rehydrateWorkingCopyFromSession();
    expect(sessionStorage.getItem("ks.working-copy.draft")).toBeNull();

    // Second call returns false (already consumed).
    const secondResult = rehydrateWorkingCopyFromSession();
    expect(secondResult).toBe(false);
  });

  it("malformed JSON in sessionStorage: rehydrate returns false without throwing and clears the key", () => {
    sessionStorage.setItem("ks.working-copy.draft", "{bad json");
    let result: boolean | undefined;
    expect(() => { result = rehydrateWorkingCopyFromSession(); }).not.toThrow();
    expect(result).toBe(false);
    expect(sessionStorage.getItem("ks.working-copy.draft")).toBeNull();
  });

  it("P0 regression: removalCapabilities and session are re-derived on rehydration", () => {
    // Build a minimal IR with one S-01 removable rule (vkey -> char in a normal group).
    const removableRule = {
      nodeId: "rule-s01-1",
      context: [{ kind: "vkey" as const, vkey: "K_A", modifiers: [] }],
      output: [{ kind: "char" as const, char: "a" }],
    };
    const irWithRemovable = {
      origin: "scaffolded" as const,
      header: {
        keyboardId: "test",
        name: "Test",
        bcp47: [],
        copyright: "",
        version: "10.0",
        targets: [],
        storeDirectives: [],
      },
      stores: [],
      groups: [
        {
          nodeId: "group-main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [removableRule],
        },
      ],
      comments: [],
      raw: [],
      recognizedPatterns: [],
    } as unknown as import("@keyboard-studio/contracts").KeyboardIR;

    // Phase B result so session.axes is non-empty after merge.
    const testPhaseResults: import("@keyboard-studio/contracts").SurveyPhaseResult[] = [
      {
        phase: "B",
        answers: { scale: "full", layout: "phonetic" },
      } as unknown as import("@keyboard-studio/contracts").SurveyPhaseResult,
    ];
    const testIrAxes: Partial<import("@keyboard-studio/contracts").DiscoveryAxisVector> = { A1: "alphabetic" };

    const vfs = createVirtualFS([]);

    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseVfs: vfs,
      // At instantiation baseIr === ir (both seeded from the base). removalCapabilities
      // derives from baseIr, so it must be set for the rehydrated map to populate.
      baseIr: irWithRemovable,
      ir: irWithRemovable,
      baseKeyboard: null,
      identity: null,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      undoStack: [],
      phaseResults: testPhaseResults,
      irAxes: testIrAxes,
      desktopLocked: false,
      touchLayoutJson: null,
      touchDraft: null,
      galleryIntrosSeen: { mechanism: false, touch: false },
    });

    snapshotWorkingCopyToSession();

    // Full cold reset — all derived fields back to empty initial values.
    useWorkingCopyStore.getState().reset();

    // Precondition: both fields are empty after reset.
    const preState = useWorkingCopyStore.getState();
    expect(preState.removalCapabilities.size).toBe(0);
    expect(preState.session.axes).toEqual({});

    const result = rehydrateWorkingCopyFromSession();
    expect(result).toBe(true);

    const s = useWorkingCopyStore.getState();

    // P0 #1 — removalCapabilities must be populated (not empty Map) for IR with removable nodes.
    expect(s.removalCapabilities.size).toBeGreaterThan(0);
    expect(s.removalCapabilities.get("rule-s01-1")).toBe("removable:simple");

    // P0 #2 — session must equal mergePhaseResults(irAxes, phaseResults), not the empty initial value.
    const expectedSession = mergePhaseResults(testIrAxes, testPhaseResults);
    expect(s.session).toEqual(expectedSession);
  });

  it("derives removalCapabilities from baseIr, not the carve working ir", () => {
    // Regression: the store invariant is that removalCapabilities is computed
    // once at instantiation from the BASE IR and never recomputed on carve
    // edits. So rehydration must derive it from snapshot.baseIr — deriving from
    // the carve working `ir` would diverge the moment `ir` is mutated before a
    // redirect. Here baseIr holds the removable rule and `ir` is stripped of it;
    // a map derived from `ir` would be empty, from `baseIr` it is populated.
    const removableRule = {
      nodeId: "rule-s01-1",
      context: [{ kind: "vkey" as const, vkey: "K_A", modifiers: [] }],
      output: [{ kind: "char" as const, char: "a" }],
    };
    const makeIr = (rules: unknown[]) =>
      ({
        origin: "scaffolded" as const,
        header: {
          keyboardId: "test",
          name: "Test",
          bcp47: [],
          copyright: "",
          version: "10.0",
          targets: [],
          storeDirectives: [],
        },
        stores: [],
        groups: [
          { nodeId: "group-main", name: "main", usingKeys: true, readonly: false, rules },
        ],
        comments: [],
        raw: [],
        recognizedPatterns: [],
      }) as unknown as import("@keyboard-studio/contracts").KeyboardIR;

    const baseIr = makeIr([removableRule]); // base retains the removable rule
    const carveIr = makeIr([]); // carve working IR has had it removed

    const vfs = createVirtualFS([]);
    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseVfs: vfs,
      baseIr,
      ir: carveIr,
      baseKeyboard: null,
      identity: null,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      undoStack: [],
      phaseResults: [],
      irAxes: {},
      desktopLocked: false,
      touchLayoutJson: null,
      touchDraft: null,
      galleryIntrosSeen: { mechanism: false, touch: false },
    });

    snapshotWorkingCopyToSession();
    useWorkingCopyStore.getState().reset();

    const result = rehydrateWorkingCopyFromSession();
    expect(result).toBe(true);

    const s = useWorkingCopyStore.getState();
    // Derived from baseIr → the removable rule is present. (From carveIr it
    // would be empty, since carveIr's group has no rules.)
    expect(s.removalCapabilities.get("rule-s01-1")).toBe("removable:simple");
  });

  it("round-trips Set fields as Sets (not arrays) after rehydration", () => {
    const ir = makeMinimalIr() as unknown as import("@keyboard-studio/contracts").KeyboardIR;
    const vfs = createVirtualFS([]);

    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseVfs: vfs,
      ir,
      baseKeyboard: null,
      baseIr: null,
      identity: null,
      deletedNodeIds: new Set(["a", "b", "c"]),
      deletedItemIds: new Set(["x#0", "y#1"]),
      undoStack: [],
      phaseResults: [],
      irAxes: {},
      desktopLocked: false,
      touchLayoutJson: null,
      touchDraft: null,
      galleryIntrosSeen: { mechanism: false, touch: false },
    });

    snapshotWorkingCopyToSession();

    useWorkingCopyStore.setState({
      instantiationMode: null,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
    });

    rehydrateWorkingCopyFromSession();

    const s = useWorkingCopyStore.getState();
    // Must be a Set, not an array.
    expect(s.deletedNodeIds).toBeInstanceOf(Set);
    expect(s.deletedItemIds).toBeInstanceOf(Set);
    expect([...s.deletedNodeIds].sort()).toEqual(["a", "b", "c"]);
    expect([...s.deletedItemIds].sort()).toEqual(["x#0", "y#1"]);
  });
});

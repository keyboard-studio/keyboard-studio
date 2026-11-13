// compileCandidateKmn (spec 117 US8, research R15): the candidate it compiles is what the real
// replay at projection step 2.9 (after the generating steps) builds, so it is the .kmn the download will ship once the entry is
// recorded. Real projection and a real store; only the compile service is a stand-in that keeps
// the .kmn it was given.

import "../decisions/rebuildWorkingCopy.ts"; // registers the kmn-edits fold a Code-tab commit needs
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, type StartKeyboard, type VirtualFS } from "@keyboard-studio/contracts";
import { diffIR, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";

const compiled = vi.hoisted(() => ({ vfs: null as VirtualFS | null }));

vi.mock("./services.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services.ts")>();
  return {
    ...original,
    USE_REAL: true,
    getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
    getCompile: async () => async (vfs: VirtualFS) => {
      compiled.vfs = vfs;
      return { diagnostics: [], artifacts: [{ filename: "k.kmx", content: new Uint8Array() }] };
    },
  };
});

import { compileCandidateKmn } from "./compileCandidateKmn.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

const KMN =
  "store(&VERSION) '10.0'\nstore(&NAME) 'Test'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\n\n" +
  "group(main) using keys\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n";

const KEYBOARD = {
  id: "testkbd",
  path: "release/t/testkbd",
  script: "Latn",
  targets: [],
  displayName: "Test Keyboard",
  version: "1.0",
} as unknown as StartKeyboard;

const kmnOf = (vfs: VirtualFS): string =>
  [...vfs.entries()].find((e) => e.path.startsWith("source/") && e.path.endsWith(".kmn"))!.content as string;

beforeEach(() => {
  compiled.vfs = null;
  useDecisionStore.getState().reset();
  const ir = parseKmn(KMN, "testkbd").ir;
  useWorkingCopyStore.setState({
    ir,
    startIr: ir,
    startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: KMN, isBinary: false }]),
    startKeyboard: KEYBOARD,
    undoStack: [],
    desktopLocked: false,
  });
});

afterEach(() => {
  useWorkingCopyStore.setState({ ir: null, startIr: null, startVfs: null, startKeyboard: null, undoStack: [] });
});

describe("compileCandidateKmn", () => {
  it("compiles the .kmn the download ships once the entry is recorded", async () => {
    const changes = diffIR(
      parseKmn(KMN, "testkbd").ir,
      parseKmn(KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'z'\n+ [K_C] > 'c'"), "testkbd").ir,
    );
    expect(await compileCandidateKmn(changes)).toEqual({ status: "ok" });
    const candidate = kmnOf(compiled.vfs!);
    expect(candidate).toContain("U+007A");
    // Recording nothing so far: the store is untouched by the candidate.
    expect(useDecisionStore.getState().decisions["kmn-edits"]).toBeUndefined();

    const result = useWorkingCopyStore.getState().commitKmnEdit({ op: "code-apply", changes, overrides: [] });
    expect(result.ok).toBe(true);
    const shipped = await projectWorkingCopyForOutput();
    expect(kmnOf(shipped!.vfs)).toBe(candidate);
  });

  it("is unplaceable when the replay finds no anchor for a change", async () => {
    const changes = diffIR(
      parseKmn(KMN, "testkbd").ir,
      parseKmn(KMN.replace("+ [K_B] > 'b'", "+ [K_B] > 'q'"), "testkbd").ir,
    );
    // Anchored on a rule the keyboard as built does not hold.
    const missing = changes.map((c) => (c.change === "replace" ? { ...c, at: { ...c.at, text: "+ [K_Z] > U+007A" } } : c));
    expect(await compileCandidateKmn(missing)).toEqual({ status: "unplaceable" });
  });

  it("compiles the edit as replayed after the generating steps: a rule on a cased key keeps its NCAPS token", async () => {
    const cased =
      "store(&VERSION) '10.0'\nstore(&NAME) 'Test'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\n\n" +
      "group(main) using keys\n+ [K_A] > 'a'\n+ [SHIFT K_A] > 'A'\n+ [K_B] > 'b'\n";
    const ir = parseKmn(cased, "testkbd").ir;
    useWorkingCopyStore.setState({
      ir,
      startIr: ir,
      startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: cased, isBinary: false }]),
    });
    useDecisionStore.getState().recordAll([
      { id: "character-inventory", value: { chars: ["a", "A", "b"] }, provenance: "asked" },
      { id: "caps-handling", value: { mode: "cased-keys" }, provenance: "default" },
    ] as never);
    // The edit adds an NCAPS rule on a cased key. The caps step (2.8) would drop the token, but
    // the edit replays after it (2.9), so the candidate keeps it.
    const changes = diffIR(
      ir,
      parseKmn(cased.replace("+ [K_A] > 'a'", "+ [K_A] > 'a'\n+ [NCAPS K_A] > 'x'"), "testkbd").ir,
    );
    expect(await compileCandidateKmn(changes)).toEqual({ status: "ok" });
    const candidate = kmnOf(compiled.vfs!);
    expect(candidate).toContain("NCAPS");
    useWorkingCopyStore.getState().commitKmnEdit({ op: "code-apply", changes, overrides: [] }, { skipLiveMisses: true });
    expect(kmnOf((await projectWorkingCopyForOutput())!.vfs)).toBe(candidate);
  });
});

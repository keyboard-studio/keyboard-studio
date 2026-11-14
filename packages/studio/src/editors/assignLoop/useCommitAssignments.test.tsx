// useCommitAssignments / useSessionAssignments (spec 111 "live files", S2):
// Copy writes exactly what `recordAssignments` writes; Open applies the diff
// into the files and leaves `phaseResults` empty.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  createVirtualFS,
  makePattern,
  type MechanismAssignment,
  type StartKeyboard,
} from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useOpenAssignStore } from "../../stores/openAssignStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { useOpenRemovalStore } from "../../stores/openRemovalStore.ts";
import { seedInstantiatedWorkingCopy } from "../../test/workingCopy.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { collectCharContributors } from "@keyboard-studio/engine";
import { baseOnlyProducedSetFor } from "./mechanismPlacement.ts";
import { useCommitAssignments } from "./useCommitAssignments.ts";
import { useSessionAssignments } from "../../hooks/useSessionAssignments.ts";

const SWAP = makePattern({
  id: "simple_swap",
  title: "simple_swap",
  description: "simple_swap",
  category: "desktop",
  appliesTo: [],
  questions: [{ id: "kmnRules", prompt: "kmnRules", answerType: "text" as const }],
  kmnFragment: "{{kmnRules}}\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "",
  reviewDate: "2026-10-29",
});

vi.mock("../../lib/services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: (id: string) => (id === "simple_swap" ? SWAP : undefined),
}));

const swap = (target: string, rule: string): MechanismAssignment => ({
  scope: "individual",
  target,
  modality: "physical",
  mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: rule } }],
  source: "user",
});

const cAssignments = () =>
  useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")?.assignments ?? [];

describe("on Copy", () => {
  beforeEach(() => seedInstantiatedWorkingCopy(["ɛ"], { attributed: true }));

  it("writes exactly what recordAssignments writes", () => {
    const a = swap("ɛ", "+ [K_E] > U+025B");
    const { result } = renderHook(() => useCommitAssignments());
    act(() => result.current([a]));
    const viaHook = JSON.stringify(useWorkingCopyStore.getState().phaseResults);

    seedInstantiatedWorkingCopy(["ɛ"], { attributed: true });
    useWorkingCopyStore.getState().recordAssignments([a]);
    expect(JSON.stringify(useWorkingCopyStore.getState().phaseResults)).toBe(viaHook);
    expect(cAssignments()).toHaveLength(1);
  });

  it("the session list is the phaseResults list", () => {
    const a = swap("ɛ", "+ [K_E] > U+025B");
    useWorkingCopyStore.getState().recordAssignments([a]);
    const { result } = renderHook(() => useSessionAssignments());
    expect(result.current).toEqual([a]);
    expect(useOpenAssignStore.getState().session).toBeNull();
  });
});

describe("on Open", () => {
  const ID = "tiny";
  const KMN = ["store(&NAME) 'Tiny'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\n");

  beforeEach(() => {
    useOpenAssignStore.getState().clear();
    useOpenUndoStore.getState().clear();
    useOpenRemovalStore.getState().clear();
    const vfs = createVirtualFS([
      { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
      { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ]);
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(
      { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard,
      { vfs, ir: parseKmn(KMN, ID).ir },
    );
    wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  });

  const kmn = () => readVfsText(useWorkingCopyStore.getState().startVfs!, `source/${ID}.kmn`)!;

  it("applies the added and removed assignments to the file and holds nothing in phaseResults", async () => {
    const a = swap("ɛ", "+ [K_E] > U+025B");
    const b = swap("ʃ", "+ [K_S] > U+0283");
    const { result } = renderHook(() => ({ commit: useCommitAssignments(), session: useSessionAssignments() }));

    act(() => result.current.commit([a]));
    await waitFor(() => expect(kmn()).toContain("U+025B"));
    expect(cAssignments()).toEqual([]);
    expect(result.current.session).toHaveLength(1);

    // The gallery hands over the whole next list: [a, b] adds b only.
    act(() => result.current.commit([...result.current.session, b]));
    await waitFor(() => expect(kmn()).toContain("U+0283"));
    expect(kmn().match(/U\+025B/g)).toHaveLength(1);

    // [b] alone takes a back.
    act(() => result.current.commit([b]));
    await waitFor(() => expect(kmn()).not.toContain("U+025B"));
    expect(kmn()).toContain("U+0283");
    expect(cAssignments()).toEqual([]);
  });

  it("the gallery's existing-methods views read the applied method from the re-parsed model", async () => {
    const { result } = renderHook(() => useCommitAssignments());
    expect(baseOnlyProducedSetFor(useWorkingCopyStore.getState().startIr).has("ɛ")).toBe(false);
    act(() => result.current([swap("ɛ", "+ [K_E] > U+025B")]));
    await waitFor(() => expect(kmn()).toContain("U+025B"));
    const startIr = useWorkingCopyStore.getState().startIr!;
    expect(baseOnlyProducedSetFor(startIr).has("ɛ")).toBe(true);
    expect(JSON.stringify(collectCharContributors(startIr, "ɛ"))).toContain('"keystrokeDisplay":"e"');
  });
});

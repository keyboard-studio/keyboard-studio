// usePreviewArtifact — handleMakeTestBuild records a build only when the
// download actually happened (spec 094 FR-011), and never twice at once.
//
// useKeyboardArtifact is mocked to a ready stage (precedent:
// usePreviewArtifact.coverageGate.test.ts); the bundle builder and the
// fingerprint are mocked so each failure mode can be forced.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { i18nHookWrapper } from "../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useTestingStore } from "../stores/testingStore.ts";
import { seedInstantiatedWorkingCopy } from "../test/workingCopy.ts";
import type { Stage } from "./useKeyboardArtifact.ts";

const READY_STAGE: Stage = {
  kind: "ready",
  compileResult: { diagnostics: [] },
  jsBlobUrl: "blob:test",
  vfs: createVirtualFS([]),
  scaffoldWarnings: [],
  keyboardId: "test",
} as unknown as Stage;

vi.mock("./useKeyboardArtifact.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useKeyboardArtifact.ts")>()),
  useKeyboardArtifact: () => ({ stage: READY_STAGE, retry: vi.fn(), recompile: vi.fn() }),
}));

const buildTestBuildKmp = vi.fn();
vi.mock("../lib/buildOutputBundle.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/buildOutputBundle.ts")>()),
  buildTestBuildKmp: (...args: unknown[]) => buildTestBuildKmp(...args),
}));

const computeWorkingCopyFingerprint = vi.fn();
vi.mock("../lib/workingCopyFingerprint.ts", () => ({
  computeWorkingCopyFingerprint: () => computeWorkingCopyFingerprint(),
}));

function swapAssignment(target: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: `+ [K_X] > U+0000` } }],
    source: "user",
  };
}

const BUILT = { bytes: new Uint8Array([1, 2, 3]), filename: "t.kmp", warnings: [] as string[] };

beforeEach(() => {
  useTestingStore.getState().reset();
  seedInstantiatedWorkingCopy(["á"], { attributed: true });
  useWorkingCopyStore.getState().recordAssignments([swapAssignment("á")]);
  buildTestBuildKmp.mockReset().mockResolvedValue(BUILT);
  computeWorkingCopyFingerprint.mockReset().mockResolvedValue("fp-1");
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mount() {
  const { usePreviewArtifact } = await import("./usePreviewArtifact.ts");
  return renderHook(() => usePreviewArtifact(), { wrapper: i18nHookWrapper });
}

describe("usePreviewArtifact.handleMakeTestBuild", () => {
  it("records the build after a successful download", async () => {
    const { result } = await mount();
    let build: unknown;
    await act(async () => {
      build = await result.current.handleMakeTestBuild();
    });
    expect(build).not.toBeNull();
    expect(useTestingStore.getState().builds).toHaveLength(1);
    expect(useTestingStore.getState().builds[0]?.fingerprint).toBe("fp-1");
  });

  it("records nothing and reports an error when the fingerprint is null", async () => {
    computeWorkingCopyFingerprint.mockResolvedValue(null);
    const { result } = await mount();
    let build: unknown = "unset";
    await act(async () => {
      build = await result.current.handleMakeTestBuild();
    });
    expect(build).toBeNull();
    expect(useTestingStore.getState().builds).toHaveLength(0);
    expect(result.current.kmpError).not.toBeNull();
  });

  it("records nothing when the fingerprint throws", async () => {
    computeWorkingCopyFingerprint.mockRejectedValue(new Error("hash failed"));
    const { result } = await mount();
    await act(async () => {
      await result.current.handleMakeTestBuild();
    });
    expect(useTestingStore.getState().builds).toHaveLength(0);
    expect(result.current.kmpError).toBe("hash failed");
  });

  it("records nothing when the download throws", async () => {
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      throw new Error("blob refused");
    });
    const { result } = await mount();
    let build: unknown = "unset";
    await act(async () => {
      build = await result.current.handleMakeTestBuild();
    });
    expect(build).toBeNull();
    expect(useTestingStore.getState().builds).toHaveLength(0);
    expect(result.current.kmpError).toBe("blob refused");
  });

  it("does nothing for a second call while the first is in flight", async () => {
    let release: (v: typeof BUILT) => void = () => {};
    buildTestBuildKmp.mockReturnValue(new Promise((r) => (release = r)));
    const { result } = await mount();
    let first: Promise<unknown> = Promise.resolve();
    let second: unknown = "unset";
    await act(async () => {
      first = result.current.handleMakeTestBuild();
      second = await result.current.handleMakeTestBuild();
    });
    expect(second).toBeNull();
    expect(buildTestBuildKmp).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(BUILT);
      await first;
    });
    expect(useTestingStore.getState().builds).toHaveLength(1);
  });

  it("reports the frozen refusal through the localized catalog (#2050)", async () => {
    useTestingStore.getState().markFrozen();
    const { result } = await mount();
    let build: unknown = "unset";
    await act(async () => {
      build = await result.current.handleMakeTestBuild();
    });
    expect(build).toBeNull();
    expect(result.current.kmpError).toBe(
      "This project is frozen; test builds are no longer available.",
    );
  });
});

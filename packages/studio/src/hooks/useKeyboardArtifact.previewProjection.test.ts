// useKeyboardArtifact: publishing the preview projection the LDML findings read (spec 108).
//
// When a run reaches `ready` with a successful parse, the hook publishes
// { ir, touchLayoutText, kvksText, keyboardId } into the working-copy store, reading the text
// from the VFS that run compiled. A superseded run never writes, and a failed parse leaves the
// previous value. Like the fidelity wiring test, only the transport is mocked.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StartKeyboard, VirtualFS, CompileResult } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

const { KMN } = vi.hoisted(() => ({ KMN: `store(&VERSION) '10.0'
store(&NAME) 'Projection Probe'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
` }));

const { KVKS, TOUCH } = vi.hoisted(() => ({
  KVKS: "<visualkeyboard><header/></visualkeyboard>",
  TOUCH: '{"tablet":{"layer":[]}}',
}));

const { control } = vi.hoisted(() => ({
  control: {
    compileGate: null as null | Promise<void>,
    parseCalls: 0,
    failParse: false,
    withAssets: true,
  },
}));

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@keyboard-studio/engine")>();
  const { mixedDiagnosticsResult } = await import("@keyboard-studio/contracts/fixtures");
  const mockEngine = {
    init: vi.fn(() => Promise.resolve()),
    isReady: vi.fn(() => true),
    compile: vi.fn(async (_vfs: VirtualFS, _id: string): Promise<CompileResult> => {
      const gate = control.compileGate;
      control.compileGate = null;
      if (gate !== null) await gate;
      return mixedDiagnosticsResult;
    }),
    fetchKeyboardSourceToVfs: vi.fn((_kb: StartKeyboard, vfs: VirtualFS) => {
      vfs.set("source/proj_kb.kmn", KMN, false);
      if (control.withAssets) {
        vfs.set("source/proj_kb.kvks", KVKS, false);
        vfs.set("source/proj_kb.keyman-touch-layout", TOUCH, false);
      }
      return Promise.resolve({});
    }),
  };
  const parseKmn = (text: string, id: string) => {
    control.parseCalls += 1;
    if (control.failParse) throw new Error("parse gap");
    const result = real.parseKmn(text, id);
    // Distinguish runs: the Nth parse names its IR after N.
    return { ...result, ir: { ...result.ir, header: { ...result.ir.header, name: `run-${control.parseCalls}` } } };
  };
  return { ...real, ...mockEngine, parseKmn, parseTouchLayout: () => { throw new Error("not parsed here"); } };
});

const kb: StartKeyboard = {
  id: "proj_kb",
  path: "release/p/proj_kb",
  script: "Latn",
  targets: ["windows"],
  displayName: "Projection Probe",
  version: "1.0",
};

/** The committed working copy: a run publishes only for its own keyboard. */
function commitBase(base: StartKeyboard) {
  useWorkingCopyStore.getState().instantiateFromStart(base, {
    vfs: createVirtualFS(),
    ir: makeTestIR([]),
  });
}

async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  control.compileGate = null;
  control.parseCalls = 0;
  control.failParse = false;
  control.withAssets = true;
  commitBase(kb);
  useWorkingCopyStore.getState().setPreviewProjection(null);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("useKeyboardArtifact: preview projection", () => {
  it("publishes the parsed IR with the touch and kvks text of the run on ready", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const { result } = renderHook(() => useKeyboardArtifact(kb, null, null, null));
    await settle();

    expect(result.current.stage.kind).toBe("ready");
    const projection = useWorkingCopyStore.getState().previewProjection;
    expect(projection).not.toBeNull();
    expect(projection?.keyboardId).toBe("proj_kb");
    expect(projection?.ir.header.name).toBe("run-1");
    expect(projection?.kvksText).toBe(KVKS);
    expect(projection?.touchLayoutText).toBe(TOUCH);
  });

  it("publishes null text for a keyboard with no kvks or touch layout", async () => {
    control.withAssets = false;
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    renderHook(() => useKeyboardArtifact(kb, null, null, null));
    await settle();
    const projection = useWorkingCopyStore.getState().previewProjection;
    expect(projection?.kvksText).toBeNull();
    expect(projection?.touchLayoutText).toBeNull();
  });

  it("leaves the previous value when the next run's parse fails", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const { result } = renderHook(() => useKeyboardArtifact(kb, null, null, null));
    await settle();
    const first = useWorkingCopyStore.getState().previewProjection;
    expect(first?.ir.header.name).toBe("run-1");

    control.failParse = true;
    await act(async () => {
      result.current.recompile();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(useWorkingCopyStore.getState().previewProjection).toBe(first);
  });

  it("never writes from a superseded run", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    let release: () => void = () => undefined;
    control.compileGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Run 1 starts and parks inside its compile.
    const { result } = renderHook(() => useKeyboardArtifact(kb, null, null, null));
    await settle();
    expect(useWorkingCopyStore.getState().previewProjection).toBeNull();

    // Run 2 supersedes it and finishes first.
    await act(async () => {
      result.current.recompile();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const second = useWorkingCopyStore.getState().previewProjection;
    expect(second).not.toBeNull();
    const secondName = second?.ir.header.name;

    // Run 1 now resumes; it must not overwrite run 2's projection.
    await act(async () => {
      release();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(useWorkingCopyStore.getState().previewProjection?.ir.header.name).toBe(secondName);
  });

  it("does not publish for a keyboard other than the committed one", async () => {
    commitBase({ ...kb, id: "other_kb", path: "release/o/other_kb" });
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");
    const { result } = renderHook(() => useKeyboardArtifact(kb, null, null, null));
    await settle();
    expect(result.current.stage.kind).toBe("ready");
    expect(useWorkingCopyStore.getState().previewProjection).toBeNull();
  });

  it("is cleared by a base change", () => {
    useWorkingCopyStore.getState().setPreviewProjection({
      ir: { origin: "imported" } as never,
      touchLayoutText: null,
      kvksText: null,
      keyboardId: "x",
    });
    commitBase({ ...kb, id: "second_kb", path: "release/s/second_kb" });
    expect(useWorkingCopyStore.getState().previewProjection).toBeNull();
  });
});

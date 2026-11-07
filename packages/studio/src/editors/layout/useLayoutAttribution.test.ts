// useLayoutAttribution — reads only the D3 artifact store, never compiles, never times
// (spec 113 FR-017/FR-018, decision D3).

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import type { SimKeyInput, SimulationStep } from "@keyboard-studio/contracts";
import {
  makeErrorRulesDemoArtifact,
  makeIdleRulesDemoArtifact,
  makeLoadingRulesDemoArtifact,
  makeReadyRulesDemoArtifact,
  useRulesDemoArtifactStore,
} from "../../stores/rulesDemoArtifactStore.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import {
  contextToSeed,
  deadkeyOrdinals,
  layerToSimInput,
  useLayoutAttribution,
  type SimulateEach,
} from "./useLayoutAttribution.ts";

vi.mock("../../hooks/useKeyboardArtifact.ts", () => ({ useKeyboardArtifact: vi.fn() }));

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'T'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'x'
+ [K_B] > 'y'
'n' + [K_B] > 'ñ'
`;

const ir = parseKmn(KMN, "t").ir;
const VKEYS = ["K_A", "K_B", "K_ENTER"];
const BYTES = new TextEncoder().encode("// compiled");

/** A simulator that types `x`/`y` for K_A/K_B, and appends to the seed text. */
const faithful: SimulateEach = (_c, inputs: readonly SimKeyInput[], seed) =>
  inputs.map((input): SimulationStep => {
    const typed = input.vkey === "K_A" ? "x" : "y";
    const out = seed?.text === "n" && input.vkey === "K_B" ? "ñ" : `${seed?.text ?? ""}${typed}`;
    return { input, outputAfter: out, pendingDeadkeys: [], beep: false };
  });

const lying: SimulateEach = (c, inputs, seed) =>
  faithful(c, inputs, seed).map((s) => (s.input.vkey === "K_A" ? { ...s, outputAfter: "Z" } : s));

function run(simulateEach: SimulateEach = faithful) {
  return renderHook(() => useLayoutAttribution([], undefined, { ir, vkeys: VKEYS, jsBytes: BYTES, simulateEach }));
}

const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
};

function cellOf(r: { current: ReturnType<typeof useLayoutAttribution> }, vkey: string) {
  return r.current.cells.find((c) => c.vkey === vkey)!;
}

beforeEach(() => {
  useRulesDemoArtifactStore.setState({ artifact: makeIdleRulesDemoArtifact() });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLayoutAttribution", () => {
  it("is not-compiled while idle: every editable behaviour is read-only, frame keys untouched", () => {
    const { result } = run();
    expect(result.current.state).toBe("not-compiled");
    expect(result.current.steps).toEqual([]);
    const a = cellOf(result, "K_A");
    expect(a.plain).toMatchObject({ editable: false, readOnlyReason: "not-compiled" });
    expect(cellOf(result, "K_B").rows.every((r) => !r.editable && r.readOnlyReason === "not-compiled")).toBe(true);
    expect(cellOf(result, "K_ENTER")).toMatchObject({ frame: true, plain: null });
  });

  it("is not-compiled while the first compile is loading", async () => {
    useRulesDemoArtifactStore.setState({ artifact: makeLoadingRulesDemoArtifact() });
    const { result } = run();
    await flush();
    expect(result.current.state).toBe("not-compiled");
    expect(cellOf(result, "K_A").plain?.readOnlyReason).toBe("not-compiled");
  });

  it("verifies against the artifact once ready: matching cells stay editable", async () => {
    useRulesDemoArtifactStore.setState({ artifact: makeReadyRulesDemoArtifact("blob:x", "t") });
    const { result } = run();
    await flush();
    expect(result.current.state).toBe("ready");
    expect(cellOf(result, "K_A").plain).toMatchObject({ editable: true });
    expect(cellOf(result, "K_B").rows[0]).toMatchObject({ editable: true });
    // The seeded context ("n" before K_B) was simulated too.
    expect(result.current.steps.some((s) => s.vkey === "K_B" && s.context !== undefined)).toBe(true);
  });

  it("demotes a cell whose compiled output differs, through verifyCells", async () => {
    useRulesDemoArtifactStore.setState({ artifact: makeReadyRulesDemoArtifact("blob:x", "t") });
    const { result } = run(lying);
    await flush();
    expect(result.current.state).toBe("ready");
    expect(cellOf(result, "K_A").plain).toMatchObject({ editable: false, readOnlyReason: "later-group-change" });
    expect(cellOf(result, "K_B").plain).toMatchObject({ editable: true });
  });

  it("shows the last good result stale when the compile then fails", async () => {
    useRulesDemoArtifactStore.setState({ artifact: makeReadyRulesDemoArtifact("blob:x", "t") });
    const { result } = run();
    await flush();
    expect(result.current.state).toBe("ready");
    act(() => {
      useRulesDemoArtifactStore.setState({ artifact: makeErrorRulesDemoArtifact("compile", "boom") });
    });
    await flush();
    expect(result.current.state).toBe("stale");
    expect(result.current.staleReason).toBe("error");
    expect(result.current.errorMessage).toBe("boom");
    expect(cellOf(result, "K_A").plain).toMatchObject({ editable: true });
  });

  it("keeps the last good result stale (not blank) while the next compile loads", async () => {
    useRulesDemoArtifactStore.setState({ artifact: makeReadyRulesDemoArtifact("blob:x", "t") });
    const { result } = run();
    await flush();
    act(() => {
      useRulesDemoArtifactStore.setState({ artifact: makeLoadingRulesDemoArtifact() });
    });
    expect(result.current.state).toBe("stale");
    expect(result.current.staleReason).toBe("loading");
  });

  it("starts no timer, calls no compile, and does not fetch when bytes are injected", async () => {
    const timer = vi.spyOn(globalThis, "setTimeout");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    useRulesDemoArtifactStore.setState({ artifact: makeReadyRulesDemoArtifact("blob:x", "t") });
    const { result } = run();
    await flush();
    expect(result.current.state).toBe("ready");
    expect(timer).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(useKeyboardArtifact)).not.toHaveBeenCalled();
  });
});

describe("layerToSimInput", () => {
  it.each<[readonly string[], SimKeyInput]>([
    [[], { vkey: "K_A", modifiers: [] }],
    [["SHIFT"], { vkey: "K_A", modifiers: ["shift"] }],
    [["SHIFT", "RALT"], { vkey: "K_A", modifiers: ["shift", "ralt"] }],
    [["LCTRL", "LALT"], { vkey: "K_A", modifiers: ["lctrl", "lalt"] }],
    [["CAPS"], { vkey: "K_A", modifiers: [], caps: true }],
    [["NCAPS", "CTRL"], { vkey: "K_A", modifiers: ["ctrl"] }],
  ])("%j", (layer, want) => {
    expect(layerToSimInput("K_A", layer as never)).toEqual(want);
  });
});

describe("contextToSeed", () => {
  it("seeds text and numeric deadkeys at their positions", () => {
    expect(contextToSeed([{ kind: "text", text: "ab" }])).toEqual({ text: "ab" });
    expect(contextToSeed([{ kind: "text", text: "a" }, { kind: "deadkey", deadkeyId: "0010" }])).toEqual({
      text: "a",
      pendingDeadkeys: [{ id: 16, position: 1 }],
    });
  });
  it("seeds the compiler's number for a deadkey, which counts the source's first mentions from 0", () => {
    const ir = parseKmn(
      ["store(&VERSION) '10.0'", "store(&NAME) 'o'", "store(&TARGETS) 'any'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_E] > dk(3000)", "+ [K_A] > dk(005e)", "dk(005e) + [K_B] > 'b'"].join(String.fromCharCode(10)) + String.fromCharCode(10),
      "o",
    ).ir;
    const ordinals = deadkeyOrdinals(ir);
    expect([...ordinals]).toEqual([[0x3000, 0], [0x5e, 1]]);
    expect(contextToSeed([{ kind: "deadkey", deadkeyId: "005e" }], ordinals)).toEqual({
      text: "",
      pendingDeadkeys: [{ id: 1, position: 0 }],
    });
    expect(contextToSeed([{ kind: "deadkey", deadkeyId: "9999" }], ordinals)).toBeNull();
  });
  it("cannot seed a named deadkey (no number until the compiler assigns one)", () => {
    expect(contextToSeed([{ kind: "deadkey", deadkeyId: "acute" }])).toBeNull();
  });
});

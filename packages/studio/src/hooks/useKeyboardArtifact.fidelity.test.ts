// useKeyboardArtifact — Layer A′ import-fidelity wiring proof.
//
// The live import path (this hook's full-run parse branch) must run the
// engine's importKeyboard fidelity composition — runImportFidelityParseChecks
// + runImportFidelityEmitChecks — once per import, and surface the
// warning/error findings on the ready stage's runtime-warning channel.
//
// Unlike useKeyboardArtifact.test.ts, this file does NOT mock parseKmn /
// recognizePatterns / emitKmn: the real codec parses the seeded .kmn, the
// real recognizer annotates it, the real emit produces the text the I3 check
// scans. Only the transport surface (init / compile / fetch) is mocked. The
// two fidelity stages are wrapped in pass-through spies so the test can pin
// the invocation contract:
//
//   1. Both stages fire exactly once on a full run (the import moment).
//   2. Neither stage re-fires on recompile() — fidelity is import-time only,
//      outside the debounce cycle.
//   3. A real I3 finding (KM_WARN_HEADER_FIELD_MISSING — the seeded .kmn has
//      no &COPYRIGHT store) reaches runtimeWarnings prefixed
//      "[import-fidelity]". No bcp47 finding surfaces: a .kmn carries no
//      language store (tags live in the package descriptor), so I3 does
//      not check for one.
//   4. The always-on info/hint findings (I4 inventory, I2 unavailable hint) do NOT
//      surface — they are ImportReport metadata, not author diagnostics.
//   5. Instantiation still proceeds (onInstantiate fires, ir non-null):
//      fidelity findings are non-blocking.

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type {
  StartKeyboard,
  VirtualFS,
  KeyboardIR,
  LintFinding,
} from "@keyboard-studio/contracts";
import { mixedDiagnosticsResult } from "@keyboard-studio/contracts/fixtures";
import type { OnInstantiateCallback } from "./useKeyboardArtifact";

// ---------------------------------------------------------------------------
// Engine mock — transport only. parseKmn / recognizePatterns / emitKmn /
// classifyRemovalCapabilities / the fidelity stages are the REAL engine
// implementations (spread via importOriginal in the vi.mock factory below).
// ---------------------------------------------------------------------------

// A well-formed minimal keyboard whose header is missing &COPYRIGHT — the
// shape I3 (header preservation) reports on. Like every real .kmn it has
// no language store; language tags live in the package descriptor.
const PROBE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Fidelity Probe'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
`;

const mockEngine = {
  init: vi.fn(() => Promise.resolve()),
  isReady: vi.fn(() => true),
  compile: vi.fn((_vfs: VirtualFS, _keyboardId: string) =>
    Promise.resolve(mixedDiagnosticsResult),
  ),
  fetchKeyboardSourceToVfs: vi.fn(
    (_startKeyboard: StartKeyboard, vfs: VirtualFS) => {
      vfs.set("source/fidelity_kb.kmn", PROBE_KMN, false);
      return Promise.resolve({});
    },
  ),
};

// Pass-through spies over the real fidelity stages. The real implementations
// are bound inside the vi.mock factory (importOriginal), which runs before
// the hook loads the engine.
type ParseChecksFn = (
  parseResult: { ir: KeyboardIR; opaqueFeatures: Array<{ feature: string; count: number }> },
  source: string,
) => LintFinding[];
type EmitChecksFn = (ir: KeyboardIR, emitted: string) => Promise<LintFinding[]>;

let realParseChecks: ParseChecksFn | null = null;
let realEmitChecks: EmitChecksFn | null = null;

const fidelityParseSpy = vi.fn((parseResult: Parameters<ParseChecksFn>[0], source: string) => {
  if (realParseChecks === null) throw new Error("real parse checks not bound");
  return realParseChecks(parseResult, source);
});
const fidelityEmitSpy = vi.fn((ir: KeyboardIR, emitted: string) => {
  if (realEmitChecks === null) throw new Error("real emit checks not bound");
  return realEmitChecks(ir, emitted);
});

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@keyboard-studio/engine")>();
  realParseChecks = real.runImportFidelityParseChecks as ParseChecksFn;
  realEmitChecks = real.runImportFidelityEmitChecks as EmitChecksFn;
  return {
    ...real,
    ...mockEngine,
    runImportFidelityParseChecks: fidelityParseSpy,
    runImportFidelityEmitChecks: fidelityEmitSpy,
  };
});

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const baseKb: StartKeyboard = {
  id: "fidelity_kb",
  path: "release/f/fidelity_kb",
  script: "Latn",
  targets: ["windows"],
  displayName: "Fidelity Probe",
  version: "1.0",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("useKeyboardArtifact — Layer A′ import-fidelity wiring", () => {
  it("runs both fidelity stages once per import and surfaces I3 on runtimeWarnings", async () => {
    const { useKeyboardArtifact } = await import("./useKeyboardArtifact");

    const onInstantiate = vi.fn<Parameters<OnInstantiateCallback>, void>();

    const { result } = renderHook(() =>
      useKeyboardArtifact(baseKb, null, null, onInstantiate),
    );

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // Import completed and instantiation proceeded despite the findings.
    expect(result.current.stage.kind).toBe("ready");
    expect(onInstantiate).toHaveBeenCalledTimes(1);
    const [, calledOpts] = onInstantiate.mock.calls[0]!;
    expect(calledOpts.ir).not.toBeNull();

    // Both fidelity stages fired exactly once (the import moment).
    expect(fidelityParseSpy).toHaveBeenCalledTimes(1);
    expect(fidelityEmitSpy).toHaveBeenCalledTimes(1);

    // The real I3 finding reached the runtime-warning channel — the missing
    // copyright store, specifically.
    const readyStage = result.current.stage;
    if (readyStage.kind !== "ready") throw new Error("expected ready stage");
    const warnings = readyStage.runtimeWarnings ?? [];
    const fidelityWarnings = warnings.filter((w) => w.startsWith("[import-fidelity]"));
    expect(
      fidelityWarnings.some((w) => w.includes("KM_WARN_HEADER_FIELD_MISSING")),
    ).toBe(true);
    expect(fidelityWarnings.some((w) => w.includes("copyright"))).toBe(true);

    // No bcp47 finding reaches the channel: the probe .kmn has no language
    // store (no real .kmn does), and I3 no longer treats that as missing.
    expect(fidelityWarnings.some((w) => w.includes("bcp47"))).toBe(false);

    // The always-on info/hint findings stay off the channel.
    expect(warnings.some((w) => w.includes("KM_INFO_OPAQUE_FEATURE_INVENTORY"))).toBe(false);
    expect(warnings.some((w) => w.includes("KM_HINT_ROUND_TRIP_UNAVAILABLE"))).toBe(false);

    // recompile() re-parses the working copy but must NOT re-run fidelity.
    await act(async () => {
      result.current.recompile();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(fidelityParseSpy).toHaveBeenCalledTimes(1);
    expect(fidelityEmitSpy).toHaveBeenCalledTimes(1);
    expect(onInstantiate).toHaveBeenCalledTimes(1);
  });
});

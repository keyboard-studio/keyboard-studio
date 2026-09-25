// Shared module mocks for the TouchGallery.*.test.tsx suites. Every suite wires
// them with the hoist-safe pattern:
//
//   vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/touchGallery/mocks.tsx"));
//   vi.mock("../../lib/buildTouchLayoutJson.ts", async (importOriginal) =>
//     (await import("../../test/touchGallery/mocks.tsx")).withMockedBuildTouchLayoutJson(
//       await importOriginal<typeof import("../../lib/buildTouchLayoutJson.ts")>(),
//     ),
//   );
//   ...
//
// and imports the spies/refs below statically: the factory's dynamic import and
// the suite's static import resolve to the same module instance, so a suite
// sees the same spy objects the mocked modules hand to TouchGallery.
//
// This module must stay free of runtime imports that reach
// @keyboard-studio/engine (stores, contracts runtime, TouchGallery itself):
// the engine mock factory imports it, so any such import would be circular.
// Seeders and lifecycle hooks live in ./harness.ts instead.

import { vi, type Mock } from "vitest";
import type { VirtualFS } from "@keyboard-studio/contracts";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";

// ---------------------------------------------------------------------------
// Refs shared across mock closures and test bodies.
// ---------------------------------------------------------------------------

export const capturedVfsTransformRef = {
  current: null as null | ((vfs: VirtualFS, kbId: string) => { warnings: string[] }),
};

// Spy over the real `enumerateTouchMethodsForChar` — the color-model test
// overrides it for exactly one, otherwise-unused target character
// (never colliding with any other test's inventory in these suites) so it can
// assert a "layer-switch" row's rendering without constructing a real
// `.keyman-touch-layout` fixture. Every other call (any other character)
// falls through to the real implementation, captured via
// `originalEnumerateTouchMethodsForCharRef` in the `@keyboard-studio/engine`
// mock factory below — same "wrap by default" pattern MechanismGallery.
// test.tsx uses for `collectCharContributorsSpy`.
export const originalEnumerateTouchMethodsForCharRef = {
  current: null as null | ((...args: unknown[]) => unknown),
};
export const enumerateTouchMethodsForCharSpy: Mock = vi.fn();

// Default spy implementation: deterministic JSON including the assignments so
// tests can assert the transform's injected content differs between edits.
// The `phone` platform below is real parseTouchLayout-shaped JSON — one key
// per assignment, `output` set to the assignment's target char — so the
// FR-008 completion gate (which parses this JSON via layoutForLintAndGate
// and runs touchCoverage against it) sees every explicitly-configured
// character as covered, matching what the real buildTouchLayoutJson would
// produce. Re-applied in beforeEach (see installTouchGalleryHooks in
// ./harness.ts) because vi.clearAllMocks() clears call history but NOT a
// custom .mockImplementation() a prior test installed — without the reset, a
// later test's coverage gate would see a stale non-covering implementation
// left over from an earlier test in the same suite (the bug this comment is
// guarding against).
export function defaultBuildTouchLayoutJsonImpl(
  _baseIr: unknown,
  assignments: Array<{ target: string; mechanisms: Array<{ patternId: string }> }>,
) {
  return {
    json: JSON.stringify({
      _mock: true,
      assignments,
      phone: {
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: assignments.map((a, i) => ({ id: `T_mock_${i}`, output: a.target })),
              },
            ],
          },
        ],
      },
    }),
    warnings: [] as string[],
  };
}
export const buildTouchLayoutJsonSpy = vi.fn(defaultBuildTouchLayoutJsonImpl);

// ---------------------------------------------------------------------------
// hooks/useKeyboardArtifact.ts — capture the vfsTransform so we can invoke it.
// ---------------------------------------------------------------------------

export const useKeyboardArtifact = (
  _baseKeyboard: unknown,
  _scaffoldSpec: unknown,
  vfsTransform: ((vfs: VirtualFS, kbId: string) => { warnings: string[] }) | null | undefined,
): { stage: Stage; retry: Mock; recompile: Mock } => {
  capturedVfsTransformRef.current = vfsTransform ?? null;
  return { stage: { kind: "idle" } as Stage, retry: vi.fn(), recompile: vi.fn() };
};

// ---------------------------------------------------------------------------
// lib/buildTouchLayoutJson.ts — deterministic, no real engine. `deriveSeedLayout`
// is kept as the REAL implementation (via importOriginal, same pattern as the
// @keyboard-studio/engine mock below) rather than stubbed out: TouchGallery's
// detectionSeedLayout memo calls it directly to compute the "already in touch
// layout" suggestion and the FR-008 completion-gate fallback layout, and
// several suites (the seed-source-aware detection suite, the FR-008 refusal
// suite) assert on that real seed-derivation behavior. Only
// `buildTouchLayoutJson` itself — the final emitted JSON, asserted via
// buildTouchLayoutJsonSpy — is replaced with the deterministic mock.
// ---------------------------------------------------------------------------

export function withMockedBuildTouchLayoutJson<T extends object>(original: T) {
  return {
    ...original,
    buildTouchLayoutJson: buildTouchLayoutJsonSpy,
  };
}

// ---------------------------------------------------------------------------
// @keyboard-studio/engine — mock helpers so no WASM is loaded.
// ---------------------------------------------------------------------------

export function withMockedEngine<T extends { enumerateTouchMethodsForChar: unknown }>(
  original: T,
): T & { emitTouchLayout: Mock<() => string>; enumerateTouchMethodsForChar: Mock } {
  originalEnumerateTouchMethodsForCharRef.current = original.enumerateTouchMethodsForChar as (
    ...args: unknown[]
  ) => unknown;
  enumerateTouchMethodsForCharSpy.mockImplementation(
    original.enumerateTouchMethodsForChar as (...args: unknown[]) => unknown,
  );
  return {
    ...original,
    // emitTouchLayout is used for minimalTouchJson; return a stable string.
    emitTouchLayout: vi.fn(() => '{"_minimal":true}'),
    enumerateTouchMethodsForChar: enumerateTouchMethodsForCharSpy,
  };
}

// ---------------------------------------------------------------------------
// components/OSKFrame.tsx, components/OskModeToggle.tsx — no iframe / KMW
// environment.
// ---------------------------------------------------------------------------

export const OSKFrame = ({ stage }: { stage: Stage }) => (
  <div data-testid="osk-frame" data-stage={stage.kind}>
    osk-frame-mock
  </div>
);

export const OskModeToggle = () => <div data-testid="osk-mode-toggle" />;

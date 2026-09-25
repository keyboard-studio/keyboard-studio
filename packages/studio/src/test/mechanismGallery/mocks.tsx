// Shared module mocks and lifecycle hooks for the MechanismGallery.*.test.tsx
// suites. Services, useKeyboardArtifact, and OSKFrame are mocked so tests never
// touch WASM, VFS side-effects, or a real pattern catalog. Every suite wires
// the mocks with the hoist-safe pattern:
//
//   vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
//   vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
//   vi.mock("@keyboard-studio/engine", async (importOriginal) =>
//     (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
//       await importOriginal<typeof import("@keyboard-studio/engine")>(),
//     ),
//   );
//   vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));
//
// and imports the spies/state below statically: the factory's dynamic import
// and the suite's static import resolve to the same module instance, so a
// suite sees the same spy objects the mocked modules hand to MechanismGallery.
//
// This module must stay free of runtime imports that reach
// @keyboard-studio/engine (stores, MechanismGallery itself): the engine mock
// factory imports it, so any such import would be circular. Seeders and IR
// fixtures live in ./harness.ts instead.

import { afterEach, beforeAll, vi, type Mock } from "vitest";
import { cleanup } from "@testing-library/react";
import type {
  MechanismAssignment,
  Pattern,
  PatternLibraryService,
  PatternMatch,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";
import { PATTERN_DEADKEY, PATTERN_SEQUENCE } from "../../editors/assignLoop/patternIds.ts";
import { installDialogShim } from "../dialogShim.ts";

// ---------------------------------------------------------------------------
// Spies shared across mock closures and test bodies.
// ---------------------------------------------------------------------------

export const applyAssignmentsToVfsSpy = vi.fn(
  (
    _vfs: VirtualFS,
    _keyboardId: string,
    _assignments: ReadonlyArray<MechanismAssignment>,
    _getPattern: (_id: string) => unknown,
  ) => ({
    kmn: "c mock result",
    warnings: [] as string[],
  }),
);
// Wraps the REAL collectCharContributors by default (set in withMockedEngine
// below, which has `original` in scope) — every existing test is unaffected.
// The SHOW-ALL floor-row test overrides this for one call only to simulate an
// unrecognized-shape producer collectCharContributors can't attribute at all,
// without needing to construct a real IR edge case for it.
export const collectCharContributorsSpy: Mock = vi.fn();

// ---------------------------------------------------------------------------
// lib/services.ts — controls what filterFor / getById return.
// The mock always resolves PATTERN_SEQUENCE and PATTERN_DEADKEY explicitly so
// the component never gets undefined from getById().
// ---------------------------------------------------------------------------

export const mockSvc: PatternLibraryService = {
  listAll: () => Promise.resolve([latinDeadkeyAcuteSingle]),
  getById: (id: string) => {
    if (id === latinDeadkeyAcuteSingle.id) return Promise.resolve(latinDeadkeyAcuteSingle);
    // Return a minimal stub for the two well-known IDs the component always loads.
    if (id === PATTERN_SEQUENCE || id === PATTERN_DEADKEY) {
      return Promise.resolve({
        ...latinDeadkeyAcuteSingle,
        id,
        title: id === PATTERN_SEQUENCE ? "Multi-char sequence" : "Deadkey single tap",
      });
    }
    return Promise.resolve(undefined);
  },
  filterFor: () => {
    const match: PatternMatch = {
      patternId: latinDeadkeyAcuteSingle.id,
      rank: 1,
      reason: "primary-strategy",
      strategyId: "S-02",
    };
    return Promise.resolve([match]);
  },
};

// Synchronous counterpart of mockSvc.getById (same three well-known ids) —
// needed by useInventoryDiff's buildSessionProducedSet call, which resolves
// patterns synchronously inside a useMemo, not via the async service.
export function mockGetPatternByIdSync(id: string): Pattern | undefined {
  if (id === latinDeadkeyAcuteSingle.id) return latinDeadkeyAcuteSingle;
  if (id === PATTERN_SEQUENCE || id === PATTERN_DEADKEY) {
    return {
      ...latinDeadkeyAcuteSingle,
      id,
      title: id === PATTERN_SEQUENCE ? "Multi-char sequence" : "Deadkey single tap",
    };
  }
  return undefined;
}

export const getPatternLibraryService = () => mockSvc;
export const getPatternByIdSync = mockGetPatternByIdSync;
export const USE_REAL = false;

// ---------------------------------------------------------------------------
// hooks/useKeyboardArtifact.ts — tests never touch WASM. The stage is set per
// test via setMockStage; the vfsTransform the component passes is captured
// in _lastVfsTransform (a live binding, so importers read the current value).
// ---------------------------------------------------------------------------

export let _mockStage: Stage = { kind: "idle" };
export const _mockRetry: Mock = vi.fn();
export const _mockRecompile: Mock = vi.fn();
export let _lastVfsTransform:
  | ((vfs: VirtualFS, keyboardId: string) => { warnings: string[] })
  | null
  | undefined = undefined;

export function setMockStage(s: Stage) {
  _mockStage = s;
}

export const useKeyboardArtifact = (
  _baseKeyboard: unknown,
  _scaffoldSpec: unknown,
  vfsTransform: ((vfs: VirtualFS, keyboardId: string) => { warnings: string[] }) | null | undefined,
): { stage: Stage; retry: Mock; recompile: Mock } => {
  _lastVfsTransform = vfsTransform;
  return { stage: _mockStage, retry: _mockRetry, recompile: _mockRecompile };
};

// ---------------------------------------------------------------------------
// @keyboard-studio/engine — replace applyAssignmentsToVfs; wrap
// collectCharContributors with a spy that defaults to the real implementation.
// ---------------------------------------------------------------------------

export function withMockedEngine<
  T extends { collectCharContributors: (ir: never, ch: string) => unknown },
>(
  original: T,
): T & {
  applyAssignmentsToVfs: typeof applyAssignmentsToVfsSpy;
  collectCharContributors: Mock;
} {
  collectCharContributorsSpy.mockImplementation((ir: never, ch: string) =>
    original.collectCharContributors(ir, ch),
  );
  return {
    ...original,
    applyAssignmentsToVfs: applyAssignmentsToVfsSpy,
    collectCharContributors: collectCharContributorsSpy,
  };
}

// ---------------------------------------------------------------------------
// components/OSKFrame.tsx — no iframe / KMW environment needed.
// ---------------------------------------------------------------------------

export const OSKFrame = ({
  stage,
  onKeyTap,
}: {
  stage: Stage;
  onKeyTap?: (keyId: string) => void;
}) => (
  <div data-testid="osk-frame" data-stage={stage.kind}>
    osk-frame-mock
    {onKeyTap !== undefined && (
      <button type="button" onClick={() => onKeyTap("K_E")}>
        tap-K_E
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Lifecycle — call once at the top level of every MechanismGallery suite.
// ---------------------------------------------------------------------------

export function installMechanismGalleryHooks() {
  // jsdom does not implement HTMLDialogElement.showModal()/close() — shared
  // shim (test/dialogShim.ts); see that module for rationale. Needed here
  // because the leave-warning modal (ConfirmDialog) now mounts whenever the
  // whole-inventory unimplemented-characters check finds a gap.
  beforeAll(installDialogShim);

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    _mockStage = { kind: "idle" };
    _lastVfsTransform = undefined;
  });
}

// Shared seeders and lifecycle hooks for the TouchGallery.*.test.tsx suites.
// The module mocks (and the spies/refs they share with test bodies) live in
// ./mocks.tsx; see that module for the hoist-safe vi.mock wiring each suite
// declares.

import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { installDialogShim } from "../dialogShim.ts";
import {
  buildTouchLayoutJsonSpy,
  capturedVfsTransformRef,
  defaultBuildTouchLayoutJsonImpl,
} from "./mocks.tsx";

// ---------------------------------------------------------------------------
// Seeders
// ---------------------------------------------------------------------------

export function seedStore(
  opts: {
    withInventory?: string[];
    intro?: boolean;
    /** Override the seeded desktop IR — used by the touch-layer-picker tests
     * to give the working copy real SHIFT/RALT rules so
     * `collectLayerCombosInUse` (the picker's option source) has something
     * to report beyond the always-present base layer. */
    ir?: ReturnType<typeof makeTestIR>;
  } = {},
) {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const ir = opts.ir ?? makeTestIR([]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
  if (opts.withInventory !== undefined) {
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      confirmedInventory: opts.withInventory,
    });
  }
  // The first-entry intro splash shows until the touch gallery intro is marked
  // seen. Mark it by default so tests land directly on the gallery; pass
  // { intro: true } to leave it unseen and exercise the intro itself.
  if (!opts.intro) {
    useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  }
  // spec 035 R11: these fixtures ship no base .keyman-touch-layout, so the
  // Entity-5 default (resolveTouchSeedSource) would resolve to
  // "reseed-from-desktop" (which ALWAYS emits) if left null. Existing tests
  // in these suites pin the "import-adapt + empty mods + no real edit -> emit
  // nothing" row, so seed the explicit choice — mirrors an author who picked
  // Import & adapt from the fork chooser even though there is nothing to
  // import onto (TouchSeedSourcePanel allows this; it starts from an empty
  // layout).
  useSurveySessionStore.getState().setTouchSeedSource("import-adapt");
}

/** Invoke the captured vfsTransform with a fresh VFS and the given kbId. */
export function runTransform(kbId: string) {
  const fn = capturedVfsTransformRef.current;
  if (!fn) throw new Error("vfsTransform was not captured — useKeyboardArtifact mock not called");
  const vfs = createVirtualFS([]);
  fn(vfs, kbId);
  return vfs;
}

/** Seed the store with a Phase C assignment for a specific character. */
export function seedWithDesktopAssignment(
  char: string,
  assignment: MechanismAssignment,
  extraInventory: string[] = [],
) {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const ir = makeTestIR([]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: [char, ...extraInventory],
  });
  useWorkingCopyStore.getState().recordPhase({
    phase: "C",
    answers: [],
    assignments: [assignment],
  });
  // Skip the first-entry intro splash (see seedStore) so these tests land
  // directly on the per-character gallery.
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  // spec 035 R11 — see seedStore's comment: pin the explicit import-adapt
  // choice so these fixtures don't fall into the reseed-always-emits default.
  useSurveySessionStore.getState().setTouchSeedSource("import-adapt");
}

// ---------------------------------------------------------------------------
// Lifecycle — call once at the top level of every TouchGallery suite.
// ---------------------------------------------------------------------------

export function installTouchGalleryHooks() {
  // jsdom does not implement HTMLDialogElement.showModal()/close() — shared
  // shim (test/dialogShim.ts); see that module for rationale. Needed here
  // because the leave-warning modal (ConfirmDialog) now mounts whenever the
  // FR-008 gate finds uncovered characters.
  beforeAll(installDialogShim);

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    capturedVfsTransformRef.current = null;
  });

  beforeEach(() => {
    // vi.clearAllMocks() (afterEach, above) clears call history but NOT a
    // custom .mockImplementation() a prior test installed via
    // buildTouchLayoutJsonSpy.mockImplementation(...) — re-pin the covering
    // default here so every test starts from known-good behavior under the
    // FR-008 completion gate (layoutForLintAndGate parses this JSON).
    buildTouchLayoutJsonSpy.mockImplementation(defaultBuildTouchLayoutJsonImpl);
  });
}

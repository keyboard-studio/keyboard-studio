// Shared seeders, IR fixtures, and query helpers for the
// MechanismGallery.*.test.tsx suites. The module mocks, the spies/state they
// share with test bodies, and the lifecycle hooks every suite installs live in
// ./mocks.tsx. This module imports nothing from vitest.

import { screen } from "@testing-library/react";
import type { IRGroup, IRRule, IRStore, MechanismAssignment } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------


/**
 * The kbgen suggestion row's full visible text, read off its `role="note"`
 * container rather than a single text node. The row's key name now renders
 * boxed inside a `<KeyCap>` element (the physical-key keycap convention),
 * which splits the sentence across sibling DOM nodes — RTL's `getByText`
 * only matches a node's OWN direct text-node children (see
 * `@testing-library/dom`'s `getNodeText`), so a query for the WHOLE sentence
 * never matches any single node once it contains a nested element. Reading
 * the note's `textContent` sidesteps that by concatenating every descendant
 * text node, matching what a sighted user actually sees. Throws (via
 * `getByRole`) if the row isn't rendered at all — callers asserting absence
 * should query `queryByRole("note", { name: /kbgen seeder/i })` instead.
 */
export function suggestionRowText(): string {
  return (
    screen.getByRole("note", { name: /Placement suggestion from kbgen seeder/i })
      .textContent ?? ""
  );
}

// ---------------------------------------------------------------------------
// Seeders and IR fixtures
// ---------------------------------------------------------------------------

/** Seed confirmedInventory via Phase B result. baseIr stays null so
 *  useInventoryDiff returns lettersToAdd === inventory (no diff).
 *
 *  The first-entry intro splash shows until the mechanism gallery intro is
 *  marked seen. Mark it by default so tests land directly on the gallery; pass
 *  { intro: true } to leave it unseen and exercise the intro itself. */
export function seedInventory(chars: string[], opts: { intro?: boolean } = {}) {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: chars,
  });
  if (!opts.intro) {
    useWorkingCopyStore.getState().markGalleryIntroSeen("mechanism");
  }
}

/** A minimal `group(main)` block — enough for planShiftAssignment/isMnemonicLayout. */
export function mainGroup(): IRGroup {
  return { nodeId: "g-main", name: "main", usingKeys: true, rules: [], readonly: false };
}

/**
 * A `group(main)` block that already carries an explicit CAPS/NCAPS pair for
 * K_Q — exercises the caps-handling (Layer-A Check #10) branch of
 * planShiftAssignment/keyHasCapsHandling (P0 scenario C/D fixture).
 */
export function mainGroupWithCaps(): IRGroup {
  const capsRule: IRRule = {
    nodeId: "r-K_Q-caps",
    context: [{ kind: "vkey", name: "K_Q", modifiers: ["CAPS"] }],
    output: [{ kind: "char", value: "Q" }],
  };
  const ncapsRule: IRRule = {
    nodeId: "r-K_Q-ncaps",
    context: [{ kind: "vkey", name: "K_Q", modifiers: ["NCAPS"] }],
    output: [{ kind: "char", value: "q" }],
  };
  return { nodeId: "g-main", name: "main", usingKeys: true, rules: [capsRule, ncapsRule], readonly: false };
}

/** The `&MNEMONICLAYOUT` system store, set to "1". */
export function mnemonicStore(): IRStore {
  return {
    nodeId: "s-mnemonic",
    name: "MNEMONICLAYOUT",
    items: [{ kind: "char", value: "1" }],
    isSystem: true,
  };
}

/**
 * Instantiate the working copy with a `main` group so shift-layer targeting
 * (planShiftAssignment / isMnemonicLayout) has an IR to evaluate against —
 * without this, MechanismGallery's workingIr is null and Shift targeting is
 * disabled by design (see "shift toggle disabled" tests below for the
 * mnemonic case; this helper covers the "IR present" case).
 *
 * `opts.caps` swaps in {@link mainGroupWithCaps} — a main group where K_Q
 * already has an explicit CAPS/NCAPS pair, exercising the caps-handling
 * branch of planShiftAssignment.
 */
export function instantiateWorkingCopy(opts: { mnemonic?: boolean; caps?: boolean } = {}) {
  const seedVfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const group = opts.caps === true ? mainGroupWithCaps() : mainGroup();
  const ir = makeTestIR([group], opts.mnemonic === true ? [mnemonicStore()] : []);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: seedVfs, ir });
}

/** Build a `main` group with a single rule under the given vkey/modifiers. */
export function groupWithModifiers(vkey: string, modifiers: string[]): IRGroup {
  return {
    nodeId: "g-main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      {
        nodeId: `r-${vkey}-${modifiers.join("-")}`,
        context: [{ kind: "vkey", name: vkey, modifiers }],
        output: [{ kind: "char", value: "x" }],
      },
    ],
  };
}

export function instantiateWithModifiersInUse(vkey: string, modifiers: string[]): void {
  const seedVfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const ir = makeTestIR([groupWithModifiers(vkey, modifiers)], []);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: seedVfs, ir });
}

/**
 * Phase C physical assignments read directly (mirrors the component's own
 * `sessionAssignments`) rather than the store's merged `session.assignments`
 * view — the merge is last-wins per (modality, scope, target) and would
 * collapse two coexisting mechanisms for the same character.
 */
export function getPhaseCPhysicalAssignments(): MechanismAssignment[] {
  const phaseResults = useWorkingCopyStore.getState().phaseResults;
  return (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
    (a) => a.modality === "physical",
  );
}

// T017 / spec-014 — add-gallery (mechanism assignment) IR projection through the
// mutate seam.
//
// The add-gallery reference emit is text-based (applyAssignmentsToVfs writes the
// injected .kmn directly). When the seam flag is on, projectWorkingCopyVfs ALSO
// derives the canonical assignment IR through applyMutatePatch / ADD_GALLERY_WRITES
// (parsing the just-written .kmn back to IR). The emitted .kmn must stay
// byte-identical across both flag states (M6/SC-008), and the seam derivation must
// stay scoped to the physical assignment targets (groups[]/stores[]) — never the
// header / deferred keycap+touch targets (M3).
//
// This file does NOT mock @keyboard-studio/engine — the real injection + parse
// pipeline runs.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md (M3/M6)

import { describe, it, expect, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { MechanismAssignment, Pattern } from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";
import {
  ADD_GALLERY_WRITES,
  applyAddGalleryMutate,
  buildAddGalleryPatch,
} from "../steps/editorMutate.ts";
import { applyMutatePatch, MutatePatchContainmentError } from "../steps/mutateApply.ts";
import { parseKmn } from "@keyboard-studio/engine";

const VALID_SLOT_VALUES = {
  triggerKey: "K_QUOTE",
  accentChar: "́",
  baseLetters: "aeiouAEIOU",
  accentedForms: "áéíóúÁÉÍÓÚ",
};

function makeAssignment(): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "physical",
    mechanisms: [{ patternId: latinDeadkeyAcuteSingle.id, slotValues: VALID_SLOT_VALUES }],
  };
}

function resolver(id: string): Pattern | undefined {
  return id === latinDeadkeyAcuteSingle.id ? latinDeadkeyAcuteSingle : undefined;
}

const SCAFFOLD_KMN =
  "c Auto-generated scaffold\n" + "store(&VERSION) '10.0'\n" + "begin Unicode > use(main)\n";

function makeVfs() {
  return createVirtualFS([{ path: "source/kb.kmn", content: SCAFFOLD_KMN, isBinary: false }]);
}

/** Parse the scaffold to a real baseIr so carve step 1 has a coherent IR. */
function baseIr() {
  return parseKmn(SCAFFOLD_KMN, "kb").ir;
}

function projectKmn(): string {
  const vfs = makeVfs();
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "kb",
    baseIr: baseIr(),
    deletedNodeIds: new Set(),
    deletedItemIds: new Set(),
    assignments: [makeAssignment()],
    getPattern: resolver,
    identity: null,
  });
  return vfs.get("source/kb.kmn")?.content as string;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("editorMutate — ADD_GALLERY_WRITES surface", () => {
  it("declares exactly the physical assignment targets groups[] + stores[] (no header)", () => {
    expect(ADD_GALLERY_WRITES.map((p) => p[0])).toEqual(["groups", "stores"]);
  });

  it("buildAddGalleryPatch takes only groups/stores from the assigned IR", () => {
    const assigned = parseKmn(
      SCAFFOLD_KMN + "store(extra) 'q'\ngroup(main) using keys\n+ [K_A] > 'x'\n",
      "kb",
    ).ir;
    expect(Object.keys(buildAddGalleryPatch(assigned)).sort()).toEqual(["groups", "stores"]);
  });

  it("rejects an add patch that reaches header (out of ADD_GALLERY_WRITES) — M3", () => {
    const base = baseIr();
    expect(() =>
      applyMutatePatch(base, { header: { ...base.header, name: "X" } }, ADD_GALLERY_WRITES),
    ).toThrow(MutatePatchContainmentError);
  });
});

describe("projectWorkingCopyVfs — add-gallery flag parity (M6/SC-008)", () => {
  it("emits byte-identical .kmn with the seam on vs off", () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const off = projectKmn();

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    const on = projectKmn();

    expect(typeof off).toBe("string");
    expect(on).toBe(off);
    // The assignment actually injected (the deadkey trigger rule is present).
    expect(on).toMatch(/deadkey|dk\(/);
  });

  it("the seam derives a canonical assignment IR scoped to groups/stores", () => {
    // Drive the helper directly to prove the derived IR carries the injected
    // mechanism while leaving the base header untouched.
    const base = baseIr();
    const injected = parseKmn(
      SCAFFOLD_KMN + "group(main) using keys\n+ [K_QUOTE] > deadkey(acute)\n",
      "kb",
    ).ir;
    const out = applyAddGalleryMutate(base, injected);
    expect(out.groups).toEqual(injected.groups);
    expect(out.stores).toEqual(injected.stores);
    // header carried through from base, never written by the add seam.
    expect(out.header).toEqual(base.header);
  });
});

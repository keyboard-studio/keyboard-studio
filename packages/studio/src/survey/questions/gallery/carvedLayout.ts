// carvedLayout — gallery decision module for `carved-layout` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T032 (US3).
// The value is the carve outcome: the removal set (per-item provenance
// RULED flat enum, T003), the spec-076 carve dispositions unchanged, and
// the closed-keyboard card outcome.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "carvedLayout",
  type: "notice" as const,
  prompt: "What should be removed from the base keyboard?",
  audit_label: "Carved layout",
};

import type { CarveDisposition } from "@keyboard-studio/contracts";

/**
 * One removal-set item (RULED, T003 / owner ruling 2026-10-06): flat
 * per-item provenance — asked (the author removed it), derived (a studio
 * rule proposed and the author accepted the set), or extracted (it came
 * from the base keyboard's evidence).
 */
export interface CarveRemovalItem {
  kind: "node" | "item" | "family" | "char";
  id: string;
  provenance: "asked" | "derived" | "extracted";
}

/** The carved-layout decision value (data-model.md). */
export interface CarvedLayoutValue {
  removals: CarveRemovalItem[];
  dispositions: CarveDisposition[];
  closedKeyboardCard: "accepted" | "declined" | null;
}

const carvedLayout: GalleryModule<CarvedLayoutValue> = {
  definition,
  provides: ["carved-layout"],
  screen: "carve",
  requires: ["base-keyboard", "windows-layout", "marks-treatment", "punctuation-inventory", "invisibles-inventory", "retained-convenience-chars"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default carvedLayout;

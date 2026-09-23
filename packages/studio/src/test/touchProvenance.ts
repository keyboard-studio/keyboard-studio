// Provenance-tagged touch-layout fixtures for the spec-014 US2 no-clobber tests
// (T019/T020/T021). Builds KeyboardIRs whose touch keys mix `base-derived`,
// `physical-suggested`, and `hand-set` provenance so the re-propagation tests
// can assert the no-clobber rule (R2), promotion (R4), and coalescing (R3).
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/repropagation.contract.md
//   specs/014-mutate-seam-touch-propagation/contracts/provenance.contract.md

import type {
  KeyboardIR,
  TouchKeyIR,
  TouchKeyProvenance,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";

/** Build a single touch key with the given id/text and optional provenance. */
export function key(
  id: string,
  text: string,
  provenance?: TouchKeyProvenance,
): TouchKeyIR {
  return provenance === undefined
    ? { nodeId: `n_${id}`, id, text }
    : { nodeId: `n_${id}`, id, text, provenance };
}

/**
 * A single-platform, single-layer touch layout with one row of the given keys.
 */
export function layoutWithKeys(keys: TouchKeyIR[]): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [{ id: "default", rows: [{ keys }] }],
      },
    ],
    nodeIds: keys.map((k) => [
      `phone:default:${k.id}`,
      { kind: "touchKey", nodeId: k.nodeId } as const,
    ]),
  };
}

/** Minimal KeyboardIR header + empty bodies; the touchLayout is the payload. */
export function irWithTouch(touchLayout: TouchLayoutIR): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "fixture",
      name: "Fixture",
      bcp47: ["en"],
      copyright: "(c)",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    touchLayout,
    recognizedPatterns: [],
  };
}

/**
 * A mixed-provenance touch layout: one `hand-set`, one `base-derived`, one
 * `physical-suggested`, and one untagged (legacy → treated as `hand-set`).
 */
export function mixedProvenanceLayout(): TouchLayoutIR {
  return layoutWithKeys([
    key("K_A", "a", "hand-set"),
    key("K_B", "b", "base-derived"),
    key("K_C", "c", "physical-suggested"),
    key("K_D", "d"), // untagged → conservatively hand-set
  ]);
}

/** KeyboardIR carrying {@link mixedProvenanceLayout}. */
export function mixedProvenanceIR(): KeyboardIR {
  return irWithTouch(mixedProvenanceLayout());
}

/** A touch layout with no hand-set keys (the trivial-pass case, AC US2-4). */
export function allDerivedLayout(): TouchLayoutIR {
  return layoutWithKeys([
    key("K_A", "a", "base-derived"),
    key("K_B", "b", "physical-suggested"),
  ]);
}

export function allDerivedIR(): KeyboardIR {
  return irWithTouch(allDerivedLayout());
}

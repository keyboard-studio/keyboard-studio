// editorMutate — the editor-shell write surfaces of the spec-014 mutate() seam.
//
// Each gallery routes its IR derivation through applyMutatePatch with a declared
// write surface: CARVE_WRITES (T016b), ADD_GALLERY_WRITES (T017) and
// TOUCH_WRITES (US2 foundation). The shared seam contract runs once per surface:
//   - M1: the base IR is never mutated;
//   - M3: a patch that strays outside the surface (into header) is rejected
//     whole, with the IR left unchanged;
//   - M4: applying the same patch twice equals applying it once;
//   - M5: an empty patch yields a structural copy.
// Surface-specific cases follow: carve deletion paths and reversibility,
// add-gallery patch scoping, touch provenance merge (M2).
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md

import { describe, it, expect } from "vitest";
import { formatIRPath } from "@keyboard-studio/contracts";
import { irGroup, makeCharStore, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import type {
  IRGroup,
  IRPath,
  IRRule,
  KeyboardIR,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import {
  ADD_GALLERY_WRITES,
  CARVE_WRITES,
  TOUCH_WRITES,
  applyAddGalleryMutate,
  applyCarveMutate,
  buildAddGalleryPatch,
  buildCarvePatch,
} from "../../src/steps/editorMutate.ts";
import { applyMutatePatch, MutatePatchContainmentError } from "../../src/steps/mutateApply.ts";

// ---------------------------------------------------------------------------
// Carve fixture: one group with a plain rule and a self-paired any()/index()
// rule over the dkt output store (so its slots are an eligible coordinated
// drop), plus an unreferenced extra store.
// ---------------------------------------------------------------------------

function rule(nodeId: string): IRRule {
  return vkeyRule({ nodeId, output: "a" });
}

function group(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return irGroup({ nodeId, name, rules });
}

function carveIR(): KeyboardIR {
  const g = group("g0", "main", [
    rule("r0"),
    {
      nodeId: "r1",
      context: [{ kind: "any", storeRef: "dkt" }],
      output: [{ kind: "index", storeRef: "dkt", offset: 1 }],
    },
  ]);
  return makeTestIR([g], [makeCharStore("dkt", "dkt", "xyz"), makeCharStore("s1", "extra", "de")]);
}

// ---------------------------------------------------------------------------
// Add-gallery fixture: a bare scaffold, and the IR the text injection would
// parse back after assigning a mechanism.
// ---------------------------------------------------------------------------

const SCAFFOLD_KMN =
  "c Auto-generated scaffold\n" + "store(&VERSION) '10.0'\n" + "begin Unicode > use(main)\n";

function scaffoldIR(): KeyboardIR {
  return parseKmn(SCAFFOLD_KMN, "kb").ir;
}

function assignedIR(): KeyboardIR {
  return parseKmn(
    SCAFFOLD_KMN + "store(extra) 'q'\ngroup(main) using keys\n+ [K_QUOTE] > deadkey(acute)\n",
    "kb",
  ).ir;
}

// ---------------------------------------------------------------------------
// Touch fixture: a touch layout with one hand-set and one base-derived key, and
// the re-propagation patch (the shape repropagate.ts emits) that re-tags the
// base-derived key as physical-suggested.
// ---------------------------------------------------------------------------

function touchLayout(provenanceB: "base-derived" | "physical-suggested"): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "tablet",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  { nodeId: "n1", id: "K_A", text: "a", provenance: "hand-set" },
                  { nodeId: "n2", id: "K_B", text: "b", provenance: provenanceB },
                ],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [["tablet:default:K_A", { kind: "touchKey", nodeId: "n1" }]],
  };
}

function touchIR(): KeyboardIR {
  return { ...makeTestIR([]), touchLayout: touchLayout("base-derived") };
}

function repropagationPatch(): Partial<KeyboardIR> {
  return { touchLayout: touchLayout("physical-suggested") };
}

// ---------------------------------------------------------------------------
// Shared M1/M3/M4/M5 contract, once per write surface.
// ---------------------------------------------------------------------------

interface Surface {
  name: string;
  writes: readonly IRPath[];
  declared: readonly string[];
  base: () => KeyboardIR;
  /** A representative in-surface patch, built the way the gallery builds it. */
  patch: (base: KeyboardIR) => Partial<KeyboardIR>;
}

const SURFACES: readonly Surface[] = [
  {
    name: "carve",
    writes: CARVE_WRITES,
    declared: ["groups[]", "stores[]", "raw[]"],
    base: carveIR,
    patch: (base) => buildCarvePatch(base, new Set(["s1"]), new Set(["dkt#1"])),
  },
  {
    name: "add-gallery",
    writes: ADD_GALLERY_WRITES,
    declared: ["groups[]", "stores[]"],
    base: scaffoldIR,
    patch: () => buildAddGalleryPatch(assignedIR()),
  },
  {
    name: "touch",
    writes: TOUCH_WRITES,
    declared: ["touchLayout.platforms[].layers[].rows[].keys[]", "touchLayout.nodeIds[]"],
    base: touchIR,
    patch: () => repropagationPatch(),
  },
];

describe.each(SURFACES)("editorMutate — $name write surface", ({ writes, declared, base, patch }) => {
  it("declares exactly its surface (header and comments excluded)", () => {
    expect(writes.map(formatIRPath)).toEqual(declared);
  });

  it("an in-surface patch passes containment and never mutates the base IR (M1)", () => {
    const ir = base();
    const snapshot = structuredClone(ir);
    const next = applyMutatePatch(ir, patch(ir), writes);
    expect(ir).toEqual(snapshot);
    expect(next).not.toEqual(ir);
  });

  it("rejects a patch that reaches header, whole, leaving the IR unchanged (M3)", () => {
    const ir = base();
    const snapshot = structuredClone(ir);
    const stray = { ...patch(ir), header: { ...ir.header, name: "HIJACKED" } } as Partial<KeyboardIR>;
    expect(() => applyMutatePatch(ir, stray, writes)).toThrow(MutatePatchContainmentError);
    expect(ir).toEqual(snapshot);
  });

  it("applying the same patch twice equals applying it once (M4)", () => {
    const ir = base();
    const p = patch(ir);
    const once = applyMutatePatch(ir, p, writes);
    expect(applyMutatePatch(once, p, writes)).toEqual(once);
  });

  it("an empty patch yields a structural copy (M5)", () => {
    const ir = base();
    const next = applyMutatePatch(ir, {}, writes);
    expect(next).toEqual(ir);
    expect(next).not.toBe(ir);
  });
});

// ---------------------------------------------------------------------------
// Carve: buildCarvePatch / applyCarveMutate
// ---------------------------------------------------------------------------

describe("editorMutate — carve deletion paths", () => {
  it("the patch only ever carries groups/stores/raw — never header/comments", () => {
    const patch = buildCarvePatch(carveIR(), new Set(["g0"]), new Set());
    expect(Object.keys(patch).sort()).toEqual(["groups", "raw", "stores"]);
  });

  it("drops a whole group via the seam (groups[] write), base untouched", () => {
    const ir = carveIR();
    const out = applyCarveMutate(ir, new Set(["g0"]), new Set());
    expect(out.groups).toHaveLength(0);
    expect(ir.groups).toHaveLength(1);
  });

  it("drops a whole store via the seam (stores[] write)", () => {
    const out = applyCarveMutate(carveIR(), new Set(["s1"]), new Set());
    expect(out.stores.map((s) => s.nodeId)).toEqual(["dkt"]);
  });

  it("splices a store slot out entirely (deletedItemIds slot path, #931 — nul-fill mode removed)", () => {
    const out = applyCarveMutate(carveIR(), new Set(), new Set(["dkt#1"]));
    const dkt = out.stores.find((s) => s.nodeId === "dkt")!;
    // "y" (was index 1) is spliced out, never nul-filled in place, so the
    // store shrinks and its surviving chars close the gap.
    expect(dkt.items).toEqual([
      { kind: "char", value: "x" },
      { kind: "char", value: "z" },
    ]);
  });

  it("treats a bare rule item id as a whole-node deletion", () => {
    const out = applyCarveMutate(carveIR(), new Set(), new Set(["r0"]));
    expect(out.groups[0]!.rules.map((r) => r.nodeId)).toEqual(["r1"]);
  });
});

describe("editorMutate — carve re-derivation from baseIr (M4 / reversibility)", () => {
  it("deriving the same overlay from baseIr twice is byte-identical", () => {
    const ir = carveIR();
    const once = applyCarveMutate(ir, new Set(["g0"]), new Set(["dkt#1"]));
    const twice = applyCarveMutate(ir, new Set(["g0"]), new Set(["dkt#1"]));
    expect(twice).toEqual(once);
  });

  it("re-deriving from baseIr with a SHRINKING deletion set yields fewer deletions", () => {
    const ir = carveIR();
    expect(applyCarveMutate(ir, new Set(["s1"]), new Set()).stores.map((s) => s.nodeId)).toEqual(["dkt"]);
    // Restore: derive from baseIr again with the shrunk (empty) set — s1 returns.
    expect(applyCarveMutate(ir, new Set(), new Set()).stores.map((s) => s.nodeId)).toEqual(["dkt", "s1"]);
  });
});

describe("editorMutate — carve keepAll / restoreAll (empty overlay, M5)", () => {
  it("an empty overlay produces an empty patch", () => {
    expect(buildCarvePatch(carveIR(), new Set(), new Set())).toEqual({});
  });

  it("an empty overlay yields a structural copy of baseIr (deep-equal, fresh object)", () => {
    const ir = carveIR();
    const out = applyCarveMutate(ir, new Set(), new Set());
    expect(out).toEqual(ir);
    expect(out).not.toBe(ir);
  });
});

// ---------------------------------------------------------------------------
// Add-gallery: buildAddGalleryPatch / applyAddGalleryMutate
// ---------------------------------------------------------------------------

describe("editorMutate — add-gallery patch scoping", () => {
  it("buildAddGalleryPatch takes only groups/stores from the assigned IR", () => {
    expect(Object.keys(buildAddGalleryPatch(assignedIR())).sort()).toEqual(["groups", "stores"]);
  });

  it("applyAddGalleryMutate carries the injected groups/stores and keeps the base header", () => {
    const base = scaffoldIR();
    const injected = assignedIR();
    const out = applyAddGalleryMutate(base, injected);
    expect(out.groups).toEqual(injected.groups);
    expect(out.stores).toEqual(injected.stores);
    expect(out.header).toEqual(base.header);
  });
});

// ---------------------------------------------------------------------------
// Touch: provenance merge
// ---------------------------------------------------------------------------

describe("editorMutate — touch re-propagation patch", () => {
  it("rewrites the touch keys (incl. provenance) and preserves sibling IR (M2)", () => {
    const base = touchIR();
    const next = applyMutatePatch(base, repropagationPatch(), TOUCH_WRITES);
    const keys = next.touchLayout?.platforms[0]?.layers[0]?.rows[0]?.keys;
    expect(keys?.[0]?.provenance).toBe("hand-set");
    expect(keys?.[1]?.provenance).toBe("physical-suggested");
    expect(next.header).toEqual(base.header);
    expect(next.stores).toEqual(base.stores);
    expect(next.groups).toEqual(base.groups);
  });
});

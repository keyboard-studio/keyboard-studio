// useFacetTransform — studio orchestration for the spec 039 facet-transform
// engine (propose → confirm → commit on the single working copy).
//
// The engine is pure/copy-return and studio-state-free (Article VI): this hook is
// the ONLY seam that reads the working IR and writes it back. `propose` resolves a
// TransformProposal | TransformRefusal from the injected 037/036 measurement
// (research D4 — the measurement is passed in, never loaded here); `commit` runs
// the gated `applyFacetTransform` and, on `committed`, writes the next IR via the
// store's `commitFacetTransform` (setWorkingIR + FR-013 axis re-seed).

import { useCallback } from "react";
import {
  proposeFacetTransform,
  applyFacetTransform,
} from "@keyboard-studio/engine";
import type {
  CommitResult,
  ProposeOptions,
  SourceFacetMeasurement,
  TransformProposal,
  TransformRefusal,
  TransformRequest,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

export interface UseFacetTransform {
  /** True once a working copy exists (transforms operate on it). */
  ready: boolean;
  /** Pure propose — resolves the request against the matrix + injected measurement. */
  propose: (
    measurement: SourceFacetMeasurement,
    request: TransformRequest,
    options?: ProposeOptions,
  ) => TransformProposal | TransformRefusal | null;
  /** Run the confirmed transform through the gate; on commit, write the store. */
  commit: (proposal: TransformProposal) => Promise<CommitResult | null>;
}

export function useFacetTransform(): UseFacetTransform {
  const ir = useWorkingCopyStore((s) => s.ir);
  const commitFacetTransform = useWorkingCopyStore((s) => s.commitFacetTransform);

  const propose = useCallback<UseFacetTransform["propose"]>(
    (measurement, request, options) => {
      if (ir === null) return null;
      return proposeFacetTransform(ir, measurement, request, options);
    },
    [ir],
  );

  const commit = useCallback<UseFacetTransform["commit"]>(
    async (proposal) => {
      if (ir === null) return null;
      const result = await applyFacetTransform(ir, proposal);
      if (result.status === "committed") {
        // Overlay-preserving write + FR-013 axis re-seed when the produced set changed.
        commitFacetTransform(result.nextIr, result.producedSetChanged);
      }
      return result;
    },
    [ir, commitFacetTransform],
  );

  return { ready: ir !== null, propose, commit };
}

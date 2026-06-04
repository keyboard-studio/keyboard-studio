// see spec.md section 10 — ValidatorService mock

import type {
  ValidatorService,
  FragmentValidationContext,
} from "../validator";
import type { LintFinding } from "../lintFinding";
import { validatorFindings } from "../fixtures/index";

/**
 * In-memory mock of {@link ValidatorService}.
 *
 * Returns a FIXED fixture array for any input — `validate()` always returns
 * `validatorFindings` regardless of `kmnSource`, and `validateFragment()`
 * returns the Layer A subset regardless of `kmnFragment` or `projectContext`.
 * Real ValidatorService implementations route inputs to the WASM oracle
 * (spec §10) and produce input-dependent diagnostics.
 *
 * Use this mock for UI / contract / shape tests; it is NOT useful for
 * validator-logic tests (use the real ValidatorService implementation
 * once it lands).
 *
 * @see spec.md §10
 */
export const mockValidator: ValidatorService = {
  validate(_kmnSource: string): Promise<LintFinding[]> {
    // Returns the Layer A + B fixture regardless of source content.
    // All findings are sorted errors first, warnings next, hints last
    // (the fixture already satisfies this order).
    return Promise.resolve([...validatorFindings]);
  },

  validateFragment(
    _kmnFragment: string,
    _slots: Record<string, string>,
    _projectContext?: FragmentValidationContext
  ): Promise<LintFinding[]> {
    // For a fragment, return only the Layer A findings (no style pass on fragments).
    // A real implementation would also consult _projectContext.existingStores /
    // existingGroups / existingDeadkeys to flag merge-time duplicate-name
    // collisions that a fragment can't see in isolation (#90).
    const fragmentFindings = validatorFindings.filter((f) => f.layer === "A");
    return Promise.resolve([...fragmentFindings]);
  },
};

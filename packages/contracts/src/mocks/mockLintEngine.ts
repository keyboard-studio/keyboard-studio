// see spec.md section 10 / section 11 — LintEngineService mock

import type { LintEngineService } from "../lintEngine";
import type { VirtualFS } from "../virtualFS";
import type { LintFinding } from "../lintFinding";
import { layerCFindings } from "../fixtures/index";

/**
 * In-memory mock of {@link LintEngineService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §10 / §11
 */
export const mockLintEngine: LintEngineService = {
  lint(_fs: VirtualFS, _keyboardId: string): Promise<LintFinding[]> {
    // Returns the Layer C findings fixture.
    // All findings have layer === "C" as required by the service contract.
    return Promise.resolve([...layerCFindings]);
  },
};

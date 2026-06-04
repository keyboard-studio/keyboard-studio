// see spec.md section 10 — lint engine (Layer C: criteria.md hygiene)

import type { VirtualFS } from "./virtualFS";
import type { LintFinding } from "./lintFinding";

/**
 * Service contract for the Layer C hygiene lint engine.
 * Packaged as `@keymanapp/keyboard-lint`.
 *
 * Layer C checks `criteria.md` compliance across the virtual FS as a whole
 * (not just the `.kmn` source). It runs on each phase exit and at submit,
 * NOT per-keystroke — that per-keystroke role belongs to {@link ValidatorService}
 * (Layers A and B). A Layer C finding with severity "error" or "fatal" blocks
 * phase progression (band 2: "layer-c-enforce", §14 Decision 4).
 *
 * The checked criteria are those classified `band: "layer-c-enforce"` in the
 * `Criterion` catalog (criteria.ts). Band-1 ("scaffolder-bake") criteria have
 * already been enforced at scaffold time and are not rechecked here.
 *
 * @see spec.md §10 (Layer C)
 * @see spec.md §11 (criteria.md compliance bands)
 * @see spec.md §14 Decision 4 (four quality bands)
 */
export interface LintEngineService {
  /**
   * Run all Layer C hygiene checks against the current virtual FS state.
   *
   * Checks the entire keyboard folder layout (§12) — `.kmn`, `.kps`,
   * `.kvks`, `.keyman-touch-layout`, `LICENSE.md`, `HISTORY.md`,
   * `README.md`, `welcome.htm`, and `help/<id>.php` — against the
   * `layer-c-enforce` band criteria.
   *
   * This method MUST NOT mutate the provided `VirtualFS`; it reads only.
   *
   * Findings reference the virtual path in `location.file` (e.g.
   * `"source/my_keyboard.kmn"`, `"LICENSE.md"`). The `LintFinding.layer`
   * field is always `"C"` for results from this service.
   *
   * @param fs - Current virtual FS snapshot to inspect.
   * @param keyboardId - snake_case identifier used to resolve per-file
   *   paths inside the FS (e.g. `source/<keyboardId>.kmn`).
   * @returns Layer C findings for all files; empty array means the
   *   keyboard passes all enforced hygiene criteria.
   * @see spec.md §10 Layer C
   * @see spec.md §11
   */
  lint(fs: VirtualFS, keyboardId: string): Promise<LintFinding[]>;
}

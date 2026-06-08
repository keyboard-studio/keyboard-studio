// see spec.md section 11 — ScaffolderService mock

import type { ScaffolderService, ScaffoldOptions } from "../scaffolder";
import { validateKeyboardId as contractsValidateKeyboardId } from "../scaffolder";
import type { BaseKeyboard } from "../baseKeyboard";
import type { VirtualFS } from "../virtualFS";
import { scaffoldedFS } from "./mockVirtualFS";

// Three templates matching spec §9's Three-group routing exactly.
// (Previously this list was 4 templates with qwerty / qwertz split — but §9's
// routing table treats QWERTY/QWERTZ as a single group with one set of
// decisions. See #105. The combined "qwerty-qwertz" template aligns with the
// RoutingGroup type in scaffolder.ts.)
const AVAILABLE_TEMPLATES = ["qwerty-qwertz", "azerty", "non-roman"] as const;

/**
 * In-memory mock of {@link ScaffolderService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §11
 */
export const mockScaffolder: ScaffolderService = {
  validateKeyboardId(id: string): string | null {
    return contractsValidateKeyboardId(id);
  },

  scaffold(
    _base: BaseKeyboard,
    keyboardId: string,
    _displayName: string,
    _opts?: ScaffoldOptions
  ): Promise<VirtualFS> {
    const idError = this.validateKeyboardId(keyboardId);
    if (idError !== null) {
      return Promise.reject(new Error(`invalid keyboardId: ${idError}`));
    }
    // Returns the pre-built scaffolded FS fixture.
    // A real implementation would clone base, run template-cleanup pipeline
    // with the routing decision in opts.group (or auto-detected from base).
    return Promise.resolve(scaffoldedFS);
  },

  listTemplates(): Promise<string[]> {
    return Promise.resolve([...AVAILABLE_TEMPLATES]);
  },
};

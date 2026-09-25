/**
 * `@keyboard-studio/engine/context-tolerance` — the browser-safe entry for the
 * context-tolerance analysis (spec 078).
 *
 * The analysis compiles and simulates, so it reaches the simulator; the root
 * `@keyboard-studio/engine` entry must stay simulator-free, which is why this
 * is a separate subpath the studio lazy-imports. Nothing in this module graph
 * may import `node:*` or `simulator/nodeKeyboardLoader` (depcruise rule
 * `context-tolerance-browser-safe`).
 *
 * Importing it installs the `new Function` keyboard loader unless a host
 * entry (e.g. `simulator/node.ts`) already chose one.
 */

import { browserKeyboardLoader } from '../simulator/browserKeyboardLoader.js';
import { setDefaultKeyboardLoader } from '../simulator/keyboardLoader.js';

setDefaultKeyboardLoader(browserKeyboardLoader);

export {
  classifyToleranceFinding,
  computeContextTolerance,
  type ToleranceClassification,
} from '../validator/context-tolerance.js';
export {
  proposeContextVariants,
  type ContextVariantsResult,
  type VariantDisclosure,
} from '../pattern-apply/context-variants.js';
export {
  buildContextToleranceOutputDiffPreview,
  createContextToleranceMigrationRule,
} from '../facet-transform/migrations/context-tolerance.js';
export { toleranceFingerprint, toleranceSiteKeys } from '../pattern-apply/tolerance-fingerprint.js';
export {
  applyContextToleranceOverlay,
  buildContextToleranceOverlay,
  presentContextToleranceSites,
  removeContextToleranceOverlay,
  type ContextToleranceOverlay,
  type ContextToleranceOverlayBatch,
} from '../pattern-apply/context-tolerance-overlay.js';
export { loadCharNames } from '../character-discovery/charNames.js';
/** For `applyFacetTransform`'s injected behavioural verification. */
export { simulate } from '../simulator/index.js';
export type { ContextVariant } from '@keyboard-studio/contracts';

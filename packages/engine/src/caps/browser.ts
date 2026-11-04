/**
 * `@keyboard-studio/engine/caps` — the browser-safe entry for the Open-path
 * upgrade and its caps comparison (spec 112). The comparison compiles and
 * simulates, so it reaches the simulator; the root engine entry stays
 * simulator-free, which is why this is a separate subpath the studio
 * lazy-imports. Nothing in this module graph may import `node:*` or
 * `simulator/nodeKeyboardLoader` (depcruise rule `caps-browser-safe`).
 */

import { browserKeyboardLoader } from '../simulator/browserKeyboardLoader.js';
import { setDefaultKeyboardLoader } from '../simulator/keyboardLoader.js';

setDefaultKeyboardLoader(browserKeyboardLoader);

export { upgradeToCasedKeys, type UpgradeResult } from './upgradeToCasedKeys.js';
export {
  compareCapsBehaviour,
  type CapsComparison,
  type CapsOutputs,
  type CapsRow,
  type CapsVerdict,
} from './compareCaps.js';
export { syncTouchCapsLayer, syncTouchCapsLayerRaw } from './syncTouchCapsLayer.js';

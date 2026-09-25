/**
 * Node entry for the headless simulator: installs the `vm`-sandbox keyboard
 * loader, then exposes the simulator API. The `./simulator` package export
 * points here, so Node callers keep today's behaviour with no setup. Browser
 * code must not import this file — see `keyboardLoader.ts`.
 */

import { setDefaultKeyboardLoader } from './keyboardLoader.js';
import { nodeKeyboardLoader } from './nodeKeyboardLoader.js';

setDefaultKeyboardLoader(nodeKeyboardLoader);

export * from './index.js';

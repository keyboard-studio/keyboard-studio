/**
 * Node VM sandbox loader for Keyman .js keyboards.
 *
 * Evaluates the keyboard script in an isolated `vm` context whose global is
 * the sandbox object the harness installed `KeymanWeb` / `keyman` on. The
 * harness half of loading lives in `keyboardLoader.ts`; this file supplies
 * only the Node-specific evaluation, and is installed by `simulator/node.ts`.
 *
 * This file intentionally imports NO DOM-dependent modules (no domKeyboardLoader).
 * See blueprint §3 and the nodeProctor.ts reference implementation.
 */

import vm from 'node:vm';

import type { KeyboardLoader, SandboxGlobals } from './keyboardLoader.js';

export const nodeKeyboardLoader: KeyboardLoader = {
  createSandbox(): SandboxGlobals {
    const sandbox: SandboxGlobals = {};
    vm.createContext(sandbox);
    return sandbox;
  },
  evaluate(scriptSrc: string, sandbox: SandboxGlobals): void {
    new vm.Script(scriptSrc).runInContext(sandbox);
  },
};

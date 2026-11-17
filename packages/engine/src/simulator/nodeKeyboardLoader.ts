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
    const sandbox: SandboxGlobals = {
      // Browsers provide alert(); a bare vm context does not — and kmc-kmn
      // emits an alert() stub for every call() whose .call_js sibling was
      // absent at compile time (e.g. korean_rr's jamo_combine). Without this
      // the stub throws `ReferenceError: alert is not defined` the first
      // time a rule calls it, and simulation cannot measure the keyboard at
      // all. The stub is a no-op: in a browser the dialog is dismissed and
      // execution continues, which is the observable behaviour modelled here.
      alert: () => {},
    };
    vm.createContext(sandbox);
    return sandbox;
  },
  evaluate(scriptSrc: string, sandbox: SandboxGlobals): void {
    new vm.Script(scriptSrc).runInContext(sandbox);
  },
};

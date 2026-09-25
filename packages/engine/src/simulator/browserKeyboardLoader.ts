/**
 * Browser loader for Keyman .js keyboards (spec 078).
 *
 * The browser has no `vm`, so the keyboard script is evaluated with
 * `new Function(...)`. Each sandbox global the harness installed (`KeymanWeb`,
 * `keyman`, `String`) becomes a parameter of that function, so the script's
 * free references to those names bind to the sandbox exactly as they do in
 * `nodeKeyboardLoader`'s `vm` context. The script runs with the sandbox as
 * `this`.
 *
 * Unlike a `vm` context this is not isolation: any *other* free identifier a
 * keyboard script names resolves to the real global. Compiled keyboards
 * reference only the harness globals, which is what the loader-equivalence
 * test pins.
 */

import type { KeyboardLoader, SandboxGlobals } from './keyboardLoader.js';

export const browserKeyboardLoader: KeyboardLoader = {
  createSandbox(): SandboxGlobals {
    return {};
  },
  evaluate(scriptSrc: string, sandbox: SandboxGlobals): void {
    const names = Object.keys(sandbox);
    const run = new Function(...names, scriptSrc) as (...args: unknown[]) => void;
    run.apply(sandbox, names.map((n) => sandbox[n]));
  },
};

/**
 * Keyboard-loader seam for the headless simulator (spec 078).
 *
 * Loading a compiled Keyman .js keyboard has two halves. The harness half —
 * building a `JSKeyboardInterface`, letting the script call `KeymanWeb.KR()`,
 * then promoting `loadedKeyboard` to `activeKeyboard` — is identical
 * everywhere and lives here. Only the *evaluation* of the script text differs
 * by host: Node uses a `vm` context (`nodeKeyboardLoader.ts`), the browser
 * uses `new Function(...)` (`browserKeyboardLoader.ts`).
 *
 * This module imports neither. The host entry installs one with
 * `setKeyboardLoader()` — `simulator/node.ts` for Node, the
 * `context-tolerance` subpath for the browser — so that nothing reachable
 * from a browser entry statically pulls in `node:vm`.
 */

import { globalObject } from './vendor/keyman/common/web-utils/globalObject.js';
import { KMWString } from './vendor/keyman/common/web-utils/index.js';
import { MinimalKeymanGlobal } from './vendor/keyman/engine/keyboard/keyboards/keyboardHarness.js';
import { JSKeyboardInterface } from './vendor/keyman/engine/js-processor/jsKeyboardInterface.js';
import type { Keyboard } from './vendor/keyman/engine/keyboard/keyboards/keyboard.js';
import type { VariableStoreSerializer } from './vendor/keyman/engine/keyboard/variableStore.js';

/**
 * The object a keyboard script perceives as its global scope. The harness
 * installs `KeymanWeb` and `keyman` on it; `String` is the host's own, so
 * string helpers the engine installs on `String` are visible to rules.
 */
export type SandboxGlobals = Record<string, unknown>;

/** Host-specific evaluation of a compiled keyboard script. */
export interface KeyboardLoader {
  /** A fresh global object for one keyboard load. */
  createSandbox(): SandboxGlobals;
  /** Run `scriptSrc` with `sandbox` as its global scope. */
  evaluate(scriptSrc: string, sandbox: SandboxGlobals): void;
}

let installed: KeyboardLoader | undefined;

/** Select the loader every subsequent `simulate()` uses. */
export function setKeyboardLoader(loader: KeyboardLoader): void {
  installed = loader;
}

/** Install `loader` only when no host entry has chosen one yet. */
export function setDefaultKeyboardLoader(loader: KeyboardLoader): void {
  installed ??= loader;
}

function currentLoader(): KeyboardLoader {
  if (installed === undefined) {
    throw new Error(
      'simulator: no keyboard loader installed. Import "@keyboard-studio/engine/simulator" ' +
        '(Node) or "@keyboard-studio/engine/context-tolerance" (browser) before simulating.',
    );
  }
  return installed;
}

/**
 * Overlay type for the parts of JSKeyboardInterface that our code needs to
 * access with their true runtime-nullable types. The upstream vendored class
 * uses `loadedKeyboard: Keyboard = null` without strict-null; we expose the
 * honest `Keyboard | null` type here so first-party code can read and clear it
 * under strict flags without global relaxation.
 */
type HarnessWithLoaded = Omit<JSKeyboardInterface, 'loadedKeyboard'> & {
  loadedKeyboard: Keyboard | null;
  activeKeyboard: JSKeyboardInterface['activeKeyboard'];
};

/**
 * Load a Keyman .js keyboard from its script source string, through the
 * installed loader.
 *
 * Returns a `JSKeyboardInterface` that has already loaded the keyboard (its
 * `loadedKeyboard` has been consumed and set as `activeKeyboard`). The
 * interface is ready to be passed directly to `JSKeyboardProcessor`.
 *
 * Enables SMP plane support (`KMWString.enableSupplementaryPlane(true)`) once
 * before the first load; subsequent calls are idempotent for that flag.
 *
 * @param scriptSrc    UTF-8 text of the compiled .js keyboard.
 * @param serializer   No-op variable store serializer (blueprint §7).
 */
export function loadKeyboardInterface(
  scriptSrc: string,
  serializer: VariableStoreSerializer,
): JSKeyboardInterface {
  const loader = currentLoader();

  // Enable SMP-aware string handling once per process (blueprint §7).
  KMWString.enableSupplementaryPlane(true);

  // The host `String` must be injected so that string operations inside
  // keyboard rules share the same prototype chain as host code (critical for
  // SMP correctness — blueprint §3, §7).
  const sandbox = loader.createSandbox();
  sandbox['String'] = globalObject().String;

  // JSKeyboardInterface extends KeyboardHarness: it installs itself as
  // sandbox.KeymanWeb (and MinimalKeymanGlobal as sandbox.keyman) in its
  // constructor. The keyboard script calls `KeymanWeb.KR(obj)`, which
  // populates `interface.loadedKeyboard`.
  const kbdInterface = new JSKeyboardInterface(sandbox, MinimalKeymanGlobal, serializer) as HarnessWithLoaded;

  loader.evaluate(scriptSrc, sandbox);

  const keyboard = kbdInterface.loadedKeyboard;
  if (!keyboard) {
    throw new Error(
      'loadKeyboardInterface: keyboard script did not call KeymanWeb.KR(); ' +
        'is this a valid Keyman .js keyboard?',
    );
  }

  // Consume loadedKeyboard and set it as the active keyboard on the interface.
  kbdInterface.loadedKeyboard = null;
  kbdInterface.activeKeyboard = keyboard;

  return kbdInterface as JSKeyboardInterface;
}

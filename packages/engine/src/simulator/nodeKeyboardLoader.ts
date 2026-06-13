/**
 * Node VM sandbox loader for Keyman .js keyboards.
 *
 * Creates a JSKeyboardInterface (which extends KeyboardHarness) in an isolated
 * vm.Script context, loads the keyboard script into it, and returns the interface
 * ready for rule processing. The loaded Keyboard is set on the returned interface.
 *
 * This file intentionally imports NO DOM-dependent modules (no domKeyboardLoader).
 * See blueprint §3 and the nodeProctor.ts reference implementation.
 */

import vm from 'node:vm';

import { globalObject } from './vendor/keyman/common/web-utils/globalObject.js';
import { KMWString } from './vendor/keyman/common/web-utils/index.js';
import { MinimalKeymanGlobal } from './vendor/keyman/engine/keyboard/keyboards/keyboardHarness.js';
import { JSKeyboardInterface } from './vendor/keyman/engine/js-processor/jsKeyboardInterface.js';
import type { Keyboard } from './vendor/keyman/engine/keyboard/keyboards/keyboard.js';
import type { VariableStoreSerializer } from './vendor/keyman/engine/keyboard/variableStore.js';

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
 * Load a Keyman .js keyboard from its script source string.
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
  // Enable SMP-aware string handling once per process (blueprint §7).
  KMWString.enableSupplementaryPlane(true);

  // Create an isolated sandbox context. The host `String` must be injected so
  // that string operations inside keyboard rules share the same prototype chain
  // as host code (critical for SMP correctness — blueprint §3, §7).
  const sandboxGlobal: Record<string, unknown> = {};
  vm.createContext(sandboxGlobal);
  sandboxGlobal['String'] = globalObject().String;

  // JSKeyboardInterface extends KeyboardHarness: it installs itself as
  // sandboxGlobal.KeymanWeb in its constructor via super(). The keyboard script
  // calls `KeymanWeb.KR(obj)` which populates `interface.loadedKeyboard`.
  // Cast to HarnessWithLoaded so first-party code can read and clear the
  // nullable `loadedKeyboard` field under strict flags (the upstream vendored
  // class uses `Keyboard = null` without strict-null; we expose the honest type).
  const kbdInterface = new JSKeyboardInterface(sandboxGlobal, MinimalKeymanGlobal, serializer) as HarnessWithLoaded;

  const script = new vm.Script(scriptSrc);
  script.runInContext(sandboxGlobal);

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

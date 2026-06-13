/**
 * Headless simulate() API for Keyman .js keyboards.
 *
 * Accepts a compiled keyboard (via its raw .js bytes from a CompileArtifact)
 * and an array of SimKeyInput events, and returns a SimulationResult with the
 * final text output and a per-step trace.
 *
 * Designed for Node/vitest use only. Does NOT import any DOM-dependent modules.
 * See blueprint §3, §4, §5, §7 for implementation details.
 */

import type {
  CompileResult,
  SimKeyInput,
  SimulationResult,
  SimulationStep,
  DeadkeySnapshot,
  TestVectorResult,
  PatternTestResult,
} from '@keyboard-studio/contracts';
import type { Pattern } from '@keyboard-studio/contracts';

import { loadKeyboardInterface } from './nodeKeyboardLoader.js';

// Vendored Keyman engine imports — paths resolved via tsconfig paths + Vite alias.
import { Codes } from './vendor/keyman/engine/keyboard/codes.js';
import { KeyEvent } from './vendor/keyman/engine/keyboard/keyEvent.js';
import { SyntheticTextStore } from './vendor/keyman/engine/keyboard/syntheticTextStore.js';
import { DefaultOutputRules } from './vendor/keyman/engine/keyboard/defaultOutputRules.js';
import { DeviceSpec } from './vendor/keyman/common/web-utils/deviceSpec.js';
import { JSKeyboardProcessor } from './vendor/keyman/engine/js-processor/jsKeyboardProcessor.js';
import { ModifierKeyConstants } from './vendor/keyman/common/types/main.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed DeviceSpec used for all simulated keystrokes (blueprint §4). */
const DEVICE = new DeviceSpec('chrome', 'desktop', 'windows', false);

/** No-op variable store serializer — required by JSKeyboardInterface ctor (blueprint §7). */
const NO_OP_STORE_SERIALIZER = {
  loadStore: (_kbdId: string, _storeName: string): string => '',
  saveStore: (_kbdId: string, _storeName: string, _value: string): void => {},
};

// ---------------------------------------------------------------------------
// KeyEvent builder
// ---------------------------------------------------------------------------

/**
 * Build a Keyman `KeyEvent` from a `SimKeyInput`.
 *
 * Key points (blueprint §4):
 * - `K_XXXX` → numeric via `Codes.keyCodes[vkeyStr]`; `LisVirtualKey = true`.
 * - `U_XXXX` → codepoint from hex; `LisVirtualKey = codepoint > 255`.
 * - `ISVIRTUALKEY` (0x4000) MUST be OR'd into `Lmodifiers` or virtual-key rule
 *   branches in `jsKeyboardInterface.ts:586` will not fire.
 * - CAPS is a state key, not a modifier: goes into `Lstates` as CAPITALFLAG /
 *   NOTCAPITALFLAG (with NOTNUMLOCKFLAG | NOTSCROLLFLAG always set).
 */
function buildKeyEvent(input: SimKeyInput): KeyEvent {
  const vkeyStr = input.vkey;
  let Lcode: number;
  let LisVirtualKey: boolean;

  if (vkeyStr.startsWith('U_')) {
    Lcode = parseInt(vkeyStr.slice(2), 16);
    LisVirtualKey = Lcode > 255;
  } else {
    const looked = Codes.keyCodes[vkeyStr];
    if (looked === undefined) {
      throw new Error(`simulate: unknown virtual key "${vkeyStr}"`);
    }
    Lcode = looked;
    LisVirtualKey = true;
  }

  // Build Lmodifiers from the declared modifier keys only.
  // Note: ISVIRTUALKEY (0x4000) is intentionally NOT included here.
  // The virtual-key rule branch in jsKeyboardInterface.ts:586 is gated on
  // `e.LisVirtualKey` (the boolean field), not on the ISVIRTUALKEY bit in Lmodifiers.
  // Including ISVIRTUALKEY in Lmodifiers would cause the modifier comparison
  // `(Lruleshift & modifierBitmask) == eventModifiers` to fail for plain-key rules,
  // because modifierBitmask uses Codes.modifierBitmasks["ALL"] = 0x007F which
  // masks out 0x4000, while eventModifiers retains it.
  let Lmodifiers = 0;
  for (const mod of input.modifiers) {
    switch (mod) {
      case 'shift': Lmodifiers |= ModifierKeyConstants.K_SHIFTFLAG; break;
      case 'ctrl':  Lmodifiers |= ModifierKeyConstants.K_CTRLFLAG;  break;
      case 'alt':   Lmodifiers |= ModifierKeyConstants.K_ALTFLAG;   break;
      case 'lctrl': Lmodifiers |= ModifierKeyConstants.LCTRLFLAG;   break;
      case 'rctrl': Lmodifiers |= ModifierKeyConstants.RCTRLFLAG;   break;
      case 'lalt':  Lmodifiers |= ModifierKeyConstants.LALTFLAG;    break;
      case 'ralt':  Lmodifiers |= ModifierKeyConstants.RALTFLAG;    break;
    }
  }

  const caps = input.caps ?? false;
  const Lstates =
    (caps ? ModifierKeyConstants.CAPITALFLAG : ModifierKeyConstants.NOTCAPITALFLAG) |
    ModifierKeyConstants.NOTNUMLOCKFLAG |
    ModifierKeyConstants.NOTSCROLLFLAG;

  return new KeyEvent({
    Lcode,
    Lmodifiers,
    Lstates,
    LisVirtualKey,
    vkCode: Lcode,
    kName: vkeyStr,
    device: DEVICE,
    isSynthetic: true,
    LmodifierChange: false,
  });
}

// ---------------------------------------------------------------------------
// simulate()
// ---------------------------------------------------------------------------

/**
 * Extract the raw UTF-8 text of the `.js` artifact from a `CompileResult`.
 *
 * Throws if no `.js` artifact exists or its `data` bytes are absent.
 */
function extractJsSource(compiled: CompileResult): string {
  const jsArtifact = compiled.artifacts.find((a) => a.filename.endsWith('.js'));
  if (!jsArtifact) {
    throw new Error('simulate: CompileResult contains no .js artifact');
  }
  if (!jsArtifact.data) {
    throw new Error(
      `simulate: .js artifact "${jsArtifact.filename}" has no raw data bytes. ` +
        'Ensure the compiler populates CompileArtifact.data (it does in Node test runs).',
    );
  }
  return new TextDecoder('utf-8').decode(jsArtifact.data);
}

/**
 * Simulate a sequence of key events against a compiled Keyman keyboard.
 *
 * @param compiled  A `CompileResult` whose `.js` artifact has `data` bytes set.
 * @param keys      The key sequence to simulate.
 * @returns         `SimulationResult` with final text output and per-step trace.
 *
 * @throws {Error} If `compiled` contains no `.js` artifact or the artifact has
 *   no `data` bytes (keyboard not compiled with raw bytes populated).
 * @throws {Error} If the keyboard script does not call `KeymanWeb.KR()` on load
 *   (invalid `.js` file, or the keyboard registration callback was never invoked).
 *   This typically means the `.js` file is malformed or not a Keyman keyboard.
 *
 * @remarks
 * - `processKeystroke` mutates the `textStore` in-place before returning.
 *   Do NOT re-apply the transform from `ruleBehavior.transcription` (blueprint §5).
 * - Deadkey ordinal seeds are a global static counter and MUST NOT be asserted
 *   across calls or test runs (blueprint §7).
 * - The function is synchronous; the Keyman JS processor is fully synchronous.
 */
export function simulate(compiled: CompileResult, keys: SimKeyInput[]): SimulationResult {
  const scriptSrc = extractJsSource(compiled);

  // Load the keyboard via the Node vm sandbox. The returned JSKeyboardInterface
  // already has activeKeyboard set (blueprint §3, nodeKeyboardLoader pattern).
  const kbdInterface = loadKeyboardInterface(scriptSrc, NO_OP_STORE_SERIALIZER);
  const keyboard = kbdInterface.activeKeyboard;

  // Build the processor with the loaded interface (mirrors nodeProctor.ts:58-62).
  const processor = new JSKeyboardProcessor(DEVICE, {
    baseLayout: 'us',           // blueprint §7: must be 'us' for non-mnemonic keyboards
    keyboardInterface: kbdInterface,
    defaultOutputRules: new DefaultOutputRules(),
  });

  // Prepare the text store.
  const textStore = new SyntheticTextStore();

  // Initial context reset (no CAPS state set yet — each keystroke sets its own).
  processor.resetContext(textStore);

  const trace: SimulationStep[] = [];

  // Track the caps state from the previous iteration so we can call
  // resetContext only when it changes (avoids flushing context on every key).
  let prevCaps: boolean | undefined = undefined;

  for (const input of keys) {
    // Per-keystroke CAPS: honor each key's own caps flag so that a mid-sequence
    // caps toggle is processed correctly (not just the first key's state).
    const caps = input.caps ?? false;
    if (caps !== prevCaps) {
      processor.stateKeys['K_CAPS'] = caps;
      processor.resetContext(textStore);
      prevCaps = caps;
    }

    const keyEvent = buildKeyEvent(input);

    // For mnemonic keyboards, set the mnemonic code before processing.
    // Pattern.tests K_XXXX keys are positional — skip unless isMnemonic (blueprint §7).
    if (keyboard.isMnemonic) {
      const shifted = input.modifiers.includes('shift');
      const caps = input.caps ?? false;
      keyEvent.setMnemonicCode(shifted, caps);
    }

    // processKeystroke mutates textStore and returns a ProcessorAction.
    // Do NOT re-apply the transform; processKeystroke already applied it (blueprint §5).
    const ruleBehavior = processor.processKeystroke(keyEvent, textStore);

    // Finalize the action: applies setStore mutations, variable store saves, beep, etc.
    if (ruleBehavior?.transcription) {
      processor.finalizeProcessorAction(ruleBehavior, textStore);
    }

    // Capture text store state after this keystroke (blueprint §5).
    const outputAfter = textStore.getText();

    // Capture pending (unmatched) deadkeys (blueprint §5).
    const pendingDeadkeys: DeadkeySnapshot[] = textStore
      .deadkeys()
      .dks.filter((dk) => dk.matched === 0)
      .map((dk) => ({ id: dk.d, position: dk.p }));

    const beep = ruleBehavior?.beep ?? false;

    trace.push({
      input,
      outputAfter,
      pendingDeadkeys,
      beep,
    });
  }

  const finalOutput = trace.length > 0 ? (trace[trace.length - 1]?.outputAfter ?? '') : '';

  return { finalOutput, trace };
}

// ---------------------------------------------------------------------------
// Pattern.tests runner
// ---------------------------------------------------------------------------

/**
 * Run all `TestVector`s in `pattern.tests` through `simulate()` against the
 * given `CompileResult`, and return a `PatternTestResult` summarising pass/fail.
 *
 * Each `TestVector.input` element is interpreted as a no-modifier, no-caps
 * key event (plain key press). Vectors that need modifiers or caps should be
 * tested via `simulate()` directly with explicit `SimKeyInput` arrays.
 *
 * @param pattern   A `Pattern` whose `tests` array to run.
 * @param compiled  The compiled keyboard to test against.
 */
export function runPatternTests(pattern: Pattern, compiled: CompileResult): PatternTestResult {
  const vectors: TestVectorResult[] = pattern.tests.map((vec) => {
    const keys: SimKeyInput[] = vec.input.map((vkey) => ({
      vkey,
      modifiers: [],
      caps: false,
    }));

    const result = simulate(compiled, keys);

    const pass = result.finalOutput === vec.expectedOutput;
    return {
      ...(vec.description !== undefined ? { description: vec.description } : {}),
      input: vec.input,
      expectedOutput: vec.expectedOutput,
      actualOutput: result.finalOutput,
      pass,
      trace: result.trace,
    };
  });

  return {
    allPass: vectors.every((v) => v.pass),
    vectors,
  };
}

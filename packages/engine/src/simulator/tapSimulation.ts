/**
 * Tap-simulation harness (spec 104, T002).
 *
 * Where `simulate()` (index.ts) drives synthesised desktop key events,
 * this harness drives REAL touch-layout keys: it takes a keyboard
 * compiled by the repo's `compile()` (whose .js embeds the touch layout
 * as KVKL when the fixture .kmn declares &LAYOUTFILE), loads it through
 * the same `loadKeyboardInterface` seam, builds the keyboard's
 * ActiveLayout, and taps each layout key by feeding the key's own
 * `baseKeyEvent` — the exact KeyEvent a KeymanWeb touch tap constructs
 * (layer name → modifier/state via Codes.getModifierState /
 * getStateFromLayer) — into a JSKeyboardProcessor.
 *
 * This is the method research.md §1's verdicts were established with
 * (compile with kmc, drive ActiveLayout → JSKeyboardProcessor), so the
 * tests in tapSimulation.test.ts pin those verdicts against regression.
 */

import type { CompileResult } from '@keyboard-studio/contracts';

import { loadKeyboardInterface } from './keyboardLoader.js';
import { JSKeyboardProcessor } from './vendor/keyman/engine/js-processor/jsKeyboardProcessor.js';
import { DefaultOutputRules } from './vendor/keyman/engine/keyboard/defaultOutputRules.js';
import { SyntheticTextStore } from './vendor/keyman/engine/keyboard/syntheticTextStore.js';
import { DeviceSpec } from './vendor/keyman/common/web-utils/deviceSpec.js';
import type { JSKeyboard } from './vendor/keyman/engine/keyboard/keyboards/jsKeyboard.js';
import type {
  ActiveKey,
  ActiveLayout,
  ActiveSubKey,
} from './vendor/keyman/engine/keyboard/keyboards/activeLayout.js';
import type { KeyEvent } from './vendor/keyman/engine/keyboard/keyEvent.js';

/** Touch device used for all simulated taps. */
export const TOUCH_DEVICE = new DeviceSpec('chrome', 'tablet', 'android', true);

const NO_OP_STORE_SERIALIZER = {
  loadStore: (_kbdId: string, _storeName: string): string => '',
  saveStore: (_kbdId: string, _storeName: string, _value: string): void => {},
};

const UTF8_DECODER = new TextDecoder('utf-8');

/** One layout key (or subkey) as enumerated from the ActiveLayout. */
export interface TouchKeyRef {
  layerId: string;
  keyId: string;
  /** Keycap text from the layout ('' when the key declares none). */
  text: string;
  /** Layer this key switches to on tap, or null for a producing/frame key. */
  nextLayer: string | null;
  /** Set when this ref is a longpress subkey: the hosting key's id. */
  hostKeyId?: string;
}

/** The result of one tap. */
export interface TapOutcome {
  /** Full buffer contents after the tap (seed text included). */
  buffer: string;
  /**
   * Text the tap inserted: `buffer` with the seed prefix stripped when
   * the buffer still starts with the seed. For context-consuming rules
   * (guard `> context` forms) this is '' and `buffer` is the witness.
   */
  inserted: string;
  beep: boolean;
  /** Deadkeys left pending after the tap (unmatched), by internal id. */
  pendingDeadkeys: number[];
}

/** Per-(key × layer-state) output table entry — one tap on an empty buffer. */
export interface TapTableEntry extends TouchKeyRef {
  output: string;
  beep: boolean;
}

/**
 * A loaded touch keyboard ready to be tapped. One session per compiled
 * keyboard; every tap runs against a fresh text store, so taps are
 * independent except for the explicit seed text a caller passes.
 */
export class TouchTapSession {
  private readonly processor: JSKeyboardProcessor;
  private readonly keyboard: JSKeyboard;
  private readonly layout: ActiveLayout;

  private constructor(compiled: CompileResult, formFactor: 'tablet' | 'phone') {
    const jsArtifact = compiled.artifacts.find((a) => a.filename.endsWith('.js'));
    if (!jsArtifact?.data) {
      throw new Error('tapSimulation: CompileResult has no .js artifact with data bytes');
    }
    const scriptSrc = UTF8_DECODER.decode(jsArtifact.data);

    const kbdInterface = loadKeyboardInterface(scriptSrc, NO_OP_STORE_SERIALIZER);
    const keyboard = kbdInterface.activeKeyboard as JSKeyboard;
    this.keyboard = keyboard;

    this.processor = new JSKeyboardProcessor(TOUCH_DEVICE, {
      baseLayout: 'us',
      keyboardInterface: kbdInterface,
      defaultOutputRules: new DefaultOutputRules(),
    });

    const layout = keyboard.layout(
      formFactor === 'tablet' ? DeviceSpec.FormFactor.Tablet : DeviceSpec.FormFactor.Phone,
    );
    if (!layout) {
      throw new Error(
        `tapSimulation: compiled keyboard exposes no ${formFactor} touch layout ` +
          '(was the .keyman-touch-layout part of the compile?)',
      );
    }
    this.layout = layout;
  }

  /** Load a compiled keyboard (with embedded touch layout) for tapping. */
  static fromCompiled(
    compiled: CompileResult,
    formFactor: 'tablet' | 'phone' = 'tablet',
  ): TouchTapSession {
    return new TouchTapSession(compiled, formFactor);
  }

  /** Layer ids in layout order. */
  layerIds(): string[] {
    return this.layout.layer.map((l) => l.id);
  }

  /** Every key on a layer, with each key's longpress subkeys after it. */
  keysOn(layerId: string): TouchKeyRef[] {
    const layer = this.layout.getLayer(layerId);
    if (!layer) {
      throw new Error(`tapSimulation: no layer "${layerId}" in the touch layout`);
    }
    const refs: TouchKeyRef[] = [];
    for (const row of layer.row) {
      for (const key of row.key) {
        refs.push(refFor(key, layerId));
        for (const sk of key.sk ?? []) {
          refs.push(refFor(sk, layerId, key.id));
        }
      }
    }
    return refs;
  }

  /** Tap one key (by id) on one layer against a buffer seeded with `seedText`. */
  tap(layerId: string, keyId: string, seedText = ''): TapOutcome {
    const key = this.findKey(layerId, keyId);
    return this.tapEvent(key.baseKeyEvent, layerId, seedText);
  }

  /** Tap one longpress subkey (by host key id + subkey id) on one layer. */
  tapSubkey(layerId: string, hostKeyId: string, subkeyId: string, seedText = ''): TapOutcome {
    const host = this.findKey(layerId, hostKeyId);
    const sk = (host.sk ?? []).find((s) => s.id === subkeyId);
    if (!sk) {
      throw new Error(
        `tapSimulation: key "${hostKeyId}" on layer "${layerId}" has no subkey "${subkeyId}"`,
      );
    }
    return this.tapEvent(sk.baseKeyEvent, layerId, seedText);
  }

  /**
   * Tap two main keys in sequence on ONE text store (spec 104 T014): the
   * first tap's state — above all a pending deadkey — carries into the
   * second, which a fresh-store tap can never observe. Returns the second
   * tap's outcome; its `buffer` holds seed + first output + second output.
   * Both keys are on `layerId` (deadkey composition is exercised within a
   * layer; the layer's state applies to both taps).
   */
  tapPair(layerId: string, firstKeyId: string, secondKeyId: string, seedText = ''): TapOutcome {
    const first = this.findKey(layerId, firstKeyId);
    const second = this.findKey(layerId, secondKeyId);
    const textStore = new SyntheticTextStore(seedText, seedText.length);
    // resetContext unconditionally clears deadkeys (see simulate()'s caps
    // discipline), so the context is reset ONCE for the pair — both keys
    // are on one layer, hence one caps state — and the second tap runs
    // against the state the first tap left behind.
    this.tapEventOnStore(first.baseKeyEvent, layerId, textStore, seedText, true);
    return this.tapEventOnStore(second.baseKeyEvent, layerId, textStore, seedText, false);
  }

  /**
   * The per-(key × state) output table: every key and subkey in every
   * layer, tapped once on an empty buffer. State is the layer — the
   * layer name IS the modifier state on touch (research.md §1).
   */
  table(): TapTableEntry[] {
    const entries: TapTableEntry[] = [];
    for (const layerId of this.layerIds()) {
      for (const ref of this.keysOn(layerId)) {
        const outcome = ref.hostKeyId
          ? this.tapSubkey(layerId, ref.hostKeyId, ref.keyId)
          : this.tap(layerId, ref.keyId);
        entries.push({ ...ref, output: outcome.buffer, beep: outcome.beep });
      }
    }
    return entries;
  }

  private findKey(layerId: string, keyId: string): ActiveKey {
    const layer = this.layout.getLayer(layerId);
    const key = layer?.keyMap?.[keyId];
    if (!key) {
      throw new Error(`tapSimulation: no key "${keyId}" on layer "${layerId}"`);
    }
    return key;
  }

  private tapEvent(event: KeyEvent, layerId: string, seedText: string): TapOutcome {
    const textStore = new SyntheticTextStore(seedText, seedText.length);
    return this.tapEventOnStore(event, layerId, textStore, seedText, true);
  }

  private tapEventOnStore(
    event: KeyEvent,
    layerId: string,
    textStore: SyntheticTextStore,
    seedText: string,
    resetContext: boolean,
  ): TapOutcome {
    // Mirror simulate(): keep the processor's CAPS state key in sync with
    // the layer being tapped (caps is an Lstate derived from the layer).
    const caps = layerId.indexOf('caps') >= 0;
    this.processor.stateKeys['K_CAPS'] = caps;

    if (resetContext) {
      this.processor.resetContext(textStore);
    }

    // The step the real KeymanWeb OSK host performs on a touch tap before
    // handing the event to the processor (the OSK layer itself is not
    // vendored): with the touch device attached, setSyntheticEventDefaults
    // resolves custom-key codes from the keyboard's KVKD dictionary
    // (T_0300 → 256+n) and clears LisVirtualKey for U_ keys so nomatch /
    // rule matching sees them as the runtime does. Without it, every
    // T_/ruled-U_ key event carries Lcode=undefined and no rule can fire.
    event.device = TOUCH_DEVICE;
    this.keyboard.setSyntheticEventDefaults(event, {
      K_CAPS: caps,
      K_NUMLOCK: false,
      K_SCROLL: false,
    });

    const action = this.processor.processKeystroke(event, textStore);
    if (action?.transcription) {
      this.processor.finalizeProcessorAction(action, textStore);
    }

    const buffer = textStore.getText();
    return {
      buffer,
      inserted: buffer.startsWith(seedText) ? buffer.slice(seedText.length) : buffer,
      beep: action?.beep ?? false,
      pendingDeadkeys: textStore
        .deadkeys()
        .dks.filter((dk) => dk.matched === 0)
        .map((dk) => dk.d),
    };
  }
}

function refFor(key: ActiveKey | ActiveSubKey, layerId: string, hostKeyId?: string): TouchKeyRef {
  return {
    layerId,
    keyId: key.id,
    text: key.text ?? '',
    nextLayer: key.nextlayer ?? null,
    ...(hostKeyId !== undefined ? { hostKeyId } : {}),
  };
}

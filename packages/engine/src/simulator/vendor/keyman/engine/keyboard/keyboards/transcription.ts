// @ts-nocheck
/*
 * Keyman is copyright (C) SIL Global. MIT License.
 */
import { KeyEvent } from '../keyEvent.js';
import { Alternate, TextTransform } from './textTransform.js';
// VENDORED ANNOTATION: changed to `import type` to break the ESM circular evaluation
// chain textStore → transcription → syntheticTextStore → textStore.  In the upstream
// Keyman build (CJS / esbuild bundle) this cycle is harmless; in Node ESM vitest the
// `extends TextStore` in syntheticTextStore.ts fires before TextStore is defined.
// SyntheticTextStore is only used as a TypeScript type here; making this import type-only
// removes the runtime dependency edge and breaks the cycle without changing behaviour.
import type { SyntheticTextStore } from '../syntheticTextStore.js';

export class Transcription {
  readonly token: number;
  readonly keystroke: KeyEvent;
  readonly transform: TextTransform;
  alternates: Alternate[]; // constructed after the rest of the transcription.
  readonly preInput: SyntheticTextStore;

  private static tokenSeed: number = 0;

  constructor(keystroke: KeyEvent, transform: TextTransform, preInput: SyntheticTextStore, alternates?: Alternate[]) {
    const token = this.token = Transcription.tokenSeed++;

    this.keystroke = keystroke;
    this.transform = transform;
    this.alternates = alternates;
    this.preInput = preInput;

    this.transform.id = this.token;

    // Assign the ID to each alternate, as well.
    if (alternates) {
      alternates.forEach(function (alt) {
        alt.sample.id = token;
      });
    }
  }
}


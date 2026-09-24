// @ts-nocheck
/*
 * Keyman is copyright (C) SIL Global. MIT License.
 */

import { type LexicalModelTypes } from '../../common/types/main.js';
import { KeyEvent } from './keyEvent.js';
import { Transcription } from './keyboards/transcription.js';
import { type Alternate } from './keyboards/textTransform.js';

/**
 * Interface with the methods LanguageProcessor needs from TextStore
 * for transcription building and applying transforms.
 */
export interface TextStoreLanguageProcessorInterface {
  buildTranscriptionFrom(original: TextStoreLanguageProcessorInterface, keyEvent: KeyEvent, readonly: boolean, alternates?: Alternate[]): Transcription;
  apply(transform: LexicalModelTypes.Transform): void;
}

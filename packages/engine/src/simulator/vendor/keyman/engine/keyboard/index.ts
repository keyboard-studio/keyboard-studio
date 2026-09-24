// @ts-nocheck
export { ActiveKeyBase, ActiveKey, ActiveSubKey, ActiveRow, ActiveLayer, ActiveLayout } from "./keyboards/activeLayout.js";
export { type ButtonClass, ButtonClasses, type LayoutLayer, type LayoutFormFactor, type LayoutRow, type LayoutKey, type LayoutSubKey, Layouts } from "./keyboards/defaultLayouts.js";
export { JSKeyboard, LayoutState } from "./keyboards/jsKeyboard.js";
export { type Keyboard } from './keyboards/keyboard.js';
export { type KeyboardMinimalInterface } from './keyboards/keyboardMinimalInterface.js';
export { KeyboardHarness, type KeyboardKeymanGlobal, type MinimalCodesInterface, MinimalKeymanGlobal } from "./keyboards/keyboardHarness.js";
export { NotifyEventCode, KeyboardLoaderBase } from "./keyboards/keyboardLoaderBase.js";
export { type KeyboardLoadErrorBuilder, KeyboardMissingError, KeyboardScriptError, KeyboardDownloadError, InvalidKeyboardError } from './keyboards/keyboardLoadError.js'
export { type BeepHandler, type EventMap, type KeyboardProcessor } from "./keyboards/keyboardProcessor.js";
export {
  type CloudKeyboardFont,
  internalizeFont,
  type InternalKeyboardFont,
  type KeyboardAPIPropertyMultilangSpec,
  type KeyboardAPIPropertySpec,
  type KeyboardInternalPropertySpec,
  KeyboardProperties,
  type KeyboardFont,
  type MetadataObj as RawKeyboardMetadata,
  type LanguageAPIPropertySpec
} from "./keyboards/keyboardProperties.js";
export { ProcessorAction as ProcessorAction } from "./keyboards/processorAction.js";
export { SpacebarText } from "./keyboards/spacebarText.js";
export { type StateKeyMap } from "./keyboards/stateKeyMap.js";
export { type Alternate, TextTransform } from "./keyboards/textTransform.js";
export { Transcription } from "./keyboards/transcription.js";

export { Codes } from "./codes.js";
export { EmulationKeystrokes, LogMessages, DefaultOutputRules } from "./defaultOutputRules.js";
export { type KeyDistribution, type KeyEventSpec, KeyEvent } from "./keyEvent.js";
export { KeyMapping } from "./keyMapping.js";
export { type SystemStoreMutationHandler, MutableSystemStore, SystemStore, SystemStoreIDs, type SystemStoreDictionary } from "./systemStore.js";
export { type VariableStores, type VariableStoreSerializer } from "./variableStore.js";

// DOMKeyboardLoader removed — DOM-only, not available in Node simulator context.
export { SyntheticTextStore } from "./syntheticTextStore.js";
export { TextStore } from "./textStore.js";
export { type TextStoreLanguageProcessorInterface } from "./textStoreLanguageProcessorInterface.js";
export { findCommonSubstringEndIndex } from "./stringDivergence.js";
export { Deadkey } from "./deadkeys.js";

import { DeadkeyTracker } from './deadkeys.js';

/**
 * these are exported only for unit tests, do not use
 */
export const unitTestEndpoints = {
  DeadkeyTracker,
};

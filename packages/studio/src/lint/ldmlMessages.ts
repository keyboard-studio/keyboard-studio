// Studio copy for every LDML finding code (spec 108 FR-019): one static table so Lingui
// extracts each descriptor and unit tests resolve the English source text without an i18n
// instance. Generated once from the contract's code table; edit by hand afterwards.
// The ids are `lint.ldml.<codeSlug>.{title,message,hint}`.

import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { LdmlCode } from "@keyboard-studio/engine";

export interface LdmlCodeCopy {
  title: MessageDescriptor;
  message: MessageDescriptor;
  hint: MessageDescriptor;
}

export const LDML_CODE_COPY: Readonly<Record<LdmlCode, LdmlCodeCopy>> = {
  KM_LINT_LDML_NO_KEY_TRIGGER: {
    title: msg({ id: "lint.ldml.noKeyTrigger.title", message: "Layer behaviour that no key triggers" }),
    message: msg({ id: "lint.ldml.noKeyTrigger.message", message: "LDML has no way to run this rule when a layer or context changes, so it is left out of the export." }),
    hint: msg({ id: "lint.ldml.noKeyTrigger.hint", message: "Keep the behaviour on a key press, or accept that it will only exist in the Keyman keyboard." }),
  },
  KM_LINT_LDML_GROUP_CHAIN_PARTIAL: {
    title: msg({ id: "lint.ldml.groupChainPartial.title", message: "Chained groups only partly exported" }),
    message: msg({ id: "lint.ldml.groupChainPartial.message", message: "LDML runs the later groups after every key that produces output, which can differ from the order Keyman uses here." }),
    hint: msg({ id: "lint.ldml.groupChainPartial.hint", message: "Test the exported keyboard with the sequences that pass through these groups." }),
  },
  KM_LINT_LDML_MATCH_NOMATCH_OUTPUT: {
    title: msg({ id: "lint.ldml.matchNomatchOutput.title", message: "Match or nomatch rule with output" }),
    message: msg({ id: "lint.ldml.matchNomatchOutput.message", message: "LDML has no match or nomatch rule that produces output, so this rule is not exported." }),
    hint: msg({ id: "lint.ldml.matchNomatchOutput.hint", message: "Move the output into an ordinary rule that a key triggers." }),
  },
  KM_LINT_LDML_CALL: {
    title: msg({ id: "lint.ldml.call.title", message: "call() is not exported" }),
    message: msg({ id: "lint.ldml.call.message", message: "LDML has no equivalent of call(), so the rule that calls another keyboard routine is left out." }),
    hint: msg({ id: "lint.ldml.call.hint", message: "Replace the call with the rules it would run, if the behaviour matters in LDML." }),
  },
  KM_LINT_LDML_PLATFORM_CONDITION: {
    title: msg({ id: "lint.ldml.platformCondition.title", message: "platform() condition fixed per form" }),
    message: msg({ id: "lint.ldml.platformCondition.message", message: "LDML settles a platform() condition once for each keyboard form instead of testing it while typing." }),
    hint: msg({ id: "lint.ldml.platformCondition.hint", message: "Check that the hardware and touch forms each behave as you expect." }),
  },
  KM_LINT_LDML_FORM_KEY_MISSING: {
    title: msg({ id: "lint.ldml.formKeyMissing.title", message: "Key missing from the keyboard form" }),
    message: msg({ id: "lint.ldml.formKeyMissing.message", message: "This rule uses the key {vkey}, which the {form} keyboard form does not have, so it is not exported." }),
    hint: msg({ id: "lint.ldml.formKeyMissing.hint", message: "Use a key that exists on the keyboard form, or pick a base keyboard that has it." }),
  },
  KM_LINT_LDML_FRAME_KEY: {
    title: msg({ id: "lint.ldml.frameKey.title", message: "Key outside the typing area" }),
    message: msg({ id: "lint.ldml.frameKey.message", message: "LDML does not support rules on frame keys or touch-only keys in a hardware layout, so this rule is not exported." }),
    hint: msg({ id: "lint.ldml.frameKey.hint", message: "Put the behaviour on a key in the main typing area." }),
  },
  KM_LINT_LDML_MNEMONIC: {
    title: msg({ id: "lint.ldml.mnemonic.title", message: "Mnemonic layout resolved through the base keyboard" }),
    message: msg({ id: "lint.ldml.mnemonic.message", message: "LDML has no mnemonic layouts, so each character key is looked up on the base keyboard you chose for the export." }),
    hint: msg({ id: "lint.ldml.mnemonic.hint", message: "Check the base keyboard choice on the Output page." }),
  },
  KM_LINT_LDML_SHIFT_SIDE: {
    title: msg({ id: "lint.ldml.shiftSide.title", message: "Left and right Shift treated alike" }),
    message: msg({ id: "lint.ldml.shiftSide.message", message: "LDML has one Shift modifier, so the rule on {vkey} that needs the right Shift key also fires with the left one." }),
    hint: msg({ id: "lint.ldml.shiftSide.hint", message: "Do not rely on which Shift key is held." }),
  },
  KM_LINT_LDML_BASE_DEADKEY: {
    title: msg({ id: "lint.ldml.baseDeadkey.title", message: "Dead key on the base keyboard" }),
    message: msg({ id: "lint.ldml.baseDeadkey.message", message: "The base keyboard {base} has a dead key at {vkey} on the {layer} layer, a position this keyboard leaves unhandled, so LDML will start a dead-key sequence there." }),
    hint: msg({ id: "lint.ldml.baseDeadkey.hint", message: "Handle that key in the keyboard, or choose a base keyboard without a dead key there." }),
  },
  KM_LINT_LDML_CAPS_MODE: {
    title: msg({ id: "lint.ldml.capsMode.title", message: "Caps Lock mode setting not exported" }),
    message: msg({ id: "lint.ldml.capsMode.message", message: "LDML does not carry the setting that makes Caps Lock act as Shift-off, so the setting is left out." }),
    hint: msg({ id: "lint.ldml.capsMode.hint", message: "Check how the exported keyboard behaves with Caps Lock on." }),
  },
  KM_LINT_LDML_EXPANSION_LIMIT: {
    title: msg({ id: "lint.ldml.expansionLimit.title", message: "Rule expands past the size limit" }),
    message: msg({ id: "lint.ldml.expansionLimit.message", message: "This rule would expand into {count} LDML rules, more than the exporter allows, so it is not exported." }),
    hint: msg({ id: "lint.ldml.expansionLimit.hint", message: "Split the rule into smaller ones." }),
  },
  KM_LINT_LDML_NOTANY_MULTI: {
    title: msg({ id: "lint.ldml.notanyMulti.title", message: "notany() over multi-character items" }),
    message: msg({ id: "lint.ldml.notanyMulti.message", message: "LDML cannot negate the set {store} because its items are longer than one character, so this rule is not exported." }),
    hint: msg({ id: "lint.ldml.notanyMulti.hint", message: "Use single-character items in the store." }),
  },
  KM_LINT_LDML_CAPTURE_LIMIT: {
    title: msg({ id: "lint.ldml.captureLimit.title", message: "More than nine captured groups" }),
    message: msg({ id: "lint.ldml.captureLimit.message", message: "This rule has {count} captured groups, and LDML allows at most nine, so it is not exported." }),
    hint: msg({ id: "lint.ldml.captureLimit.hint", message: "Reduce the number of any() captures in the rule." }),
  },
  KM_LINT_LDML_BEEP: {
    title: msg({ id: "lint.ldml.beep.title", message: "beep is not exported" }),
    message: msg({ id: "lint.ldml.beep.message", message: "LDML cannot sound a beep, so the rule produces no output instead." }),
    hint: msg({ id: "lint.ldml.beep.hint", message: "Nothing to change unless the beep matters to your users." }),
  },
  KM_LINT_LDML_CONTEXT_START: {
    title: msg({ id: "lint.ldml.contextStart.title", message: "nul in context" }),
    message: msg({ id: "lint.ldml.contextStart.message", message: "LDML marks the start of the context with a leading caret, which is how nul in a context is exported." }),
    hint: msg({ id: "lint.ldml.contextStart.hint", message: "Test the rule at the start of text." }),
  },
  KM_LINT_LDML_MODIFIER: {
    title: msg({ id: "lint.ldml.modifier.title", message: "Unsupported modifier flag" }),
    message: msg({ id: "lint.ldml.modifier.message", message: "This rule needs the modifier {modifiers}, which LDML does not have, so it is not exported." }),
    hint: msg({ id: "lint.ldml.modifier.hint", message: "Use Shift, Ctrl, Alt or Caps Lock instead." }),
  },
  KM_LINT_LDML_MODIFIER_SIDES: {
    title: msg({ id: "lint.ldml.modifierSides.title", message: "Left and right modifiers mixed" }),
    message: msg({ id: "lint.ldml.modifierSides.message", message: "LDML cannot mix left and right modifiers on {vkey}, so the rule is exported without the side or left out." }),
    hint: msg({ id: "lint.ldml.modifierSides.hint", message: "Use modifiers from one side only." }),
  },
  KM_LINT_LDML_BKSP_NO_CONTEXT: {
    title: msg({ id: "lint.ldml.bkspNoContext.title", message: "Backspace rule without context" }),
    message: msg({ id: "lint.ldml.bkspNoContext.message", message: "LDML does not export a backspace rule with an empty context on {vkey}, so this rule is left out." }),
    hint: msg({ id: "lint.ldml.bkspNoContext.hint", message: "Give the backspace rule a context to match." }),
  },
  KM_LINT_LDML_KEY_STORE: {
    title: msg({ id: "lint.ldml.keyStore.title", message: "any() over keys" }),
    message: msg({ id: "lint.ldml.keyStore.message", message: "LDML exports one key for each item of the store {store}, and a rule that cannot be split that way is left out." }),
    hint: msg({ id: "lint.ldml.keyStore.hint", message: "Check that every key in the store is exported." }),
  },
  KM_LINT_LDML_NEGATED_CLASS: {
    title: msg({ id: "lint.ldml.negatedClass.title", message: "Negated character class" }),
    message: msg({ id: "lint.ldml.negatedClass.message", message: "LDML can negate a class only when the exporter can expand it, and the store {store} cannot be expanded that way, so the rule is not exported." }),
    hint: msg({ id: "lint.ldml.negatedClass.hint", message: "List the characters explicitly instead of negating a store." }),
  },
  KM_LINT_LDML_OPTION_STATE: {
    title: msg({ id: "lint.ldml.optionState.title", message: "Option state is fixed at export" }),
    message: msg({ id: "lint.ldml.optionState.message", message: "LDML has no option stores, so each if() test is evaluated against the option default value and the rule is exported or dropped for good." }),
    hint: msg({ id: "lint.ldml.optionState.hint", message: "Use separate keys or layers instead of option state." }),
  },
  KM_LINT_LDML_BASELAYOUT_CONDITION: {
    title: msg({ id: "lint.ldml.baselayoutCondition.title", message: "baselayout() condition fixed at export" }),
    message: msg({ id: "lint.ldml.baselayoutCondition.message", message: "LDML settles the baselayout() condition {layout} against the base keyboard chosen for the export, {base}." }),
    hint: msg({ id: "lint.ldml.baselayoutCondition.hint", message: "Check the base keyboard choice on the Output page." }),
  },
  KM_LINT_LDML_LAYER_STATE: {
    title: msg({ id: "lint.ldml.layerState.title", message: "Layer state in a rule" }),
    message: msg({ id: "lint.ldml.layerState.message", message: "LDML cannot test or set the current layer inside a rule, so the rule is not exported." }),
    hint: msg({ id: "lint.ldml.layerState.hint", message: "Use a layer switch key instead." }),
  },
  KM_LINT_LDML_NORMALIZATION: {
    title: msg({ id: "lint.ldml.normalization.title", message: "Rules that differ only by normalization" }),
    message: msg({ id: "lint.ldml.normalization.message", message: "LDML keeps normalization on, so rules or output that differ only by NFC and NFD behave as one." }),
    hint: msg({ id: "lint.ldml.normalization.hint", message: "Keep one form of each character in the rules." }),
  },
  KM_LINT_LDML_OPAQUE: {
    title: msg({ id: "lint.ldml.opaque.title", message: "Construct the exporter cannot read" }),
    message: msg({ id: "lint.ldml.opaque.message", message: "The exporter does not recognise this construct, so it is not exported." }),
    hint: msg({ id: "lint.ldml.opaque.hint", message: "Rewrite it with ordinary rules, stores and groups." }),
  },
  KM_LINT_LDML_ANSI_ONLY: {
    title: msg({ id: "lint.ldml.ansiOnly.title", message: "ANSI-only keyboard" }),
    message: msg({ id: "lint.ldml.ansiOnly.message", message: "LDML has no ANSI mode, so this keyboard cannot be exported." }),
    hint: msg({ id: "lint.ldml.ansiOnly.hint", message: "Convert the keyboard to Unicode first." }),
  },
  KM_LINT_LDML_NO_LOCALE: {
    title: msg({ id: "lint.ldml.noLocale.title", message: "No language tag" }),
    message: msg({ id: "lint.ldml.noLocale.message", message: "The keyboard has no language tag, so the export is written for the undetermined language and lists no locale." }),
    hint: msg({ id: "lint.ldml.noLocale.hint", message: "Add the language on the identity step." }),
  },
  KM_LINT_LDML_UNREACHABLE: {
    title: msg({ id: "lint.ldml.unreachable.title", message: "Unreachable or unused rule" }),
    message: msg({ id: "lint.ldml.unreachable.message", message: "Nothing can run this rule from the entry group, so it is listed but not exported." }),
    hint: msg({ id: "lint.ldml.unreachable.hint", message: "Remove the rule, or call its group from the entry group." }),
  },
  KM_LINT_LDML_HEADER_UNSUPPORTED: {
    title: msg({ id: "lint.ldml.headerUnsupported.title", message: "Header setting not exported" }),
    message: msg({ id: "lint.ldml.headerUnsupported.message", message: "LDML has no place for this header setting, so it is left out of the keyboard file." }),
    hint: msg({ id: "lint.ldml.headerUnsupported.hint", message: "Nothing to change unless the setting affects typing." }),
  },
  KM_LINT_LDML_METADATA_PACKAGE_ONLY: {
    title: msg({ id: "lint.ldml.metadataPackageOnly.title", message: "Metadata kept in the package only" }),
    message: msg({ id: "lint.ldml.metadataPackageOnly.message", message: "This metadata travels in the package files and a header comment, not in the keyboard file." }),
    hint: msg({ id: "lint.ldml.metadataPackageOnly.hint", message: "Nothing to change." }),
  },
  KM_LINT_LDML_KEYMAN_GAP: {
    title: msg({ id: "lint.ldml.keymanGap.title", message: "Not yet supported by Keyman" }),
    message: msg({ id: "lint.ldml.keymanGap.message", message: "This part of the LDML profile is exported, but Keyman does not compile it yet." }),
    hint: msg({ id: "lint.ldml.keymanGap.hint", message: "Nothing to change; choose a profile that Keyman compiles if you need to build it today." }),
  },
  KM_LINT_LDML_TOUCH_PRESENTATION: {
    title: msg({ id: "lint.ldml.touchPresentation.title", message: "Touch presentation not exported" }),
    message: msg({ id: "lint.ldml.touchPresentation.message", message: "LDML does not carry this touch presentation detail, so the touch layout is exported without it." }),
    hint: msg({ id: "lint.ldml.touchPresentation.hint", message: "Nothing to change; the touch layout keeps it in the Keyman keyboard." }),
  },
  KM_LINT_LDML_TOUCH_SPECIAL_KEY: {
    title: msg({ id: "lint.ldml.touchSpecialKey.title", message: "Special touch key" }),
    message: msg({ id: "lint.ldml.touchSpecialKey.message", message: "LDML has no equivalent of this special touch key, so it is exported as a plain key or left out." }),
    hint: msg({ id: "lint.ldml.touchSpecialKey.hint", message: "Check the touch layout of the exported keyboard." }),
  },
};

export const LDML_CODE_SLUG: Readonly<Record<LdmlCode, string>> = {
  KM_LINT_LDML_NO_KEY_TRIGGER: "noKeyTrigger",
  KM_LINT_LDML_GROUP_CHAIN_PARTIAL: "groupChainPartial",
  KM_LINT_LDML_MATCH_NOMATCH_OUTPUT: "matchNomatchOutput",
  KM_LINT_LDML_CALL: "call",
  KM_LINT_LDML_PLATFORM_CONDITION: "platformCondition",
  KM_LINT_LDML_FORM_KEY_MISSING: "formKeyMissing",
  KM_LINT_LDML_FRAME_KEY: "frameKey",
  KM_LINT_LDML_MNEMONIC: "mnemonic",
  KM_LINT_LDML_SHIFT_SIDE: "shiftSide",
  KM_LINT_LDML_BASE_DEADKEY: "baseDeadkey",
  KM_LINT_LDML_CAPS_MODE: "capsMode",
  KM_LINT_LDML_EXPANSION_LIMIT: "expansionLimit",
  KM_LINT_LDML_NOTANY_MULTI: "notanyMulti",
  KM_LINT_LDML_CAPTURE_LIMIT: "captureLimit",
  KM_LINT_LDML_BEEP: "beep",
  KM_LINT_LDML_CONTEXT_START: "contextStart",
  KM_LINT_LDML_MODIFIER: "modifier",
  KM_LINT_LDML_MODIFIER_SIDES: "modifierSides",
  KM_LINT_LDML_BKSP_NO_CONTEXT: "bkspNoContext",
  KM_LINT_LDML_KEY_STORE: "keyStore",
  KM_LINT_LDML_NEGATED_CLASS: "negatedClass",
  KM_LINT_LDML_OPTION_STATE: "optionState",
  KM_LINT_LDML_BASELAYOUT_CONDITION: "baselayoutCondition",
  KM_LINT_LDML_LAYER_STATE: "layerState",
  KM_LINT_LDML_NORMALIZATION: "normalization",
  KM_LINT_LDML_OPAQUE: "opaque",
  KM_LINT_LDML_ANSI_ONLY: "ansiOnly",
  KM_LINT_LDML_NO_LOCALE: "noLocale",
  KM_LINT_LDML_UNREACHABLE: "unreachable",
  KM_LINT_LDML_HEADER_UNSUPPORTED: "headerUnsupported",
  KM_LINT_LDML_METADATA_PACKAGE_ONLY: "metadataPackageOnly",
  KM_LINT_LDML_KEYMAN_GAP: "keymanGap",
  KM_LINT_LDML_TOUCH_PRESENTATION: "touchPresentation",
  KM_LINT_LDML_TOUCH_SPECIAL_KEY: "touchSpecialKey",
};

/** Placeholder names a code message interpolates; every site that emits the code supplies them. */
export const LDML_CODE_PARAMS: Partial<Record<LdmlCode, readonly string[]>> = {
  KM_LINT_LDML_FORM_KEY_MISSING: ["vkey", "form"],
  KM_LINT_LDML_MODIFIER: ["modifiers"],
  KM_LINT_LDML_KEY_STORE: ["store"],
  KM_LINT_LDML_NOTANY_MULTI: ["store"],
  KM_LINT_LDML_NEGATED_CLASS: ["store"],
  KM_LINT_LDML_EXPANSION_LIMIT: ["count"],
  KM_LINT_LDML_CAPTURE_LIMIT: ["count"],
  KM_LINT_LDML_BASELAYOUT_CONDITION: ["layout", "base"],
  KM_LINT_LDML_BASE_DEADKEY: ["base", "vkey", "layer"],
  KM_LINT_LDML_MODIFIER_SIDES: ["vkey"],
  KM_LINT_LDML_BKSP_NO_CONTEXT: ["vkey"],
  KM_LINT_LDML_SHIFT_SIDE: ["vkey"],
};

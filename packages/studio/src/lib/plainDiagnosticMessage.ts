// plainDiagnosticMessage — translate a compiler diagnostic (or a raw
// on-screen-keyboard engine error) into plain language for a non-technical
// author: what happened, and what they can try next.
//
// Mirrors the publishManagedPRErrorMessage pattern: a pure function over a
// `msg()` descriptor table, resolved through resolveMessage so components
// pass their `i18n` (from useLingui()) and unit tests can call it bare and
// assert on the English source text.
//
// The map is keyed on the diagnostic `code` and covers only what the guided
// flow can actually produce:
//   - the studio's own synthetic Layer A codes (compiler/packager
//     unavailable, thrown, missing package member, ...),
//   - the curated validator aliases for the deep compiler checks,
//   - kmcmplib passthrough codes (`KM_<SEV>_KMCMP_<decimal>`), matched on
//     the severity-masked base code — the same masking the engine's oracle
//     code map uses, so an upstream severity re-tag cannot orphan an entry.
// Anything unmapped falls back to severity-appropriate generic copy; the
// raw code and message are always preserved verbatim in `technicalDetail`
// so a surface can keep them behind a disclosure for bug reports.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { CompilerDiagnostic } from "@keyboard-studio/contracts";
import { resolveMessage } from "./i18nResolve.ts";

export interface PlainDiagnostic {
  /** Plain-language statement of what happened. */
  whatHappened: string;
  /** Plain-language suggestion for what the author can try. */
  whatToTry: string;
  /** Raw code + message (+ location), preserved for a technical-details disclosure. */
  technicalDetail: string;
  /** True when the code matched a specific map entry; false for the generic fallback. */
  mapped: boolean;
}

type DiagnosticInput = Pick<
  CompilerDiagnostic,
  "code" | "message" | "severity" | "layer" | "location" | "hint"
>;

interface PlainCopy {
  what: ReturnType<typeof msg>;
  try: ReturnType<typeof msg>;
}

const COPY = {
  missingReference: {
    what: msg({
      id: "diagnostics.plain.missingReference.what",
      message: "Your keyboard refers to something that isn't there anymore.",
    }),
    try: msg({
      id: "diagnostics.plain.missingReference.try",
      message: "Undo the change that removed it, or update the rule that uses it.",
    }),
  },
  emptyList: {
    what: msg({
      id: "diagnostics.plain.emptyList.what",
      message: "A list used by one of your rules is empty.",
    }),
    try: msg({
      id: "diagnostics.plain.emptyList.try",
      message: "Add at least one item back to the list, or remove the rule that uses it.",
    }),
  },
  duplicateName: {
    what: msg({
      id: "diagnostics.plain.duplicateName.what",
      message: "Two parts of your keyboard have the same name.",
    }),
    try: msg({
      id: "diagnostics.plain.duplicateName.try",
      message: "Rename one of them so that each name is used only once.",
    }),
  },
  unreachable: {
    what: msg({
      id: "diagnostics.plain.unreachable.what",
      message: "One of your rules can never run.",
    }),
    try: msg({
      id: "diagnostics.plain.unreachable.try",
      message: "Check the rules above it — an earlier rule may already handle the same keys.",
    }),
  },
  capsConsistency: {
    what: msg({
      id: "diagnostics.plain.capsConsistency.what",
      message: "A key behaves differently when Caps Lock is on.",
    }),
    try: msg({
      id: "diagnostics.plain.capsConsistency.try",
      message: "Check what this key does with Caps Lock on and off, and make them match if they should.",
    }),
  },
  invalidSetting: {
    what: msg({
      id: "diagnostics.plain.invalidSetting.what",
      message: "One of your keyboard's settings couldn't be understood.",
    }),
    try: msg({
      id: "diagnostics.plain.invalidSetting.try",
      message: "Undo your last change to the keyboard's settings.",
    }),
  },
  contextOffset: {
    what: msg({
      id: "diagnostics.plain.contextOffset.what",
      message: "A rule refers to more earlier characters than there are.",
    }),
    try: msg({
      id: "diagnostics.plain.contextOffset.try",
      message: "Undo the last change to that rule, or make the rule look back at fewer characters.",
    }),
  },
  invalidKeyName: {
    what: msg({
      id: "diagnostics.plain.invalidKeyName.what",
      message: "A rule uses a key name that isn't recognised.",
    }),
    try: msg({
      id: "diagnostics.plain.invalidKeyName.try",
      message: "Undo the last change to that rule.",
    }),
  },
  missingFile: {
    what: msg({
      id: "diagnostics.plain.missingFile.what",
      message: "A file your keyboard needs is missing.",
    }),
    try: msg({
      id: "diagnostics.plain.missingFile.try",
      message: "Undo the change that removed the file, or remove the reference to it.",
    }),
  },
  touchLayoutMissing: {
    what: msg({
      id: "diagnostics.plain.touchLayoutMissing.what",
      message: "The touch layout file for your keyboard is missing.",
    }),
    try: msg({
      id: "diagnostics.plain.touchLayoutMissing.try",
      message: "Undo the change that removed it, or rebuild the touch layout.",
    }),
  },
  unsupportedKeyCombination: {
    what: msg({
      id: "diagnostics.plain.unsupportedKeyCombination.what",
      message: "A key combination in your keyboard isn't supported in the preview.",
    }),
    try: msg({
      id: "diagnostics.plain.unsupportedKeyCombination.try",
      message: "Undo the last change to that key.",
    }),
  },
  modifierMix: {
    what: msg({
      id: "diagnostics.plain.modifierMix.what",
      message: "A key mixes left and right modifier keys with plain ones.",
    }),
    try: msg({
      id: "diagnostics.plain.modifierMix.try",
      message: "Use either the left/right forms or the plain forms for that key, not both.",
    }),
  },
  deprecatedForm: {
    what: msg({
      id: "diagnostics.plain.deprecatedForm.what",
      message: "Part of your keyboard uses an older form.",
    }),
    try: msg({
      id: "diagnostics.plain.deprecatedForm.try",
      message: "You can keep working — this still builds. Updating the older form is recommended when you have time.",
    }),
  },
  builderUnavailable: {
    what: msg({
      id: "diagnostics.plain.builderUnavailable.what",
      message: "The keyboard builder couldn't start.",
    }),
    try: msg({
      id: "diagnostics.plain.builderUnavailable.try",
      message: "Reload the page and try again.",
    }),
  },
  builderStopped: {
    what: msg({
      id: "diagnostics.plain.builderStopped.what",
      message: "The keyboard builder stopped unexpectedly.",
    }),
    try: msg({
      id: "diagnostics.plain.builderStopped.try",
      message: "Reload the page and try again. If it keeps happening, undo your last change.",
    }),
  },
  packageIncomplete: {
    what: msg({
      id: "diagnostics.plain.packageIncomplete.what",
      message: "Your keyboard's package couldn't be put together.",
    }),
    try: msg({
      id: "diagnostics.plain.packageIncomplete.try",
      message: "Build the keyboard again. If it keeps happening, reload the page.",
    }),
  },
  networkBlocked: {
    what: msg({
      id: "diagnostics.plain.networkBlocked.what",
      message: "The builder couldn't reach a file it needs.",
    }),
    try: msg({
      id: "diagnostics.plain.networkBlocked.try",
      message: "Check your connection and try again.",
    }),
  },
} satisfies Record<string, PlainCopy>;

/**
 * kmcmplib base codes (severity bits masked off, namespace | base) for the
 * messages the guided flow can reach. Values verified against the engine's
 * compiler and validator code maps, which cite the upstream message tables.
 */
const KMCMP_BASE_COPY: ReadonlyMap<number, PlainCopy> = new Map([
  [0x2017, COPY.emptyList], // store consumed by a rule holds zero characters
  [0x201d, COPY.missingReference], // ERROR_StoreDoesNotExist
  [0x2031, COPY.missingFile], // ERROR_CannotReadBitmapFile
  [0x2038, COPY.missingFile], // ERROR_CannotLoadIncludeFile
  [0x203f, COPY.invalidKeyName], // ERROR_InvalidNamedCode
  [0x2049, COPY.invalidSetting], // ERROR_InvalidIf (platform() parsing)
  [0x2057, COPY.unsupportedKeyCombination], // virtual character keys in KeymanWeb
  [0x2058, COPY.unsupportedKeyCombination], // virtual keys on a mnemonic layout
  [0x205f, COPY.contextOffset], // ERROR_ContextExHasInvalidOffset
  [0x2094, COPY.missingFile], // WARN_HelpFileMissing
  [0x2095, COPY.missingFile], // WARN_EmbedJsFileMissing
  [0x209a, COPY.unreachable], // HINT_UnreachableKeyCode
  [0x20a3, COPY.modifierMix], // chiral and non-chiral modifiers mixed
  [0x20ae, COPY.unreachable], // HINT_UnreachableRule
  [0x290c, COPY.missingFile], // ERROR_FileNotFound
  [0x7004, COPY.touchLayoutMissing], // ERROR_TouchLayoutFileDoesNotExist
]);

/** Exact studio codes with curated plain copy. */
const EXACT_COPY: ReadonlyMap<string, PlainCopy> = new Map<string, PlainCopy>([
  ["KM_WARN_ORACLE_UNAVAILABLE", COPY.builderUnavailable],
  ["KM_WARN_KMP_COMPILER_UNAVAILABLE", COPY.builderUnavailable],
  ["KM_FATAL_KMCMP_THROWN", COPY.builderStopped],
  ["KM_FATAL_KMP_THROWN", COPY.builderStopped],
  ["KM_FATAL_KMP_INIT_THREW", COPY.builderStopped],
  ["KM_ERROR_KMP_INIT_FAILED", COPY.builderStopped],
  ["KM_ERROR_KMP_NO_DESCRIPTOR", COPY.packageIncomplete],
  ["KM_ERROR_KMP_NO_ARTIFACT", COPY.packageIncomplete],
  ["KM_ERROR_KMP_FILE_MISSING", COPY.missingFile],
  ["KM_ERROR_KMP_NETWORK_BLOCKED", COPY.networkBlocked],
  ["KM_ERROR_DUPLICATE_STORE", COPY.duplicateName],
  ["KM_WARN_NCAPS_CONSISTENCY", COPY.capsConsistency],
  ["KM_HINT_UNREACHABLE_RULE", COPY.unreachable],
  ["KM_ERROR_INVALID_PLATFORM_STRING", COPY.invalidSetting],
  ["KM_ERROR_INVALID_CONTEXT_OFFSET", COPY.contextOffset],
  ["KM_ERROR_INVALID_NAMED_CODE_CONSTANT", COPY.invalidKeyName],
  ["KM_WARN_DEPRECATED_STORE_ID", COPY.deprecatedForm],
]);

function copyForCode(code: string): PlainCopy | undefined {
  const exact = EXACT_COPY.get(code);
  if (exact !== undefined) return exact;

  const kmcmpAt = code.indexOf("_KMCMP_");
  if (kmcmpAt !== -1) {
    const suffix = code.slice(kmcmpAt + "_KMCMP_".length);
    // Decimal form (what the kmc-kmn bridge emits): mask the severity bits
    // exactly as the engine's oracle code map does before lookup.
    if (/^\d+$/.test(suffix)) {
      const byBase = KMCMP_BASE_COPY.get(Number(suffix) & 0xfffff);
      if (byBase !== undefined) return byBase;
    }
    // Symbolic form (what the validator passthrough emits).
    if (suffix.includes("UNREACHABLE")) return COPY.unreachable;
    if (suffix.includes("STOREDOESNOTEXIST")) return COPY.missingReference;
    if (suffix.includes("TOUCHLAYOUT")) return COPY.touchLayoutMissing;
    if (suffix.includes("FILENOTFOUND") || suffix.includes("CANNOTREAD") || suffix.includes("CANNOTLOAD")) {
      return COPY.missingFile;
    }
    if (suffix.includes("VIRTUAL")) return COPY.unsupportedKeyCombination;
    if (suffix.includes("INVALIDIF")) return COPY.invalidSetting;
    if (suffix.includes("CONTEXT")) return COPY.contextOffset;
    if (suffix.includes("NAMEDCODE")) return COPY.invalidKeyName;
  }

  if (code.includes("DEPRECATED")) return COPY.deprecatedForm;
  return undefined;
}

function buildResult(
  copy: PlainCopy | undefined,
  diagnostic: DiagnosticInput,
  i18n: I18n | undefined,
): PlainDiagnostic {
  const location =
    diagnostic.location !== undefined
      ? `${diagnostic.location.file}:${diagnostic.location.line} — `
      : "";
  const technicalDetail = `${location}${diagnostic.code}: ${diagnostic.message}`;

  if (copy !== undefined) {
    return {
      whatHappened: resolveMessage(i18n, copy.what),
      whatToTry: resolveMessage(i18n, copy.try),
      technicalDetail,
      mapped: true,
    };
  }

  // Unmapped fallback, shaped by severity: an error means the build failed;
  // a warning or hint is advisory and must not claim otherwise. An existing
  // remediation hint on the diagnostic is the best "try" copy available.
  const hintTry =
    diagnostic.hint !== undefined && diagnostic.hint !== "" ? diagnostic.hint : undefined;
  if (diagnostic.severity === "error" || diagnostic.severity === "fatal") {
    return {
      whatHappened: resolveMessage(
        i18n,
        msg({
          id: "diagnostics.plain.genericError.what",
          message: "Something in the keyboard couldn't be built.",
        }),
      ),
      whatToTry:
        hintTry ??
        resolveMessage(
          i18n,
          msg({
            id: "diagnostics.plain.genericError.try",
            message: "Try undoing your last change.",
          }),
        ),
      technicalDetail,
      mapped: false,
    };
  }
  if (diagnostic.severity === "warning") {
    return {
      whatHappened: resolveMessage(
        i18n,
        msg({
          id: "diagnostics.plain.genericWarning.what",
          message: "There's a warning about your keyboard.",
        }),
      ),
      whatToTry:
        hintTry ??
        resolveMessage(
          i18n,
          msg({
            id: "diagnostics.plain.genericWarning.try",
            message:
              "You can keep working. If this part of your keyboard doesn't do what you expect, try undoing your last change.",
          }),
        ),
      technicalDetail,
      mapped: false,
    };
  }
  return {
    whatHappened: resolveMessage(
      i18n,
      msg({
        id: "diagnostics.plain.genericNote.what",
        message: "There's a note about your keyboard.",
      }),
    ),
    whatToTry:
      hintTry ??
      resolveMessage(
        i18n,
        msg({
          id: "diagnostics.plain.genericNote.try",
          message: "You can keep working — this doesn't stop your keyboard from building.",
        }),
      ),
    technicalDetail,
    mapped: false,
  };
}

/**
 * Translate one compiler diagnostic into plain language. The raw code and
 * message are never lost: they are returned verbatim in `technicalDetail`.
 */
export function plainDiagnosticMessage(
  diagnostic: DiagnosticInput,
  i18n?: I18n,
): PlainDiagnostic {
  return buildResult(copyForCode(diagnostic.code), diagnostic, i18n);
}

/**
 * Translate a raw on-screen-keyboard engine error (a free-form string from
 * the preview frame) into plain language, with the raw string preserved in
 * `technicalDetail`.
 */
export function plainEngineErrorMessage(engineError: string, i18n?: I18n): PlainDiagnostic {
  if (/cannot find|not found|no such keyboard|failed to load|load.*fail/i.test(engineError)) {
    return {
      whatHappened: resolveMessage(
        i18n,
        msg({
          id: "diagnostics.plain.engineLoad.what",
          message: "The preview couldn't load your keyboard.",
        }),
      ),
      whatToTry: resolveMessage(
        i18n,
        msg({
          id: "diagnostics.plain.engineLoad.try",
          message: "Wait a moment, then try again. If it keeps happening, undo your last change.",
        }),
      ),
      technicalDetail: engineError,
      mapped: true,
    };
  }
  return {
    whatHappened: resolveMessage(
      i18n,
      msg({
        id: "diagnostics.plain.engineGeneric.what",
        message: "The on-screen keyboard hit a problem.",
      }),
    ),
    whatToTry: resolveMessage(
      i18n,
      msg({
        id: "diagnostics.plain.engineGeneric.try",
        message: "Reload the page and try again.",
      }),
    ),
    technicalDetail: engineError,
    mapped: false,
  };
}

// Profile 46: every row of contracts/ldml-mapping.md sections 1-6 (spec 108, FR-060).
// Row ids, statuses and codes must stay in step with that file; profiles.test.ts checks both ways.

import type { LdmlCode, LdmlSeverity } from "../types.js";
import type { ProfileMeta, ProfileRow, ProfileRowStatus } from "./types.js";

interface RowExtras {
  code?: LdmlCode;
  severity?: LdmlSeverity;
  lift?: string;
  keymanCodes?: string[];
}

function row(id: string, status: ProfileRowStatus, form: string, extras: RowExtras = {}): ProfileRow {
  const out: ProfileRow = { id, status, severity: extras.severity ?? null, form };
  if (extras.code !== undefined) out.code = extras.code;
  if (extras.lift !== undefined) out.lift = extras.lift;
  if (extras.keymanCodes !== undefined) out.keymanCodes = extras.keymanCodes;
  return out;
}

const W = "warning" as const;
const H = "hint" as const;

export const PROFILE_46_META: ProfileMeta = {
  id: "46",
  namespace: "https://schemas.unicode.org/cldr/46/keyboard3",
  tr35Revision: "CLDR 49, tr35-79 (2026-10-21)",
  keymanRelease: "19.0.240-alpha",
  keymanCompilable: true,
  isDefault: true,
  writeAttribution: false,
};

export const PROFILE_46_ROWS: readonly ProfileRow[] = [
  // 1. Keyboard structure
  row("1.1", "M", "key map plus simple transforms"),
  row("1.2", "N", "export refused (ANSI-only)", { code: "KM_LINT_LDML_ANSI_ONLY", severity: H }),
  row("1.3", "N", "not exported; touch layer behaviour only", { code: "KM_LINT_LDML_NO_KEY_TRIGGER", severity: W }),
  row("1.4", "N", "not exported; touch layer behaviour only", { code: "KM_LINT_LDML_NO_KEY_TRIGGER", severity: W }),
  row("1.4a", "M", "key/@layerId on each touch key"),
  row("1.4b", "N", "not exported; text-dependent layer rule", { code: "KM_LINT_LDML_NO_KEY_TRIGGER", severity: W }),
  row("1.5", "M", "later transformGroup"),
  row("1.6", "A", "later transformGroup run after every outputting key", { code: "KM_LINT_LDML_GROUP_CHAIN_PARTIAL", severity: W }),
  row("1.7", "A", "merged into the key map in call order", { code: "KM_LINT_LDML_GROUP_CHAIN_PARTIAL", severity: W }),
  row("1.8", "M/A", "call-graph edge, as rows 1.5 and 1.6", { code: "KM_LINT_LDML_GROUP_CHAIN_PARTIAL", severity: W }),
  row("1.9", "N", "not exported", { code: "KM_LINT_LDML_MATCH_NOMATCH_OUTPUT", severity: W }),
  row("1.10", "N", "not exported", { code: "KM_LINT_LDML_NO_KEY_TRIGGER", severity: W }),
  row("1.11", "N", "listed, not exported", { code: "KM_LINT_LDML_UNREACHABLE", severity: H }),
  row("1.12", "N", "not exported", { code: "KM_LINT_LDML_CALL", severity: W }),
  row("1.13", "A", "resolved per form", { code: "KM_LINT_LDML_PLATFORM_CONDITION", severity: W }),

  // 2. Keys, positions, layers (hardware)
  row("2.1", "M", "key placed in layers by scan code"),
  row("2.2", "M", "form iso"),
  row("2.3", "M", "form abnt2 or jis"),
  row("2.4", "N", "not exported", { code: "KM_LINT_LDML_FORM_KEY_MISSING", severity: W }),
  row("2.5", "N", "not exported", { code: "KM_LINT_LDML_FRAME_KEY", severity: W }),
  row("2.6", "M", "key that types the character on the US layout"),
  row("2.7", "A", "resolved through the one base keyboard", { code: "KM_LINT_LDML_MNEMONIC", severity: W }),
  row("2.8", "M", "explicit key with the base keyboard character"),
  row("2.9", "M", "modifier shift"),
  row("2.10", "M", "modifier alt, altL or altR"),
  row("2.11", "M", "modifier ctrl, ctrlL or ctrlR"),
  row("2.12", "A", "modifier shift (either shift)", { code: "KM_LINT_LDML_SHIFT_SIDE", severity: W }),
  row("2.13", "M", "layer with or without caps"),
  row("2.14", "M", "emitted into both the X and X caps layers"),
  row("2.15", "N", "not exported", { code: "KM_LINT_LDML_CAPS_MODE", severity: H }),
  row("2.16", "M", "layer modifiers none"),
  row("2.17", "M", "no layer"),
  row("2.18", "M", "transforms type backspace"),
  row("2.19", "N", "not exported", { code: "KM_LINT_LDML_FRAME_KEY", severity: W }),
  row("2.20", "M", "implied key space"),
  row("2.21", "N", "not exported", { code: "KM_LINT_LDML_FRAME_KEY", severity: W }),
  row("2.22", "N", "not exported", { code: "KM_LINT_LDML_MODIFIER", severity: W }),
  row("2.23", "A/N", "side-neutral modifier form, else not exported", { code: "KM_LINT_LDML_MODIFIER_SIDES", severity: W }),
  row("2.24", "N", "not exported", { code: "KM_LINT_LDML_BKSP_NO_CONTEXT", severity: W }),
  row("2.25", "M/N", "one key per store item with indexed output", { code: "KM_LINT_LDML_KEY_STORE", severity: W }),
  row("2.26", "N", "position omitted from the layer", {
    code: "KM_LINT_LDML_BASE_DEADKEY",
    severity: H,
    lift: "the reference base tables carry each dead key's spacing character and compositions; then A, an LDML marker plus transforms emulating the OS dead key",
  }),

  // 3. Rules to keys and transforms
  row("3.1", "M", "literal, escaped per side"),
  row("3.2", "M", "\\u{...} escape"),
  row("3.3", "M", "marker \\m{id}"),
  row("3.4", "M", "\\m{id} in from", { code: "KM_LINT_LDML_UNREACHABLE", severity: H }),
  row("3.5", "M", "key output = characters plus marker in order"),
  row("3.6", "M", "$[store] set variable"),
  row("3.7", "M", "($[from]) with to=\"$[1:to]\"", {
    lift: "Keyman accepts $[N:var] and the TR35 grammar admits N > 1; then M without expansion (smaller output)",
  }),
  row("3.8", "M", "cartesian expansion into literal transforms", {
    lift: "Keyman supports several maps per transform; then M without expansion and row 3.9 shrinks",
  }),
  row("3.9", "N", "not exported", {
    code: "KM_LINT_LDML_EXPANSION_LIMIT",
    severity: W,
    lift: "Keyman supports several maps per transform; the expansion cap then binds less often",
  }),
  row("3.10", "M/N", "negated class [^...]", { code: "KM_LINT_LDML_NEGATED_CLASS", severity: W }),
  row("3.11", "N", "not exported", { code: "KM_LINT_LDML_NOTANY_MULTI", severity: W }),
  row("3.12", "M", "capture group and $n"),
  row("3.13", "M/N", "expansion, else not exported", { code: "KM_LINT_LDML_CAPTURE_LIMIT", severity: W }),
  row("3.14", "M", "inlined literal"),
  row("3.15a", "M", "key gap=\"true\" for that position"),
  row("3.15b", "M", "transform with empty to"),
  row("3.16", "M", "as rows 3.15a and 3.15b", { code: "KM_LINT_LDML_BEEP", severity: H }),
  row("3.17", "A", "evaluated against the option store default", { code: "KM_LINT_LDML_OPTION_STATE", severity: W }),
  row("3.18", "N", "not exported", {
    code: "KM_LINT_LDML_OPTION_STATE",
    severity: W,
    lift: "spec 103 types these conditions; then A, as row 3.17",
  }),
  row("3.19", "M/A", "evaluated statically per form", { code: "KM_LINT_LDML_PLATFORM_CONDITION", severity: W }),
  row("3.20", "A", "evaluated against the export's base keyboard", { code: "KM_LINT_LDML_BASELAYOUT_CONDITION", severity: W }),
  row("3.21", "N", "not exported", { code: "KM_LINT_LDML_LAYER_STATE", severity: W }),
  row("3.22", "A", "normalization stays on; conflated pair reported", { code: "KM_LINT_LDML_NORMALIZATION", severity: W }),
  row("3.23", "A", "exported as written; reported per keyboard", { code: "KM_LINT_LDML_NORMALIZATION", severity: W }),
  row("3.24", "A", "leading ^ in from", { code: "KM_LINT_LDML_CONTEXT_START", severity: H }),
  row("3.25", "M", "ordinary transforms; no reorder element"),
  row("3.26", "M/N", "expanded when a key literal, else not exported", { code: "KM_LINT_LDML_OPAQUE", severity: W }),

  // 4. Header (system) stores and metadata
  row("4.1", "M", "info/@name"),
  row("4.2", "M", "info/@author"),
  row("4.3", "M", "version/@number as major.minor.patch"),
  row("4.4", "M", "keyboard3/@locale and locales"),
  row("4.5", "M", "info/@layout"),
  row("4.6", "M", "decides which forms are exported"),
  row("4.7", "M", "touch layers"),
  row("4.8", "M", "displays"),
  row("4.9", "N", "header comment plus package files", { code: "KM_LINT_LDML_METADATA_PACKAGE_ONLY", severity: H }),
  row("4.10", "K", "info/@attribution not emitted", {
    code: "KM_LINT_LDML_KEYMAN_GAP",
    severity: H,
    keymanCodes: [],
    lift: "a profile whose conformsTo is 47 or later and a Keyman schema that accepts attribution; then M",
  }),
  row("4.11", "N", "package files only", { code: "KM_LINT_LDML_METADATA_PACKAGE_ONLY", severity: H }),
  row("4.12", "N", "not exported", { code: "KM_LINT_LDML_HEADER_UNSUPPORTED", severity: H }),
  row("4.13", "M", "drives row 2.14"),
  row("4.14", "A", "drives row 2.7", { code: "KM_LINT_LDML_MNEMONIC", severity: H }),
  row("4.15", "M", "no CLDR imports written"),
  row("4.16", "A", "keyboard3/@locale=\"und\", no locales", { code: "KM_LINT_LDML_NO_LOCALE", severity: H }),
  row("4.17", "K", "provenance record not written; report only", {
    code: "KM_LINT_LDML_KEYMAN_GAP",
    severity: H,
    keymanCodes: [],
    lift: "CLDR's XSD, or an extension schema for the ks namespace accepted by the harness, admits foreign-namespace children of special; then M, written to the file",
  }),

  // 5. Touch layout
  row("5.1", "M", "layers formId=\"touch\" minDeviceWidth=\"1\""),
  row("5.2", "M", "second layers formId=\"touch\" minDeviceWidth=\"150\""),
  row("5.3", "N", "not exported; the hardware form covers desktop", { code: "KM_LINT_LDML_TOUCH_PRESENTATION", severity: H }),
  row("5.4", "M", "layer id and key/@layerId"),
  row("5.5", "M", "longPressKeyIds and longPressDefaultKeyId"),
  row("5.6", "M", "flicks"),
  row("5.7", "M", "multiTapKeyIds"),
  row("5.8", "N", "not exported", { code: "KM_LINT_LDML_TOUCH_PRESENTATION", severity: H }),
  row("5.9", "M", "width and gap key"),
  row("5.10", "M", "display keyId"),
  row("5.11", "N", "not exported", { code: "KM_LINT_LDML_TOUCH_PRESENTATION", severity: H }),
  row("5.12", "M", "layerId keys"),
  row("5.13", "A", "gap key of the same width", {
    code: "KM_LINT_LDML_TOUCH_SPECIAL_KEY",
    severity: H,
    lift: "TR35 gains a standardized key identity; then M",
  }),
  row("5.14", "M", "resolved through rules or U+ codepoint"),
  row("5.15", "K", "touch form exported spec-perfect to TR35; stated once in the report", {
    keymanCodes: [],
    lift: "Keyman ships the LDML touch pipeline; then M and the report's delivery note is removed",
  }),

  // 6. Opaque and unparsed content
  row("6.1", "N", "not exported; one item per fragment", { code: "KM_LINT_LDML_OPAQUE", severity: W }),
  row("6.2", "N", "classified by text where a row covers it, else not exported", { code: "KM_LINT_LDML_OPAQUE", severity: W }),
];

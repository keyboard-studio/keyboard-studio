/**
 * Format-capability table for the IR hub (spec 116 FR-027 to FR-029b).
 *
 * One row per typed IR construct: every element kind of the three element
 * unions, the typed fields of `IRRule`, `IRStore`, `IRGroup` and `IRHeader`,
 * and `RawKmnFragment`. Each row says whether reading a format can produce the
 * construct (import) and whether writing a format carries it (export).
 *
 * Planning data only (FR-029): only KMN has an importer and an exporter in
 * this repo, plus the LDML exporter (spec 108). Cells for the other formats are
 * researched claims with a reference, not code.
 */
import type {
  ContextElement,
  IRGroup,
  IRHeader,
  IRRule,
  IRStore,
  OutputElement,
  RawKmnFragment,
  StoreItem,
} from "../keyboard-ir";

// Prefixed names: contracts already exports an `ImportStatus` (the import report's).
export type CapabilityFormat = "kmn" | "cldr-legacy" | "ldml" | "klc" | "xkb" | "keylayout";
export type CapabilityImportStatus =
  | "produced"
  | "partly-produced"
  | "never-produced"
  | "reported-not-mapped"
  | "n/a";
export type CapabilityExportStatus = "mapped" | "approximated" | "not-carried" | "n/a";

export interface CapabilityCell<S> {
  status: S;
  note: string;
  ref?: string;
}

export interface CapabilityRow {
  /** An IR kind path, e.g. "OutputElement.layer", "IRRule.targetSelector". */
  construct: string;
  import: Partial<Record<CapabilityFormat, CapabilityCell<CapabilityImportStatus>>>;
  export: Partial<Record<CapabilityFormat, CapabilityCell<CapabilityExportStatus>>>;
}

/** A source-format construct with no IR home today (FR-029a). */
export interface UnhomedConstruct {
  format: CapabilityFormat;
  construct: string;
  disposition: "tier-a-candidate" | "tier-b-candidate" | "reported-at-import";
  note: string;
}

export const CAPABILITY_FORMATS: readonly CapabilityFormat[] = [
  "kmn",
  "cldr-legacy",
  "ldml",
  "klc",
  "xkb",
  "keylayout",
];

/** The FR-029b importer policy, quoted on the `RawKmnFragment` row. */
export const NON_KMN_FRAGMENT_POLICY =
  "Importer policy (FR-029b): a non-KMN importer never creates a RawKmnFragment, because sourceText is KMN by contract. An unmapped source construct is recorded in the ImportReport instead.";

// ---------------------------------------------------------------------------
// IR kind paths, bound to the contract at compile time. A new union member or
// node field fails `satisfies` until it is listed here; a listed path with no
// row fails format-capability.test.ts.
// ---------------------------------------------------------------------------

const STORE_ITEM_KINDS = {
  char: true, vkey: true, deadkey: true, namedDeadkey: true, any: true, outs: true, raw: true,
} as const satisfies Record<StoreItem["kind"], true>;

const CONTEXT_ELEMENT_KINDS = {
  char: true, vkey: true, deadkey: true, namedDeadkey: true, any: true, notany: true,
  context: true, index: true, baselayout: true, if: true, platform: true, raw: true,
} as const satisfies Record<ContextElement["kind"], true>;

const OUTPUT_ELEMENT_KINDS = {
  char: true, deadkey: true, namedDeadkey: true, beep: true, nul: true, context: true,
  index: true, outs: true, useGroup: true, layer: true, set: true, save: true, reset: true,
  call: true, return: true, raw: true,
} as const satisfies Record<OutputElement["kind"], true>;

/**
 * "row": the field carries keyboard behaviour or metadata a format can hold.
 * "internal": identity, source position, ownership or an analysis sketch that
 * no format reads or writes.
 */
type FieldClass = "row" | "internal";

// eslint-disable-next-line no-restricted-syntax -- a field-classification map keyed by IRRule's fields, not a rule
const IR_RULE_FIELDS = {
  nodeId: "internal", context: "row", output: "row", trailingComment: "row",
  ownedByPattern: "internal", ownedByBehaviour: "internal", matchKind: "row",
  targetSelector: "row", sourceLine: "internal", rulesStepAdded: "internal",
} as const satisfies Record<keyof IRRule, FieldClass>;

const IR_STORE_FIELDS = {
  nodeId: "internal", name: "row", items: "row", isSystem: "row", ownedByBehaviour: "internal",
  targetSelector: "row", sourceLine: "internal", trailingComment: "row", rulesStepAdded: "internal",
} as const satisfies Record<keyof IRStore, FieldClass>;

const IR_GROUP_FIELDS = {
  nodeId: "internal", name: "row", usingKeys: "row", rules: "row", readonly: "row",
  sourceLine: "internal",
} as const satisfies Record<keyof IRGroup, FieldClass>;

const IR_HEADER_FIELDS = {
  keyboardId: "row", name: "row", bcp47: "row", copyright: "row", version: "row",
  targets: "row", storeDirectives: "row", encoding: "row", entryPoints: "row",
} as const satisfies Record<keyof IRHeader, FieldClass>;

// The fragment is one row: its fields are its KMN text and analysis sketches.
const RAW_FRAGMENT_FIELDS = {
  nodeId: "internal", origin: "internal", sourceText: "internal", reason: "internal",
  storeSketch: "internal", sourceLine: "internal", groupNodeId: "internal",
  producedOutput: "internal",
} as const satisfies Record<keyof RawKmnFragment, FieldClass>;

function kindPaths(prefix: string, kinds: Record<string, true>): string[] {
  return Object.keys(kinds).map((k) => `${prefix}.${k}`);
}
function fieldPaths(prefix: string, fields: Record<string, FieldClass>): string[] {
  return Object.entries(fields)
    .filter(([, c]) => c === "row")
    .map(([f]) => `${prefix}.${f}`);
}

export const IR_KIND_PATHS: readonly string[] = [
  ...kindPaths("StoreItem", STORE_ITEM_KINDS),
  ...kindPaths("ContextElement", CONTEXT_ELEMENT_KINDS),
  ...kindPaths("OutputElement", OUTPUT_ELEMENT_KINDS),
  ...fieldPaths("IRRule", IR_RULE_FIELDS),
  ...fieldPaths("IRStore", IR_STORE_FIELDS),
  ...fieldPaths("IRGroup", IR_GROUP_FIELDS),
  ...fieldPaths("IRHeader", IR_HEADER_FIELDS),
  ...(Object.keys(RAW_FRAGMENT_FIELDS).length > 0 ? ["RawKmnFragment"] : []),
];

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

const EMIT = "packages/engine/src/codec/emit.ts";
const READER = "packages/engine/src/codec/lower.ts";
const CLDR_IMPORTER = "packages/engine/src/cldr-import/toIr.ts (legacy CLDR importer, in review)";
const CLDR_SPEC = "https://www.unicode.org/reports/tr35/tr35-69/tr35-keyboards.html";
const LDML_SPEC = "https://www.unicode.org/reports/tr35/tr35-keyboards.html";
const KLC_DOC = "MSKLC 1.4 help, KLC file format (LAYOUT, DEADKEY, LIGATURE, KEYNAME sections)";
const XKB_DOC = "https://xkbcommon.org/doc/current/keymap-text-format-v1.html";
const KEYLAYOUT_DOC = "https://developer.apple.com/library/archive/technotes/tn2056/_index.html";

const DEFAULT_IMPORT_REF: Record<CapabilityFormat, string> = {
  kmn: READER, "cldr-legacy": CLDR_SPEC, ldml: LDML_SPEC, klc: KLC_DOC, xkb: XKB_DOC,
  keylayout: KEYLAYOUT_DOC,
};
// LDML export cells cite a row of specs/108-ldml-export/contracts/ldml-mapping.md
// explicitly, so LDML has no default here.
const DEFAULT_EXPORT_REF: Partial<Record<CapabilityFormat, string>> = {
  klc: KLC_DOC, xkb: XKB_DOC, keylayout: KEYLAYOUT_DOC,
};

// ---------------------------------------------------------------------------
// Cell shorthands
// ---------------------------------------------------------------------------

type Imp = CapabilityCell<CapabilityImportStatus>;
type Exp = CapabilityCell<CapabilityExportStatus>;

function cell<S>(status: S, note: string, ref?: string): CapabilityCell<S> {
  return ref === undefined ? { status, note } : { status, note, ref };
}
const P = (note: string, ref?: string): Imp => cell("produced", note, ref);
const PP = (note: string, ref?: string): Imp => cell("partly-produced", note, ref);
const NP = (note: string, ref?: string): Imp => cell("never-produced", note, ref);
const M = (note: string, ref?: string): Exp => cell("mapped", note, ref);
const A = (note: string, ref?: string): Exp => cell("approximated", note, ref);
const NC = (note: string, ref?: string): Exp => cell("not-carried", note, ref);

type ForeignImport = Record<"cldr-legacy" | "ldml" | "klc" | "xkb" | "keylayout", Imp>;
type ForeignExport = Record<"ldml" | "klc" | "xkb" | "keylayout", Exp>;

interface RowSpec {
  /** The emitter function that writes the construct back to KMN. */
  emit: string;
  emitNote?: string;
  kmnImport?: Imp;
  import: ForeignImport;
  export: ForeignExport;
}

const CLDR_P = (note: string): Imp => P(note, CLDR_IMPORTER);

/** No key-map format has this: the three desktop formats never produce it. */
function desktopNever(note: string): Pick<ForeignImport, "klc" | "xkb" | "keylayout"> {
  return { klc: NP(note), xkb: NP(note), keylayout: NP(note) };
}
function desktopNotCarried(note: string): Pick<ForeignExport, "klc" | "xkb" | "keylayout"> {
  return { klc: NC(note), xkb: NC(note), keylayout: NC(note) };
}
const RAW_NOTE =
  "raw elements hold KMN text; a non-KMN importer reports the source construct instead (FR-029b)";
const OPTION_NOTE = "no option stores or runtime state in this format";

function build(construct: string, spec: RowSpec): CapabilityRow {
  const imp: CapabilityRow["import"] = {
    kmn: spec.kmnImport ?? P("the reader types it"),
    ...spec.import,
  };
  const exp: CapabilityRow["export"] = {
    kmn: M(spec.emitNote ?? "the emitter writes it", `${EMIT}#${spec.emit}`),
    "cldr-legacy": cell("n/a", "legacy CLDR is an input format only"),
    ...spec.export,
  };
  for (const f of CAPABILITY_FORMATS) {
    const i = imp[f];
    if (i && i.ref === undefined && i.status !== "n/a") imp[f] = { ...i, ref: DEFAULT_IMPORT_REF[f] };
    const e = exp[f];
    const def = DEFAULT_EXPORT_REF[f];
    if (e && e.ref === undefined && def !== undefined && e.status !== "n/a") exp[f] = { ...e, ref: def };
  }
  return { construct, import: imp, export: exp };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const SPECS: Record<string, RowSpec> = {
  // --- StoreItem ---------------------------------------------------------
  "StoreItem.char": {
    emit: "emitStoreItems",
    import: {
      "cldr-legacy": CLDR_P("system stores (&NAME, &VERSION, &TARGETS, &COPYRIGHT)"),
      ldml: P("<variables> <set> and <string> members"),
      klc: P("system stores from KBD, DESCRIPTION, COPYRIGHT and VERSION"),
      xkb: P("system store from the symbols block name"),
      keylayout: P("system store from the keyboard name attribute"),
    },
    export: {
      ldml: M("a <set> member", "3.6"),
      klc: M("inlined where the store is used"),
      xkb: M("inlined where the store is used"),
      keylayout: M("inlined where the store is used"),
    },
  },
  "StoreItem.vkey": {
    emit: "emitStoreItems",
    import: { "cldr-legacy": NP("keys are rule keystrokes, never store items"), ldml: NP("sets hold strings, not keys"), ...desktopNever("keys are positions, never store items") },
    export: {
      ldml: M("one <key> per store item in keystroke position", "2.25"),
      klc: M("expanded to one LAYOUT entry per key"),
      xkb: M("expanded to one key entry per key"),
      keylayout: M("expanded to one keyMap entry per key"),
    },
  },
  "StoreItem.deadkey": {
    emit: "emitStoreItems",
    import: { "cldr-legacy": NP("dead keys are named (dk(cldr_<hex>)), see namedDeadkey"), ldml: NP("markers are named, see namedDeadkey"), ...desktopNever("no store classes") },
    export: {
      ldml: M("a marker in the set", "3.3"),
      klc: A("expanded per item; only a dead key followed by one base character carries"),
      xkb: A("expanded per item; dead_* keysyms only"),
      keylayout: A("expanded per item into states"),
    },
  },
  "StoreItem.namedDeadkey": {
    emit: "emitStoreItems",
    import: { "cldr-legacy": NP("the importer puts dead keys in rules, not stores"), ldml: PP("a \\m{marker} inside a <set>"), ...desktopNever("no store classes") },
    export: {
      ldml: M("a marker in the set", "3.3"),
      klc: A("expanded per item; only a dead key followed by one base character carries"),
      xkb: A("expanded per item; dead_* keysyms only"),
      keylayout: A("expanded per item into states"),
    },
  },
  "StoreItem.any": {
    emit: "emitStoreItems",
    import: { "cldr-legacy": NP("no counterpart"), ldml: NP("no counterpart"), ...desktopNever("no counterpart") },
    export: { ldml: NC("a bare any in a store body has no LDML counterpart"), ...desktopNotCarried("no counterpart") },
  },
  "StoreItem.outs": {
    emit: "emitStoreItems",
    import: { "cldr-legacy": NP("no store composition"), ldml: PP("a $[set] reference inside another set; an importer may inline instead"), ...desktopNever("no store composition") },
    export: {
      ldml: M("inlined", "3.14"),
      klc: M("inlined"), xkb: M("inlined"), keylayout: M("inlined"),
    },
  },
  "StoreItem.raw": {
    emit: "emitStoreItems",
    kmnImport: P("store text the reader cannot type, kept verbatim"),
    import: { "cldr-legacy": NP(RAW_NOTE), ldml: NP(RAW_NOTE), ...desktopNever(RAW_NOTE) },
    export: { ldml: A("expanded when the text is a key literal, else reported", "3.26"), ...desktopNotCarried("KMN text has no counterpart") },
  },

  // --- ContextElement ----------------------------------------------------
  "ContextElement.char": {
    emit: "fmtContextElement",
    import: {
      "cldr-legacy": CLDR_P("the inner characters of a multi-character transform from"),
      ldml: P("transform from text"),
      ...desktopNever("no text context; a dead-key follower is a key"),
    },
    export: {
      ldml: M("literal in from", "3.1"),
      klc: NC("only a dead key precedes a keystroke"),
      xkb: NC("Compose sequences are keystrokes, not existing text"),
      keylayout: NC("states precede a keystroke; there is no text context"),
    },
  },
  "ContextElement.vkey": {
    emit: "fmtContextElement",
    import: {
      "cldr-legacy": CLDR_P("each <map> iso position, with modifiers from keyMap@modifiers"),
      ldml: P("each <key> placed by scan code in a hardware form"),
      klc: P("each LAYOUT row per shift state (0 to 7)"),
      xkb: P("each key per level (Shift, Level3, Level3+Shift)"),
      keylayout: P("each keyMap code per keyMapSelect modifier set"),
    },
    export: {
      ldml: M("a <key> in the form's layer rows", "2.1"),
      klc: A("Shift, Ctrl and AltGr states only; side-specific and lock modifiers collapse"),
      xkb: A("four levels per group without extra key types"),
      keylayout: M("keyMapSelect covers side-specific and caps modifiers"),
    },
  },
  "ContextElement.deadkey": {
    emit: "fmtContextElement",
    import: {
      "cldr-legacy": NP("dead keys are named, see namedDeadkey"),
      ldml: NP("markers are named, see namedDeadkey"),
      klc: P("DEADKEY sections, id = the dead character's hex code point"),
      xkb: PP("dead_* keysyms; the composition lives in the Compose table, outside symbols"),
      keylayout: NP("states are named, see namedDeadkey"),
    },
    export: {
      ldml: M("a marker in from", "3.4"),
      klc: A("a DEADKEY entry: one dead key, one base character, one result"),
      xkb: A("a dead_* keysym plus a Compose entry outside the symbols file"),
      keylayout: M("an action <when state=…>"),
    },
  },
  "ContextElement.namedDeadkey": {
    emit: "fmtContextElement",
    import: {
      "cldr-legacy": CLDR_P("the dead-key character of a simple transform, as dk(cldr_<hex>)"),
      ldml: P("a \\m{marker} in transform from"),
      klc: NP("dead keys are numbered, see deadkey"),
      xkb: NP("dead keys are keysyms, see deadkey"),
      keylayout: P("an action <when state=…>"),
    },
    export: {
      ldml: M("a marker in from", "3.4"),
      klc: A("a DEADKEY entry: one dead key, one base character, one result"),
      xkb: A("a dead_* keysym plus a Compose entry outside the symbols file"),
      keylayout: M("an action <when state=…>"),
    },
  },
  "ContextElement.any": {
    emit: "fmtContextElement",
    import: { "cldr-legacy": NP("no sets"), ldml: P("$[set] in from"), ...desktopNever("no sets") },
    export: { ldml: M("$[set] in from", "3.6"), ...desktopNotCarried("expandable only over a key store in keystroke position") },
  },
  "ContextElement.notany": {
    emit: "fmtContextElement",
    import: { "cldr-legacy": NP("no sets"), ldml: PP("[^…] over single code points"), ...desktopNever("no sets") },
    export: { ldml: A("[^…] for NFD single-code-point items only", "3.10"), ...desktopNotCarried("no negated classes") },
  },
  "ContextElement.context": {
    emit: "fmtContextElement",
    import: { "cldr-legacy": NP("no back-references"), ldml: NP("back-references occur in to, not from"), ...desktopNever("no back-references") },
    export: { ldml: NC("no mapping row; context(n) on the left side has no from counterpart"), ...desktopNotCarried("no back-references") },
  },
  "ContextElement.index": {
    emit: "fmtContextElement",
    import: { "cldr-legacy": NP("no sets"), ldml: NP("set mapping lives in to; from holds the any()"), ...desktopNever("no sets") },
    export: { ldml: M("set mapping as capture group 1, else expansion", "3.7"), ...desktopNotCarried("no sets") },
  },
  "ContextElement.baselayout": {
    emit: "fmtContextElement",
    import: { "cldr-legacy": NP("one layout per file"), ldml: NP("one layout per file"), ...desktopNever("one layout per file") },
    export: { ldml: A("evaluated against the export's one base keyboard", "3.20"), ...desktopNotCarried("evaluated away; one layout per file") },
  },
  "ContextElement.if": {
    emit: "fmtContextElement",
    import: { "cldr-legacy": NP(OPTION_NOTE), ldml: NP(OPTION_NOTE), ...desktopNever(OPTION_NOTE) },
    export: { ldml: A("evaluated against the option's default", "3.17"), ...desktopNotCarried(OPTION_NOTE) },
  },
  "ContextElement.platform": {
    emit: "fmtContextElement",
    import: { "cldr-legacy": NP("platform is the file, not a rule condition"), ldml: NP("forms are layouts, not rule conditions"), ...desktopNever("one platform per file") },
    export: { ldml: A("evaluated per form; differing views are reported", "3.19"), ...desktopNotCarried("evaluated for the desktop view") },
  },
  "ContextElement.raw": {
    emit: "fmtContextElement",
    kmnImport: P("context text the reader cannot type, kept verbatim"),
    import: {
      "cldr-legacy": PP("only the + separator before the struck key in dead-key rules; it carries no source construct", CLDR_IMPORTER),
      ldml: NP(RAW_NOTE),
      ...desktopNever(RAW_NOTE),
    },
    export: { ldml: A("classified by its text where a row covers it, else reported", "6.2"), ...desktopNotCarried("KMN text has no counterpart") },
  },

  // --- OutputElement -----------------------------------------------------
  "OutputElement.char": {
    emit: "fmtOutputElement",
    import: {
      "cldr-legacy": CLDR_P("<map to> and transform to"),
      ldml: P("key output and transform to"),
      klc: P("LAYOUT characters and LIGATURE sequences"),
      xkb: P("keysyms with a Unicode value"),
      keylayout: P("key output and action output"),
    },
    export: {
      ldml: M("literal in to", "3.1"),
      klc: M("one character in LAYOUT, more in LIGATURE"),
      xkb: M("one keysym per level; a multi-character output needs Compose"),
      keylayout: M("output attribute"),
    },
  },
  "OutputElement.deadkey": {
    emit: "fmtOutputElement",
    import: {
      "cldr-legacy": NP("dead keys are named, see namedDeadkey"),
      ldml: NP("markers are named, see namedDeadkey"),
      klc: P("a LAYOUT character marked @"),
      xkb: PP("a dead_* keysym"),
      keylayout: NP("states are named, see namedDeadkey"),
    },
    export: {
      ldml: M("marker \\m{id}", "3.3"),
      klc: M("a LAYOUT character marked @"),
      xkb: A("only the predefined dead_* keysyms"),
      keylayout: M("an action that sets a state"),
    },
  },
  "OutputElement.namedDeadkey": {
    emit: "fmtOutputElement",
    import: {
      "cldr-legacy": CLDR_P("a <map> whose to starts a simple transform"),
      ldml: P("a \\m{marker} in key output or to"),
      klc: NP("dead keys are numbered, see deadkey"),
      xkb: NP("dead keys are keysyms, see deadkey"),
      keylayout: P("an action <when state=none next=…>"),
    },
    export: {
      ldml: M("marker \\m{id}", "3.3"),
      klc: M("a LAYOUT character marked @"),
      xkb: A("only the predefined dead_* keysyms"),
      keylayout: M("an action that sets a state"),
    },
  },
  "OutputElement.beep": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP("no audible feedback"), ldml: NP("no audible feedback"), ...desktopNever("no audible feedback") },
    export: { ldml: A("as nul; only the sound is lost", "3.16"), ...desktopNotCarried("no audible feedback") },
  },
  "OutputElement.nul": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP("an unmapped key falls through, it is not suppressed"), ldml: P("<key gap> and a transform with an empty to"), ...desktopNever("an empty slot means no rule, not suppression") },
    export: {
      ldml: M("<key gap> or a transform with an empty to", "3.15a"),
      klc: A("-1 in a context-free slot; nul after context has no home"),
      xkb: A("NoSymbol in a context-free slot; nul after context has no home"),
      keylayout: A("output=\"\" in a context-free slot; nul after context has no home"),
    },
  },
  "OutputElement.context": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP("no back-references"), ldml: P("$n capture references in to"), ...desktopNever("no back-references") },
    export: { ldml: M("capture group plus $n", "3.12"), ...desktopNotCarried("no back-references") },
  },
  "OutputElement.index": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP("no sets"), ldml: P("$[1:set] set mapping in to"), ...desktopNever("no sets") },
    export: { ldml: M("$[1:set], else expansion", "3.7"), ...desktopNotCarried("expandable only over a key store in keystroke position") },
  },
  "OutputElement.outs": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP("no variables"), ldml: PP("${string} variables in to; an importer may inline instead"), ...desktopNever("no variables") },
    export: { ldml: M("inlined", "3.14"), klc: M("inlined"), xkb: M("inlined"), keylayout: M("inlined") },
  },
  "OutputElement.useGroup": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP("one group"), ldml: P("each later <transformGroup> becomes a group reached by use()"), ...desktopNever("one key map") },
    export: {
      ldml: A("a call-graph edge; partial chains are reported", "1.8"),
      klc: A("a keystroke group reached by use() merges into the one key map"),
      xkb: A("a keystroke group reached by use() merges into the one key map"),
      keylayout: A("a keystroke group reached by use() merges into the one key map"),
    },
  },
  "OutputElement.layer": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP("touch layer switches are layout data, not rules"), ldml: PP("a touch key's layerId, when the importer writes touch rules"), ...desktopNever("no touch layers") },
    export: { ldml: NC("touch layer switching maps through keys instead (row 5.4)", "3.21"), ...desktopNotCarried("no touch layers") },
  },
  "OutputElement.set": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP(OPTION_NOTE), ldml: NP(OPTION_NOTE), ...desktopNever(OPTION_NOTE) },
    export: { ldml: NC("no runtime state", "3.18"), ...desktopNotCarried(OPTION_NOTE) },
  },
  "OutputElement.save": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP(OPTION_NOTE), ldml: NP(OPTION_NOTE), ...desktopNever(OPTION_NOTE) },
    export: { ldml: NC("no runtime state", "3.18"), ...desktopNotCarried(OPTION_NOTE) },
  },
  "OutputElement.reset": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP(OPTION_NOTE), ldml: NP(OPTION_NOTE), ...desktopNever(OPTION_NOTE) },
    export: { ldml: NC("no runtime state", "3.18"), ...desktopNotCarried(OPTION_NOTE) },
  },
  "OutputElement.call": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP("no external routines"), ldml: NP("no external routines"), ...desktopNever("no external routines") },
    export: { ldml: NC("no external routines", "1.12"), ...desktopNotCarried("no external routines") },
  },
  "OutputElement.return": {
    emit: "fmtOutputElement",
    import: { "cldr-legacy": NP("no external routines"), ldml: NP("no external routines"), ...desktopNever("no external routines") },
    export: { ldml: NC("no external routines", "1.12"), ...desktopNotCarried("no external routines") },
  },
  "OutputElement.raw": {
    emit: "fmtOutputElement",
    kmnImport: P("output text the reader cannot type, kept verbatim"),
    import: { "cldr-legacy": NP(RAW_NOTE), ldml: NP(RAW_NOTE), ...desktopNever(RAW_NOTE) },
    export: { ldml: A("classified by its text where a row covers it, else reported", "6.2"), ...desktopNotCarried("KMN text has no counterpart") },
  },

  // --- IRRule fields -----------------------------------------------------
  "IRRule.context": {
    emit: "emitRule",
    import: {
      "cldr-legacy": CLDR_P("keystroke rules and dead-key rules"),
      ldml: P("key positions and transform from"),
      klc: P("one keystroke per LAYOUT slot and DEADKEY entry"),
      xkb: P("one keystroke per key level"),
      keylayout: P("one keystroke per keyMap entry, plus action states"),
    },
    export: {
      ldml: A("element by element, see the ContextElement rows", "2.1"),
      klc: A("element by element, see the ContextElement rows"),
      xkb: A("element by element, see the ContextElement rows"),
      keylayout: A("element by element, see the ContextElement rows"),
    },
  },
  "IRRule.output": {
    emit: "emitRule",
    import: {
      "cldr-legacy": CLDR_P("map and transform output"),
      ldml: P("key output and transform to"),
      klc: P("LAYOUT, LIGATURE and DEADKEY results"),
      xkb: P("keysyms per level"),
      keylayout: P("key and action output"),
    },
    export: {
      ldml: A("element by element, see the OutputElement rows", "3.1"),
      klc: A("element by element, see the OutputElement rows"),
      xkb: A("element by element, see the OutputElement rows"),
      keylayout: A("element by element, see the OutputElement rows"),
    },
  },
  "IRRule.trailingComment": {
    emit: "emitRule",
    import: { "cldr-legacy": NP("source comments are not kept per rule"), ldml: NP("XML comments are discarded by the parser"), ...desktopNever("comments are not tied to one rule") },
    export: {
      ldml: NC("Keyman's LDML parser discards XML comments; no mapping row"),
      klc: A("a // comment on the LAYOUT line"),
      xkb: A("a // comment on the key line"),
      keylayout: A("an XML comment; placement differs"),
    },
  },
  "IRRule.matchKind": {
    emit: "emitRule",
    import: { "cldr-legacy": NP("no match/nomatch hooks"), ldml: NP("no match/nomatch hooks"), ...desktopNever("no match/nomatch hooks") },
    export: { ldml: A("match > use(g) becomes a call-graph edge; literal output is reported", "1.8"), ...desktopNotCarried("no match/nomatch hooks") },
  },
  "IRRule.targetSelector": {
    emit: "emitRule",
    import: { "cldr-legacy": NP("one target per file"), ldml: NP("one target per file"), ...desktopNever("one target per file") },
    export: { ldml: A("resolved per form", "1.13"), ...desktopNotCarried("resolved for the desktop target") },
  },

  // --- IRStore fields ----------------------------------------------------
  "IRStore.name": {
    emit: "emitStore",
    import: {
      "cldr-legacy": CLDR_P("system store names only"),
      ldml: P("<variables> ids"),
      klc: PP("system store names only"),
      xkb: PP("system store names only"),
      keylayout: PP("system store names only"),
    },
    export: { ldml: M("a <set> or <string> id", "3.6"), ...desktopNotCarried("stores are inlined; their names go") },
  },
  "IRStore.items": {
    emit: "emitStore",
    import: {
      "cldr-legacy": CLDR_P("system store values"),
      ldml: P("<variables> members"),
      klc: PP("system store values only"),
      xkb: PP("system store values only"),
      keylayout: PP("system store values only"),
    },
    export: {
      ldml: A("item by item, see the StoreItem rows", "3.6"),
      klc: A("item by item, see the StoreItem rows"),
      xkb: A("item by item, see the StoreItem rows"),
      keylayout: A("item by item, see the StoreItem rows"),
    },
  },
  "IRStore.isSystem": {
    emit: "emitStore",
    import: {
      "cldr-legacy": CLDR_P("from the keyboard's names and the importer's options"),
      ldml: P("from <info> and <version>"),
      klc: P("from KBD, DESCRIPTION, COPYRIGHT, VERSION"),
      xkb: P("from the symbols block name"),
      keylayout: P("from the keyboard element's attributes"),
    },
    export: {
      ldml: A("metadata rows; some go to the package only", "4.1"),
      klc: A("KBD, DESCRIPTION, COPYRIGHT, VERSION; the rest go"),
      xkb: A("the block name only"),
      keylayout: A("name and id only"),
    },
  },
  "IRStore.targetSelector": {
    emit: "emitStore",
    import: { "cldr-legacy": NP("one target per file"), ldml: NP("one target per file"), ...desktopNever("one target per file") },
    export: { ldml: A("resolved per form", "1.13"), ...desktopNotCarried("resolved for the desktop target") },
  },
  "IRStore.trailingComment": {
    emit: "emitStore",
    import: { "cldr-legacy": NP("source comments are not kept per store"), ldml: NP("XML comments are discarded by the parser"), ...desktopNever("no stores to annotate") },
    export: { ldml: NC("Keyman's LDML parser discards XML comments; no mapping row"), ...desktopNotCarried("stores are inlined") },
  },

  // --- IRGroup fields ----------------------------------------------------
  "IRGroup.name": {
    emit: "emitGroupBodyFaithful",
    import: {
      "cldr-legacy": CLDR_P("a synthesised name (main)"),
      ldml: P("a synthesised name per key map and <transformGroup>"),
      klc: P("a synthesised name"), xkb: P("a synthesised name"), keylayout: P("a synthesised name"),
    },
    export: { ldml: NC("transform groups are unnamed; a structural comment names them"), ...desktopNotCarried("one unnamed key map") },
  },
  "IRGroup.usingKeys": {
    emit: "emitGroupBodyFaithful",
    import: {
      "cldr-legacy": CLDR_P("the one keystroke group"),
      ldml: P("the key map is a keystroke group; transform groups are context-only"),
      klc: P("the one keystroke group"), xkb: P("the one keystroke group"), keylayout: P("the one keystroke group"),
    },
    export: {
      ldml: M("the key map or a <transformGroup>", "1.5"),
      klc: A("the keystroke group only; context-only groups have no home"),
      xkb: A("the keystroke group only; context-only groups have no home"),
      keylayout: A("the keystroke group only; context-only groups have no home"),
    },
  },
  "IRGroup.rules": {
    emit: "emitGroupBodyFaithful",
    import: {
      "cldr-legacy": CLDR_P("keystroke rules, then dead-key rules"),
      ldml: P("keys and transforms"),
      klc: P("LAYOUT and DEADKEY entries"), xkb: P("key entries"), keylayout: P("keyMap entries and actions"),
    },
    export: {
      ldml: A("rule by rule, see the IRRule rows", "1.5"),
      klc: A("rule by rule, see the IRRule rows"),
      xkb: A("rule by rule, see the IRRule rows"),
      keylayout: A("rule by rule, see the IRRule rows"),
    },
  },
  "IRGroup.readonly": {
    emit: "emitGroupBodyFaithful",
    import: { "cldr-legacy": NP("no read-only groups"), ldml: NP("no read-only groups"), ...desktopNever("no read-only groups") },
    export: { ldml: NC("no keystroke trigger", "1.10"), ...desktopNotCarried("no read-only groups") },
  },

  // --- IRHeader fields ---------------------------------------------------
  "IRHeader.keyboardId": {
    emit: "emit",
    emitNote: "the file name keyboards/<id>/source/<id>.kmn",
    import: {
      "cldr-legacy": CLDR_P("the importer's id option"),
      ldml: P("from the file name"),
      klc: P("from KBD"), xkb: P("from the symbols block name"), keylayout: P("from the file name"),
    },
    export: {
      ldml: M("the file name source/<id>.xml and the package id; no numbered row (section 7)"),
      klc: A("KBD, at most eight characters"),
      xkb: A("the symbols file and block name"),
      keylayout: A("the bundle and file name"),
    },
  },
  "IRHeader.name": {
    emit: "emitStore",
    emitNote: "written as the &NAME system store",
    import: {
      "cldr-legacy": CLDR_P("<names> display name"),
      ldml: P("<info name>"),
      klc: P("DESCRIPTION"), xkb: P("name[Group1]"), keylayout: P("keyboard name attribute"),
    },
    export: {
      ldml: M("<info name>", "4.1"),
      klc: M("DESCRIPTION"), xkb: M("name[Group1]"), keylayout: M("keyboard name attribute"),
    },
  },
  "IRHeader.bcp47": {
    emit: "emit",
    emitNote: "carried by the package's .kps <Languages>, not the .kmn",
    kmnImport: NP("the reader leaves bcp47 empty; tags come from the .kps"),
    import: {
      "cldr-legacy": CLDR_P("the importer's bcp47 option, from the file's locale"),
      ldml: P("keyboard3/@locale and <locales>"),
      klc: P("LOCALENAME"),
      xkb: NP("languages live in evdev.xml, outside the symbols file"),
      keylayout: NP("languages live in the bundle's Info.plist"),
    },
    export: {
      ldml: M("keyboard3/@locale and <locales>", "4.4"),
      klc: A("LOCALENAME and LOCALEID hold one locale"),
      xkb: NC("languages live in evdev.xml, outside the symbols file"),
      keylayout: NC("languages live in the bundle's Info.plist"),
    },
  },
  "IRHeader.copyright": {
    emit: "emitStore",
    emitNote: "written as the &COPYRIGHT system store",
    import: {
      "cldr-legacy": CLDR_P("a synthesised &COPYRIGHT"),
      ldml: NP("<info> has no copyright"),
      klc: P("COPYRIGHT"),
      xkb: NP("only a file comment"),
      keylayout: NP("no copyright field"),
    },
    export: {
      ldml: NC("header comment and package files only", "4.9"),
      klc: M("COPYRIGHT"),
      xkb: NC("only a file comment"),
      keylayout: NC("no copyright field"),
    },
  },
  "IRHeader.version": {
    emit: "emitStore",
    emitNote: "written as the &KEYBOARDVERSION system store",
    import: {
      "cldr-legacy": CLDR_P("a synthesised 1.0"),
      ldml: P("<version number>"),
      klc: P("VERSION"),
      xkb: NP("no version field"),
      keylayout: NP("no version field"),
    },
    export: {
      ldml: M("<version number>, normalised to major.minor.patch", "4.3"),
      klc: M("VERSION"),
      xkb: NC("no version field"),
      keylayout: NC("no version field"),
    },
  },
  "IRHeader.targets": {
    emit: "emitStore",
    emitNote: "written as the &TARGETS system store",
    import: {
      "cldr-legacy": CLDR_P("any"),
      ldml: PP("from the forms present (hardware, touch)"),
      klc: PP("synthesised: windows"), xkb: PP("synthesised: linux"), keylayout: PP("synthesised: macosx"),
    },
    export: { ldml: A("decides which forms are exported", "4.6"), ...desktopNotCarried("one desktop platform per format") },
  },
  "IRHeader.storeDirectives": {
    emit: "emit",
    kmnImport: NP("the reader keeps directives as IRStore entries; this field stays empty"),
    import: { "cldr-legacy": NP("no KMN directives"), ldml: NP("no KMN directives"), ...desktopNever("no KMN directives") },
    export: { ldml: NC("KMN store bodies; no mapping row"), ...desktopNotCarried("KMN store bodies") },
  },
  "IRHeader.encoding": {
    emit: "emit",
    emitNote: "begin Unicode or begin ANSI",
    import: { "cldr-legacy": NP("left absent; the emitter writes Unicode"), ldml: NP("left absent; the emitter writes Unicode"), ...desktopNever("left absent; the emitter writes Unicode") },
    export: {
      ldml: A("Unicode carries; ANSI-only is refused", "1.2"),
      klc: A("Unicode carries; ANSI has no home"),
      xkb: A("Unicode carries; ANSI has no home"),
      keylayout: A("Unicode carries; ANSI has no home"),
    },
  },
  "IRHeader.entryPoints": {
    emit: "emit",
    emitNote: "the begin directives",
    import: { "cldr-legacy": NP("left absent; the emitter picks the first keystroke group"), ldml: NP("left absent; the emitter picks the first keystroke group"), ...desktopNever("left absent; the emitter picks the first keystroke group") },
    export: {
      ldml: A("main maps; NewContext and PostKeystroke have no trigger", "1.1"),
      klc: A("main only"), xkb: A("main only"), keylayout: A("main only"),
    },
  },

  // --- RawKmnFragment ----------------------------------------------------
  RawKmnFragment: {
    emit: "emitGroupBodyFaithful",
    emitNote: "sourceText written verbatim at its source position",
    kmnImport: P("KMN the reader cannot type, kept verbatim"),
    import: {
      "cldr-legacy": cell("n/a", NON_KMN_FRAGMENT_POLICY),
      ldml: cell("n/a", NON_KMN_FRAGMENT_POLICY),
      klc: cell("n/a", NON_KMN_FRAGMENT_POLICY),
      xkb: cell("n/a", NON_KMN_FRAGMENT_POLICY),
      keylayout: cell("n/a", NON_KMN_FRAGMENT_POLICY),
    },
    export: { ldml: NC("reported with its reason", "6.1"), ...desktopNotCarried("KMN text has no counterpart") },
  },
};

export const FORMAT_CAPABILITY_TABLE: readonly CapabilityRow[] = Object.entries(SPECS).map(
  ([construct, spec]) => build(construct, spec),
);

// ---------------------------------------------------------------------------
// Source constructs with no IR home today (FR-029a)
// ---------------------------------------------------------------------------

export const UNHOMED_CONSTRUCTS: readonly UnhomedConstruct[] = [
  {
    format: "ldml",
    construct: "LDML <reorder>",
    disposition: "tier-b-candidate",
    note: "Reorders by character property; KMN emulates them with context rules. A typed home would let an LDML round trip keep them.",
  },
  {
    format: "ldml",
    construct: "LDML marker outside a dead-key role (\\m{…} matched in a later transform group)",
    disposition: "tier-a-candidate",
    note: "Most markers map to namedDeadkey. A marker read across transform groups has no KMN equivalent beyond group chaining.",
  },
  {
    format: "ldml",
    construct: "LDML <transform> groups beyond what KMN maps (backspace transforms with regex classes, set mapping not in group 1)",
    disposition: "reported-at-import",
    note: "Expanded where finite; the rest is reported in the ImportReport.",
  },
  {
    format: "ldml",
    construct: "LDML <displays>, <flicks> and touch form widths",
    disposition: "reported-at-import",
    note: "Touch presentation belongs to TouchLayoutIR and KvksIR, outside this table's IR scope.",
  },
  {
    format: "keylayout",
    construct: ".keylayout <actions> states (chained, multi-level dead-key states)",
    disposition: "tier-b-candidate",
    note: "A single state maps to namedDeadkey. A state machine with nested states needs a typed state model to round trip.",
  },
  {
    format: "keylayout",
    construct: ".keylayout <terminators>",
    disposition: "tier-a-candidate",
    note: "The output when a state ends without a match. KMN spells it as a per-deadkey nomatch rule; a typed home keeps it explicit.",
  },
  {
    format: "xkb",
    construct: "XKB levels beyond 4 (key types with Level5 and higher)",
    disposition: "reported-at-import",
    note: "KMN modifier sets cannot name Level5; reported, not mapped.",
  },
  {
    format: "xkb",
    construct: "XKB groups (several layouts in one keymap)",
    disposition: "reported-at-import",
    note: "One keyboard per IR; an importer takes Group1 and reports the rest.",
  },
  {
    format: "klc",
    construct: "MSKLC SGCAPS (Cap = SGCap: a separate caps-lock row)",
    disposition: "tier-a-candidate",
    note: "Expressible as CAPS/NCAPS rules today, but losing the row shape makes the KLC export guess it back.",
  },
  {
    format: "klc",
    construct: "MSKLC LIGATURE sequences longer than four characters",
    disposition: "reported-at-import",
    note: "Ligatures up to four characters map to char output; MSKLC itself caps them there, so longer ones are malformed input.",
  },
];

// see spec.md §5a — KeyboardIR (keyboard intermediate representation) (Day-1 contract, pending #5b ratification at #232)
// Added 2026-06-08 (v1.1.0 KeyboardIR import amendment — docs/spec-amendment-2026-06-08-keyboardir.md)
// Field renames, type changes, and removals require a joint session + major version bump per spec §18.

import type { Pattern } from "./pattern";
import type { RemovalCapability } from "./removalCapability";

// ---------------------------------------------------------------------------
// Origin and node references
// ---------------------------------------------------------------------------

/** How this IR came to exist in the studio. */
export type IROrigin = "scaffolded" | "imported" | "synthesized";

/** A typed reference to a single node in the IR, used for back-references. */
export interface IRNodeRef {
  kind: "rule" | "store" | "group" | "touchKey" | "kvksKey" | "comment" | "raw";
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Detailed element types (finalised at #232 joint session)
// ---------------------------------------------------------------------------

/** A single item in a KMN store (character literal, virtual key, deadkey marker, etc.). */
export type StoreItem =
  | { kind: "char"; value: string }
  | { kind: "vkey"; name: string }
  | { kind: "deadkey"; id: number }
  | { kind: "any" }
  | { kind: "raw"; text: string };

/** An element in a KMN rule's context (LHS). */
export type ContextElement =
  | { kind: "char"; value: string }
  | { kind: "vkey"; name: string; modifiers: string[] }
  | { kind: "deadkey"; id: number }
  | { kind: "any"; storeRef: string }
  | { kind: "notany"; storeRef: string }
  | { kind: "context"; offset: number }
  | { kind: "index"; storeRef: string; offset: number }
  /**
   * The `value` string is used verbatim as the layout-name argument to `baselayout(...)` in emitted KMN.
   * It must not contain single-quote characters. Case is preserved here but the Keyman compiler compares case-insensitively.
   */
  | { kind: "baselayout"; value: string }
  | { kind: "raw"; text: string };

/** An element in a KMN rule's output (RHS). */
export type OutputElement =
  | { kind: "char"; value: string }
  | { kind: "deadkey"; id: number }
  | { kind: "beep" }
  | { kind: "index"; storeRef: string; offset: number }
  | { kind: "outs"; storeRef: string }
  | { kind: "raw"; text: string };

/** A virtual key + modifier combination (used in the I2 round-trip enumeration corpus). */
export interface KeyChord {
  vkey: string;
  modifiers: string[];
}

/**
 * Origin of a touch-key placement — the single source the no-clobber
 * re-propagation rule reads (spec-014 FR-008/-009, provenance.contract.md).
 *
 * - "base-derived"       — derived from the base keyboard's touch layout.
 * - "physical-suggested" — proposed by the touchSuggest generator from a
 *                          physical-key decision (S-01/S-02/S-03/S-08).
 * - "hand-set"           — manually placed by the author; the conservative
 *                          default for pre-existing / untagged keys.
 *
 * `base-derived` and `physical-suggested` are the auto-managed states that
 * re-propagation may overwrite; `hand-set` (and any absent provenance, which
 * deserializes as `hand-set`) is never auto-clobbered.
 */
export type TouchKeyProvenance =
  | "base-derived"
  | "physical-suggested"
  | "hand-set";

/** A single key node in a touch layout layer. */
export interface TouchKeyIR {
  nodeId: string;
  id: string;
  text?: string;
  /**
   * Origin of this key's placement (spec-014 FR-008). Optional/additive: an
   * absent or pre-existing-untagged key is treated as `"hand-set"` and is
   * never auto-clobbered by re-propagation. `"base-derived"` and
   * `"physical-suggested"` are the auto-managed states re-propagation owns.
   */
  provenance?: TouchKeyProvenance;
  /** Small label shown in the key corner to signal a longpress menu exists. */
  hint?: string;
  output?: string;
  nextlayer?: string;
  /** Sub-keys (longpress menu). */
  sk?: TouchKeyIR[];
  /** Directional gesture map (compass directions). */
  flick?: Partial<Record<"n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw", TouchKeyIR>>;
  /** Rapid successive taps cycling through characters. */
  multitap?: TouchKeyIR[];
  /**
   * Key class from .keyman-touch-layout `sp` (0 letter, 1 special, 2 active-special, 8 spacer).
   * The wire format encodes this as a JSON string (e.g. `"sp": "1"`); the IR normalizes it to a number.
   */
  sp?: number;
  /**
   * Relative key width (percent) from .keyman-touch-layout.
   * The wire format encodes this as a JSON string (e.g. `"width": "100"`); the IR normalizes it to a number.
   */
  width?: number;
  /**
   * Left padding (in Keyman layout units) from .keyman-touch-layout.
   * The wire format encodes this as a JSON string (e.g. `"pad": "50"`); the IR normalizes it to a number.
   * Default when absent: DEFAULT_PAD (15) applied by the KMW polyfill at render time.
   */
  pad?: number;
}

/** Diff produced by the I2 functional-equivalence round-trip check (decision D7, spec §14). */
export interface RoundTripDiff {
  corpus: string;
  /**
   * Bounded-enumeration parameters used to generate the corpus. Pinned to the diff so
   * divergence reports are reproducible across package versions even if the depth
   * constants later move (spec §14 D7, ratified at #232).
   */
  corpusSpec: {
    vkeyCount: number;
    modifierSets: string[][];
    deadkeyDepth: number;
  };
  inputCount: number;
  divergedInputs: Array<{
    input: KeyChord[];
    originalOutput: string;
    reemittedOutput: string;
  }>;
}

// ---------------------------------------------------------------------------
// IR node types
// ---------------------------------------------------------------------------

/** Metadata header (maps to KMN file-level &NAME / &COPYRIGHT / &VERSION store directives). */
export interface IRHeader {
  keyboardId: string;
  name: string;
  bcp47: string[];
  copyright: string;
  version: string;
  targets: string[];
  /** Additional file-level &-store directives beyond the typed fields above, in declaration order. Each entry is the raw KMN store body. */
  storeDirectives: string[];
  /**
   * KMN begin-directive encoding type, set by the parser from `begin Unicode`
   * or `begin ANSI`.  Absent when the keyboard was constructed in-memory
   * (scaffolded) rather than imported.  Used by isMnemonicKeyboard() to detect
   * ANSI keyboards at import time without altering the stores array.
   */
  encoding?: "Unicode" | "ANSI";
}

/** A single KMN store declaration. */
/**
 * Target-selector prefix applied to a source line by kmcmplib:
 *   "keyman"     — `$keyman:`     applies to both Keyman desktop and KeymanWeb
 *   "keymanweb"  — `$keymanweb:`  applies to KeymanWeb only
 *   "keymanonly" — `$keymanonly:` applies to Keyman desktop only
 * Source: keyman/developer/src/kmcmplib/src/Compiler.cpp::GetLinePrefixType
 */
export type TargetSelector = "keyman" | "keymanweb" | "keymanonly";

export interface IRStore {
  nodeId: string;
  name: string;
  items: StoreItem[];
  /** True for system/compiler-directive stores (&NAME, &COPYRIGHT, etc.). */
  isSystem: boolean;
  /**
   * Set when the source line carried a `$keyman[web|only]:` prefix.
   * Preserved structurally so the codec can round-trip per-target stores.
   */
  targetSelector?: TargetSelector;
  /**
   * 1-based source line number from the original .kmn file, set by the parser.
   * Used by the position-faithful emit path to interleave stores with fragments
   * and rules in their original source order when `ir.raw.length > 0`.
   * Absent for in-memory (scaffolded/synthesized) stores.
   */
  sourceLine?: number;
}

/** A KMN group (begin / group ... using keys). */
export interface IRGroup {
  nodeId: string;
  name: string;
  usingKeys: boolean;
  rules: IRRule[];
  /** True for groups the emitter must not modify (e.g. those inside a RawKmnFragment). */
  readonly: boolean;
  /**
   * 1-based source line number of the `group(...)` header token, set by the parser.
   * Used by the position-faithful emit path to attribute user stores to their owning
   * group by position (a store belongs to the group whose header sourceLine is the
   * greatest one <= the store's sourceLine). Absent for in-memory (scaffolded) groups.
   */
  sourceLine?: number;
}

/** A single KMN rule within a group. */
export interface IRRule {
  nodeId: string;
  context: ContextElement[];
  output: OutputElement[];
  trailingComment?: string;
  /** ID of the Pattern that owns this node; set by the pattern recognizer. */
  ownedByPattern?: string;
  /**
   * Set for group-transition rules of the form `match > use(g)` or
   * `nomatch > use(g)`. Preserved structurally so the codec can round-trip
   * the leading keyword — emit-without-this-field produces a bare `>`,
   * which kmcmplib rejects as KM_ERROR_KMCMP_InvalidToken.
   */
  matchKind?: "match" | "nomatch";
  /**
   * Set when the source line carried a `$keyman[web|only]:` prefix.
   * Preserved structurally so the codec can round-trip per-target rules.
   * See {@link TargetSelector} for the kmcmplib semantics.
   */
  targetSelector?: TargetSelector;
  /**
   * 1-based source line number from the original .kmn file, set by the parser.
   * Used by the position-faithful emit path to interleave rules with stores and
   * fragments in their original source order when `ir.raw.length > 0`.
   * Absent for in-memory (scaffolded/synthesized) rules.
   */
  sourceLine?: number;
}

/** A KMN comment node. */
export interface IRComment {
  nodeId: string;
  text: string;
  anchor: "leading" | "trailing" | "freestanding";
  anchorRef?: IRNodeRef;
}

/**
 * A KMN fragment the codec could not map to a typed IR node.
 * Preserved verbatim at round-trip (decision D8, spec §14).
 * Rendered as a deletable card in the carve gallery; not survey-editable in v1.
 */
export interface RawKmnFragment {
  nodeId: string;
  origin: "imported";
  sourceText: string;
  /**
   * Named opaque-feature reason, e.g.:
   *   "save/set/reset option-store" | "call/return" | "indexed context(n)"
   *   | "outs()" | "SMP 5-digit literal"
   */
  reason: string;
  /**
   * 1-based source line number from the original .kmn file, set by the parser.
   * Used by the position-faithful emit path to interleave fragments with rules
   * and stores in their original source order when `ir.raw.length > 0`.
   * Absent for fragments with no traceable source line.
   */
  sourceLine?: number;
  /**
   * nodeId of the IRGroup that contains this fragment, or undefined for global
   * fragments (e.g. pre-begin unknown constructs). Used by the position-faithful
   * emit path to place fragments inside the correct group's output block.
   */
  groupNodeId?: string;
}

/**
 * Parsed .keyman-touch-layout file.
 * The real file is a JSON object whose top-level keys are platform names; each
 * platform carries its own independent layer array with different key populations
 * and row counts. A flat `layers` shape would silently collapse one platform's data
 * on round-trip — hence the `platforms` wrapper (ratified at #232).
 */
export interface TouchLayoutIR {
  platforms: Array<{
    id: "phone" | "tablet" | "desktop";
    font?: string;
    layers: Array<{
      id: string;
      rows: Array<{ keys: TouchKeyIR[] }>;
    }>;
  }>;
  /**
   * Map from platform-id+layer-id+key-id to IR node reference, as an entry array
   * for JSON round-trip compatibility (spec §11).
   */
  nodeIds: Array<[string, IRNodeRef]>;
}

/**
 * Parsed .kvks file (visual keyboard XML).
 * `label` is the display text shown on the on-screen keyboard; `chars` is what the
 * key actually emits when activated. Real kvks files commonly use distinct values
 * (e.g. label="ZWNJ" with no emitted chars — the rule fires the codepoint).
 * Ratified shape at #232.
 */
export interface KvksIR {
  /** Optional KVKS version attribute from the <version> header element. */
  kvksVersion?: string;
  /** Optional keyboard display name from the <kbdname> header element. */
  kbdname?: string;
  /** Optional OSK font family from the `<encoding fontname="...">` attribute. */
  fontFamily?: string;
  layers: Array<{
    shift: string;
    keys: Array<{
      vkey: string;
      /** Display label shown on the on-screen keyboard. */
      label: string;
      /** Characters emitted when the key is pressed; absent for label-only keys. */
      chars?: string;
    }>;
  }>;
  usealtgr: boolean;
  /**
   * Map from shift-state+vkey to IR node reference, as an entry array for JSON
   * round-trip compatibility (spec §11).
   */
  nodeIds: Array<[string, IRNodeRef]>;
}

// ---------------------------------------------------------------------------
// Top-level IR and import report
// ---------------------------------------------------------------------------

/**
 * The typed, in-memory representation of a single Keyman keyboard.
 * Once a session exists in the studio the IR is the source of truth (decision D9, spec §14):
 * the survey, carve gallery, validator, and scaffolder all read and mutate the IR;
 * the emitter renders the final .kmn from the IR.
 * @see spec.md §5a
 */
export interface KeyboardIR {
  origin: IROrigin;
  header: IRHeader;
  stores: IRStore[];
  groups: IRGroup[];
  comments: IRComment[];
  raw: RawKmnFragment[];
  touchLayout?: TouchLayoutIR;
  visualKeyboard?: KvksIR;
  /** Patterns lifted from the IR by the pattern recognizer (origin: 'recognized'). */
  recognizedPatterns: Pattern[];
}

/** Status returned by the codec after parsing a source keyboard. */
export enum ImportStatus {
  /** Codec parsed every token; I2 round-trip passes; no opaque fragments. */
  Clean = "clean",
  /** Codec parsed every token; I2 round-trip passes; some RawKmnFragment nodes present. */
  CleanWithOpaque = "clean-with-opaque",
  /** Codec encountered a syntax error and could not produce a usable IR. */
  ParseFailure = "parse-failure",
  /** I2 round-trip check: WASM oracle produces different output from original vs. re-emitted. */
  RoundTripDivergence = "round-trip-divergence",
}

/** Full report produced by the codec + Layer A' checks (I1-I5) after parsing a source keyboard. */
export interface ImportReport {
  keyboardId: string;
  status: ImportStatus;
  parseErrors: string[];
  /** Per-feature count of opaque fragments (populated by check I4). */
  opaqueFeatureInventory: Array<{ feature: string; count: number }>;
  /** Fraction of IR rules owned by a recognized Pattern (0–1). */
  recognizedRatio: number;
  /** Populated when status is RoundTripDivergence (check I2 failure). */
  roundTripDiff?: RoundTripDiff;
  /**
   * Per-node removal capability classifications produced by
   * `classifyRemovalCapabilities` at import time.
   * Entry-array form (mirroring `TouchLayoutIR.nodeIds`) for JSON round-trip
   * compatibility.  Keys are rule/fragment nodeIds plus output-store nodeId
   * aliases for S-02 slot tiles.
   */
  removalCapabilities?: Array<[string, RemovalCapability]>;
}

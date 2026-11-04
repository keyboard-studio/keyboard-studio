// Engine types for the LDML keyboard export (spec 108). Mirrors
// specs/108-ldml-export/data-model.md and contracts/exporter-api.md.
// Type-only: this file has no runtime code and imports nothing at runtime.

import type { KeyboardIR, KvksIR, TouchLayoutIR } from "@keyboard-studio/contracts";

/** A target profile id; equals the document's `conformsTo`. */
export type LdmlProfileId = "46" | "49";

/** A mapping-contract row id, for example "3.17" or "2.26". */
export type RowId = string;

/** A main-block key position in the base-layout vocabulary (`K_A`, `K_OE2`, ...). */
export type LdmlVKey = string;

/**
 * Every code in the mapping contract's code table (contracts/ldml-mapping.md).
 * Codes are `KM_LINT_*`, never `KM_WARN_*`, so the Output page's "Other findings"
 * panel does not filter them out.
 */
export type LdmlCode =
  | "KM_LINT_LDML_NO_KEY_TRIGGER"
  | "KM_LINT_LDML_GROUP_CHAIN_PARTIAL"
  | "KM_LINT_LDML_MATCH_NOMATCH_OUTPUT"
  | "KM_LINT_LDML_CALL"
  | "KM_LINT_LDML_PLATFORM_CONDITION"
  | "KM_LINT_LDML_FORM_KEY_MISSING"
  | "KM_LINT_LDML_FRAME_KEY"
  | "KM_LINT_LDML_MNEMONIC"
  | "KM_LINT_LDML_SHIFT_SIDE"
  | "KM_LINT_LDML_BASE_DEADKEY"
  | "KM_LINT_LDML_CAPS_MODE"
  | "KM_LINT_LDML_EXPANSION_LIMIT"
  | "KM_LINT_LDML_NOTANY_MULTI"
  | "KM_LINT_LDML_CAPTURE_LIMIT"
  | "KM_LINT_LDML_BEEP"
  | "KM_LINT_LDML_CONTEXT_START"
  | "KM_LINT_LDML_MODIFIER"
  | "KM_LINT_LDML_MODIFIER_SIDES"
  | "KM_LINT_LDML_BKSP_NO_CONTEXT"
  | "KM_LINT_LDML_KEY_STORE"
  | "KM_LINT_LDML_NEGATED_CLASS"
  | "KM_LINT_LDML_OPTION_STATE"
  | "KM_LINT_LDML_BASELAYOUT_CONDITION"
  | "KM_LINT_LDML_LAYER_STATE"
  | "KM_LINT_LDML_NORMALIZATION"
  | "KM_LINT_LDML_OPAQUE"
  | "KM_LINT_LDML_ANSI_ONLY"
  | "KM_LINT_LDML_NO_LOCALE"
  | "KM_LINT_LDML_UNREACHABLE"
  | "KM_LINT_LDML_HEADER_UNSUPPORTED"
  | "KM_LINT_LDML_METADATA_PACKAGE_ONLY"
  | "KM_LINT_LDML_KEYMAN_GAP"
  | "KM_LINT_LDML_TOUCH_PRESENTATION"
  | "KM_LINT_LDML_TOUCH_SPECIAL_KEY";

/** M = maps, A = approximated, N = not exported, K = Keyman gap. */
export type LdmlStatus = "M" | "A" | "N" | "K";

export type LdmlSeverity = "warning" | "hint";

/** Which report section an item belongs in (FR-031). */
export type LdmlSide = "hardware" | "touch" | "package";

/** One classified site (spec Key Entities; data-model CompatibilityItem). */
export interface CompatibilityItem {
  /** `${code}|${rowId}|${nodeKey}`: the identity used for FR-012 / SC-005. */
  siteKey: string;
  rowId: RowId;
  status: LdmlStatus;
  /** `null` for an M item without a hint. */
  code: LdmlCode | null;
  severity: LdmlSeverity | null;
  /** `group:<name>#<ordinal>`, `fragment#<ordinal>`, `store:<NAME>`, `touch:<platform>/<layer>/<key>`,
   *  `header:<field>`, `base:<layer>/<vkey>` or `behaviour:<name>`. */
  nodeKey: string;
  /** `sourceLine` from the IR that was classified. */
  line: number | null;
  /** The group and its owning pattern or behaviour, for items with no line (FR-017). */
  owner: string | null;
  /** A short English construct label. */
  construct: string;
  /** An English sentence: what LDML does instead. */
  consequence: string;
  /** Values the studio's translated message interpolates. */
  params: Record<string, string>;
  side: LdmlSide;
}

export type LdmlBaseLayoutId = "us" | "us-intl" | "azerty" | "qwertz" | "uk";

export type LdmlBaseLayoutSource = "author" | "primary-pick" | "likely-base" | "en-US";

export type LdmlBaseLayoutLayerName = "base" | "shift" | "altgr" | "shiftAltgr";

/** The export's one base keyboard (FR-027; research R26). Chosen in the studio, never resolved in the engine. */
export interface LdmlBaseLayout {
  id: LdmlBaseLayoutId;
  label: string;
  source: LdmlBaseLayoutSource;
  /** Goes to `info/@layout`. */
  family: "QWERTY" | "AZERTY" | "QWERTZ";
  /** The table has a `K_OE2` cell. */
  isoFamily: boolean;
  layers: Record<LdmlBaseLayoutLayerName, Record<LdmlVKey, string | "deadkey">>;
}

/** The frozen result of classification; the findings view and the report view project it. */
export interface LdmlClassification {
  profileId: LdmlProfileId;
  /** Sorted by `siteKey`. */
  items: CompatibilityItem[];
  counts: Record<LdmlStatus, number>;
  baseLayout: Pick<LdmlBaseLayout, "id" | "label" | "source">;
  ansiOnly: boolean;
  touchPresent: boolean;
}

export interface LdmlClassifyInput {
  /** Parsed from the PROJECTED source/<id>.kmn. */
  ir: KeyboardIR;
  touchLayout: TouchLayoutIR | null;
  visualKeyboard: KvksIR | null;
  baseLayout: LdmlBaseLayout;
}

/** Metadata the studio reads from the same identity the KMN `.kps` writer uses. */
export interface LdmlExportMetadata {
  /** `<kmnid>_ldml`; must match `/^[a-z_][a-z0-9_]*$/` (FR-040). */
  projectId: string;
  name: string;
  version: string;
  /** Minimal likely-subtags BCP 47 tags, no `-k0-` (FR-041). */
  languages: readonly string[];
  author: string;
  authorEmail: string;
  copyright: string;
  licenceName: string;
  description: string;
  homePage: string;
  attributionText: string;
  indicator: string | null;
}

export interface LdmlPackageBinaryFile {
  name: string;
  bytes: Uint8Array;
}

/** Text and binaries the package carries beyond the generated keyboard (export-package.md). */
export interface LdmlPackageFiles {
  readmeHtm: string;
  welcomeHtm: string;
  licenseMd: string;
  readmeMd: string;
  historyMd: string;
  icon: LdmlPackageBinaryFile | null;
  fonts: readonly LdmlPackageBinaryFile[];
}

export interface LdmlExportInput extends LdmlClassifyInput {
  profileId: LdmlProfileId;
  /** The OUTPUT id (resolveOutputKeyboardId). */
  keyboardId: string;
  metadata: LdmlExportMetadata;
  packageFiles: LdmlPackageFiles;
  studioVersion: string;
}

export type LdmlExportResult =
  | {
      ok: true;
      zip: Uint8Array;
      filename: string;
      files: ReadonlyMap<string, string | Uint8Array>;
      classification: LdmlClassification;
    }
  | { ok: false; reason: "ansi-only"; classification: LdmlClassification };

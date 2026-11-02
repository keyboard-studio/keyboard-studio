// Target-profile types for the LDML keyboard export (spec 108, FR-060).
// Mirrors specs/108-ldml-export/data-model.md. Type-only.

import type { LdmlCode, LdmlProfileId, LdmlSeverity, RowId } from "../types.js";

/** M = maps, A = approximated, N = not exported, K = Keyman gap; composites for rows whose status depends on the site. */
export type ProfileRowStatus = "M" | "A" | "N" | "K" | "M/A" | "M/N" | "A/N";

/** One row of the mapping contract, as data. */
export interface ProfileRow {
  id: RowId;
  status: ProfileRowStatus;
  code?: LdmlCode;
  severity: LdmlSeverity | null;
  /** A short summary of the LDML form the row maps to. */
  form: string;
  /** FR-063 lift condition. */
  lift?: string;
  /** Keyman message codes a K row is expected to raise (H1). */
  keymanCodes?: string[];
}

/**
 * A change to one base row. A `null` `code` or `severity` clears the base value
 * (needed where a delta removes a hint).
 */
export interface RowDelta {
  id: RowId;
  status?: ProfileRowStatus;
  code?: LdmlCode | null;
  severity?: LdmlSeverity | null;
  form?: string;
  lift?: string;
}

export interface TargetProfile {
  /** Equals the document's `conformsTo`. */
  id: LdmlProfileId;
  namespace: string;
  tr35Revision: string;
  /** `null` means TR35-only: no Keyman release compiles it. */
  keymanRelease: string | null;
  /** Equals "the pinned Keyman schema accepts `conformsTo`" (FR-065). */
  keymanCompilable: boolean;
  /** Exactly one profile: the newest with `keymanCompilable`. */
  isDefault: boolean;
  rows: ReadonlyMap<RowId, ProfileRow>;
  deltas: readonly RowDelta[];
  /** Profile-level switch derived from row 4.10; the lowering never compares profile ids. */
  writeAttribution: boolean;
}

/** A profile before its deltas are applied: everything but the resolved rows. */
export type ProfileMeta = Omit<TargetProfile, "rows" | "deltas">;

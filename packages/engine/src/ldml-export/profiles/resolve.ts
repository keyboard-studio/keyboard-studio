// Profile resolution (spec 108, FR-060, FR-061): applies a profile's deltas to
// profile 46, deep-freezes the result, and lists the profiles newest first.

import type { LdmlProfileId } from "../types.js";
import { PROFILE_46_META, PROFILE_46_ROWS } from "./profile46.js";
import { PROFILE_49_DELTAS, PROFILE_49_META } from "./profile49.js";
import type { ProfileMeta, ProfileRow, RowDelta, TargetProfile } from "./types.js";

function frozenMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  const map = new Map<K, V>(entries);
  const refuse = (): never => {
    throw new TypeError("LDML profile rows are frozen");
  };
  for (const name of ["set", "delete", "clear"] as const) {
    Object.defineProperty(map, name, { value: refuse });
  }
  return Object.freeze(map);
}

function cloneRow(r: ProfileRow): ProfileRow {
  const copy: ProfileRow = { ...r };
  if (r.keymanCodes !== undefined) copy.keymanCodes = [...r.keymanCodes];
  return copy;
}

function applyDelta(base: ProfileRow, d: RowDelta): ProfileRow {
  const next = cloneRow(base);
  if (d.status !== undefined) next.status = d.status;
  if (d.code === null) delete next.code;
  else if (d.code !== undefined) next.code = d.code;
  if (d.severity !== undefined) next.severity = d.severity;
  if (d.form !== undefined) next.form = d.form;
  if (d.lift !== undefined) next.lift = d.lift;
  return next;
}

/**
 * Builds a profile from a base row list, its metadata and its deltas. Throws on a delta that
 * names a row the base does not have (H7). The result is deep-frozen.
 */
export function buildProfile(
  baseRows: readonly ProfileRow[],
  meta: ProfileMeta,
  deltas: readonly RowDelta[],
): TargetProfile {
  const rows = new Map<string, ProfileRow>();
  for (const r of baseRows) rows.set(r.id, cloneRow(r));
  for (const d of deltas) {
    const existing = rows.get(d.id);
    if (existing === undefined) {
      throw new Error(`LDML profile ${meta.id}: delta names missing row ${d.id}`);
    }
    rows.set(d.id, applyDelta(existing, d));
  }
  for (const r of rows.values()) {
    if (r.keymanCodes !== undefined) Object.freeze(r.keymanCodes);
    Object.freeze(r);
  }
  return Object.freeze({
    ...meta,
    rows: frozenMap(rows),
    deltas: Object.freeze(deltas.map((d) => Object.freeze({ ...d }))),
  });
}

// Newest first.
const PROFILES: ReadonlyMap<LdmlProfileId, TargetProfile> = new Map<LdmlProfileId, TargetProfile>([
  ["49", buildProfile(PROFILE_46_ROWS, PROFILE_49_META, PROFILE_49_DELTAS)],
  ["46", buildProfile(PROFILE_46_ROWS, PROFILE_46_META, [])],
]);

/** Resolves a profile id to its frozen profile. Throws on an unknown id. */
export function resolveLdmlProfile(id: string): TargetProfile {
  const profile = PROFILES.get(id as LdmlProfileId);
  if (profile === undefined) throw new Error(`Unknown LDML profile id: ${id}`);
  return profile;
}

/** The profiles, newest first. */
export function listLdmlProfiles(): readonly TargetProfile[] {
  return [...PROFILES.values()];
}

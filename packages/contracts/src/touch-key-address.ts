/**
 * touch-key-address — stable id scheme for addressing a single node (main key,
 * longpress sub-key, multitap entry, or flick direction) inside a
 * `.keyman-touch-layout` / `TouchLayoutIR`, for the pre-existing-touch-method
 * deletion overlay (`workingCopyStore.deletedTouchKeyIds`).
 *
 * Format: `"<platform>:<layerId>:<keyId>"` for a main key, extended with a
 * `:sk:<subId>` / `:multitap:<subId>` / `:flick:<direction>` suffix for a
 * sub-entry. This is NOT a new convention invented for this feature — it is
 * the exact composite key `@keyboard-studio/contracts`'s
 * `parseTouchLayoutString` already builds for `TouchLayoutIR.nodeIds`
 * (`${platform}:${id}:${key.id}` and `${platform}:${id}:${key.id}:sk:${sk.id}`,
 * spec §11 "JSON round-trip compatibility"). This module only adds the
 * `multitap`/`flick` suffix forms the existing nodeIds map does not need
 * (nodeIds only tracks sk, not multitap/flick), and exports the builders so
 * the enumeration and removal passes below can never independently drift on
 * the format.
 *
 * Stability: the address is built from the platform id, layer id, and the
 * ORIGINAL key/sub-key id as they appear in the (pre-deletion) touch layout —
 * never from array position — so it survives re-derivation of the layout
 * across debounce cycles as long as the underlying key/sub-key id is
 * unchanged. A key whose id was already neutralized by an earlier projection
 * step (e.g. the desktop-carve cascade's `T_carved_*` rewrite, spec
 * `applyCarveKeycapRemovalsToVfs`) no longer matches its pre-neutralization
 * address, so a stale `deletedTouchKeyIds` entry for it silently fails to
 * resolve on a later pass — the intended idempotent behavior (a touch key
 * already blanked by the desktop cascade is never double-processed or
 * errored; see `applyTouchKeycapRemovalsToVfs`'s doc comment).
 *
 * Not stably addressable: a real .keyman-touch-layout can carry duplicate key
 * ids within one layer (rare, but not schema-forbidden). This module inherits
 * that same limitation from the existing `nodeIds` convention rather than
 * inventing a stricter (and divergent) scheme — see the module doc on
 * `applyTouchKeycapRemovalsToVfs.ts` for the practical consequence.
 *
 * ## Why this module sits in contracts (spec 058 T114)
 *
 * It was written in `packages/engine/src/pattern-apply/touchKeyAddress.ts`, and
 * that path still works — it is now a re-export shim over this module, so every
 * engine and studio import site is unchanged. The definition moved here because
 * `touch-key-diagnostics.ts`'s detectors need to build addresses and live in
 * contracts by force (FR-040's one-implementation rule; Layer C cannot import
 * engine). Hosting a third copy of the format was the alternative, and this
 * module's own doc above already explains why a second copy is a defect.
 *
 * Contracts is also the format's true origin: `parseTouchLayout.ts` builds the
 * identical `${platform}:${layerId}:${keyId}` composite for
 * `TouchLayoutIR.nodeIds`, and now calls {@link touchKeyAddress} /
 * {@link touchSubKeyAddress} to do it rather than re-interpolating the format
 * by hand.
 */

/** Build the stable address for a main key. */
export function touchKeyAddress(platform: string, layerId: string, keyId: string): string {
  return `${platform}:${layerId}:${keyId}`;
}

/** Build the stable address for an `sk[]` (longpress) or `multitap[]` sub-entry. */
export function touchSubKeyAddress(
  platform: string,
  layerId: string,
  keyId: string,
  kind: "sk" | "multitap",
  subId: string,
): string {
  return `${touchKeyAddress(platform, layerId, keyId)}:${kind}:${subId}`;
}

/** Build the stable address for a `flick{}` directional gesture entry. */
export function touchFlickAddress(
  platform: string,
  layerId: string,
  keyId: string,
  direction: string,
): string {
  return `${touchKeyAddress(platform, layerId, keyId)}:flick:${direction}`;
}

/**
 * The decomposed parts of an address built by any of the three builders above.
 *
 * `sub` is absent for a main-key address. For a sub-entry, `sub.kind` names
 * which collection the entry lives in and `sub.id` is the `sk`/`multitap`
 * sub-key id or the `flick` direction, exactly as it appeared in the address.
 */
export interface TouchKeyAddressParts {
  platform: string;
  layerId: string;
  keyId: string;
  sub?: { kind: "sk" | "multitap" | "flick"; id: string };
}

const SUB_KINDS = new Set(["sk", "multitap", "flick"]);

/**
 * Parse an address back into its parts — the inverse of the three builders.
 *
 * Returns `undefined`, and NEVER throws, for anything that is not a
 * well-formed address. Callers replaying an operation log against a
 * re-derived layout hit unresolvable input as a matter of course, and an
 * exception there would turn a reportable orphan into a crash.
 *
 * ## Why this is not a naive `split(":")`
 *
 * Key ids are not constrained to be colon-free — the `T_*` id grammar accepts
 * any run of non-whitespace, and nothing in the `.keyman-touch-layout` schema
 * forbids a colon inside an id. Platform ids and layer ids, by contrast, come
 * from fixed vocabularies (`phone`/`tablet`/`desktop`; layer ids built from the
 * modifier-combo fragments) and never contain a colon in any shipped corpus
 * file. So the parse is anchored from BOTH ends:
 *
 *   - the first two colon-delimited fields are the platform and the layer;
 *   - a trailing `:<sub-kind>:<sub-id>` is recognized only when the field two
 *     from the end is exactly `sk`, `multitap`, or `flick`;
 *   - everything in between is the key id, colons and all.
 *
 * The residual ambiguity is a key id whose own text ends in `:sk:<something>`.
 * That is pinned as parsing to a sub-entry, matching what the builders would
 * produce for the shorter id — the addresses are genuinely equal strings, so no
 * parser can separate them, and the sub-entry reading is the one the deletion
 * overlay and the edit overlay both intend.
 */
export function parseTouchKeyAddress(address: string): TouchKeyAddressParts | undefined {
  if (typeof address !== "string" || address.length === 0) return undefined;

  const fields = address.split(":");
  // Minimum well-formed shape is platform:layer:key — three non-empty fields.
  if (fields.length < 3) return undefined;

  let sub: TouchKeyAddressParts["sub"];
  let keyFields = fields.slice(2);

  if (keyFields.length >= 3) {
    const kind = keyFields[keyFields.length - 2];
    if (kind !== undefined && SUB_KINDS.has(kind)) {
      const subId = keyFields[keyFields.length - 1] ?? "";
      if (subId.length === 0) return undefined;
      sub = { kind: kind as "sk" | "multitap" | "flick", id: subId };
      keyFields = keyFields.slice(0, -2);
    }
  }

  const platform = fields[0] ?? "";
  const layerId = fields[1] ?? "";
  const keyId = keyFields.join(":");
  if (platform.length === 0 || layerId.length === 0 || keyId.length === 0) return undefined;

  return sub ? { platform, layerId, keyId, sub } : { platform, layerId, keyId };
}

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
 * ## Duplicate ids, and the occurrence suffix
 *
 * A real `.keyman-touch-layout` carries duplicate key ids within one layer
 * routinely, not rarely: blank and spacer keys have nothing to name them, so
 * `sil_cameroon_azerty` spells `T_BLANK` twenty-five times inside a single
 * tablet layer and `K_SHIFT` twice, and every scaffolded layout does the same.
 * This module used to inherit the resulting ambiguity from the `nodeIds`
 * convention and document it as a limitation. The practical consequence was
 * that selecting one blank selected all of them and edited the first, so a key
 * past the first could not be put back into service at all.
 *
 * An address may therefore carry a trailing `#<n>` naming WHICH key with that
 * id is meant, counted row-major within the layer from 0
 * ({@link createKeyOccurrenceCounter}). The suffix is written only for `n >= 1`,
 * so:
 *
 *   - `phone:default:T_BLANK`    — the first `T_BLANK` in the layer
 *   - `phone:default:T_BLANK#3`  — the fourth
 *
 * **This is additive, and deliberately so.** Every address written before
 * occurrences existed is still spelled the same way and still means the same
 * key, so persisted overlay operations and `deletedTouchKeyIds` entries keep
 * resolving without migration. A bare address means "the first", which is
 * exactly what it has always meant.
 *
 * Stability under editing is the same bargain the id-based address already
 * made, one level finer: inserting or removing another key with the SAME id
 * earlier in the layer shifts later occurrences, just as renaming a key already
 * invalidates its address. Both degrade to an ordinary unresolved-address
 * orphan, which replay reports rather than throwing.
 *
 * The residual parse ambiguity is a key id whose own text ends in `#` followed
 * by digits. `T_\S+` admits it, so it cannot be excluded by grammar — it is
 * pinned as parsing to an occurrence, exactly as the `:sk:` ambiguity below is
 * pinned to a sub-entry, and for the same reason: the addresses are equal
 * strings, so no parser can separate them, and the occurrence reading is the
 * one every builder here intends.
 *
 * ## Why this module sits in contracts (spec 063 T114)
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

/**
 * Which key with a given id, within its layer, an address means — counted
 * row-major from 0 (see {@link createKeyOccurrenceCounter}).
 *
 * `0` and `undefined` are the same thing and both produce the BARE address, so
 * every address ever written before occurrences existed keeps its exact
 * spelling and its exact meaning ("the first key with this id"). Only the
 * second and later occurrences carry a suffix.
 */
export type TouchKeyOccurrence = number | undefined;

/** `#` + the occurrence index, appended only for occurrence >= 1. */
function occurrenceSuffix(occurrence: TouchKeyOccurrence): string {
  return occurrence === undefined || occurrence <= 0 ? "" : `#${occurrence}`;
}

/**
 * Build the stable address for a main key.
 *
 * `occurrence` disambiguates a key id that repeats within its layer — see
 * this module's "Duplicate ids" section. Omit it (or pass 0) for the first,
 * which is the overwhelming majority of keys and yields the unsuffixed address.
 */
export function touchKeyAddress(
  platform: string,
  layerId: string,
  keyId: string,
  occurrence?: TouchKeyOccurrence,
): string {
  return `${platform}:${layerId}:${keyId}${occurrenceSuffix(occurrence)}`;
}

/** Build the stable address for an `sk[]` (longpress) or `multitap[]` sub-entry. */
export function touchSubKeyAddress(
  platform: string,
  layerId: string,
  keyId: string,
  kind: "sk" | "multitap",
  subId: string,
  occurrence?: TouchKeyOccurrence,
): string {
  return `${touchKeyAddress(platform, layerId, keyId, occurrence)}:${kind}:${subId}`;
}

/** Build the stable address for a `flick{}` directional gesture entry. */
export function touchFlickAddress(
  platform: string,
  layerId: string,
  keyId: string,
  direction: string,
  occurrence?: TouchKeyOccurrence,
): string {
  return `${touchKeyAddress(platform, layerId, keyId, occurrence)}:flick:${direction}`;
}

/**
 * A per-layer counter that answers "which occurrence of this key id is this?"
 * — call it once per key, in the layer's row-major order, and it returns 0 for
 * the first key with that id, 1 for the next, and so on.
 *
 * Every walker that builds addresses for a layer's keys uses this rather than
 * keeping its own tally. There are a dozen such walkers (the grid's view model,
 * the diagnostics detectors, the nodeIds index, the collateral scan, …), and an
 * occurrence is only meaningful if all of them count it the same way — a walker
 * that counted per ROW, or that skipped non-interactive keys, would hand out
 * addresses {@link resolveKeyAddress} could not find.
 *
 * Create a fresh counter per (platform, layer): occurrences are scoped to the
 * layer, exactly as the address is.
 */
export function createKeyOccurrenceCounter(): (keyId: string) => number {
  const seen = new Map<string, number>();
  return (keyId: string): number => {
    const n = seen.get(keyId) ?? 0;
    seen.set(keyId, n + 1);
    return n;
  };
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
  /**
   * Which key with `keyId` the address names, counted row-major within the
   * layer from 0. Absent when the address carried no `#<n>` suffix, which means
   * the first — so a consumer that ignores this field entirely behaves exactly
   * as it did before occurrences existed.
   */
  occurrence?: number;
  sub?: { kind: "sk" | "multitap" | "flick"; id: string };
}

const SUB_KINDS = new Set(["sk", "multitap", "flick"]);

/**
 * A trailing `#<n>` occurrence marker: at least one digit, no leading zero
 * (the builder never writes `#0` — occurrence 0 is the bare address), and at
 * least one character of key id in front of it.
 */
const OCCURRENCE_RE = /^(.+)#([1-9][0-9]*)$/;

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
  let keyId = keyFields.join(":");
  if (platform.length === 0 || layerId.length === 0 || keyId.length === 0) return undefined;

  // The occurrence suffix is stripped AFTER the sub-entry suffix, so
  // `phone:default:T_BLANK#3:sk:U_00E1` reads as "the fourth T_BLANK's
  // longpress U_00E1" — the occurrence qualifies the KEY, and the sub-entry
  // hangs off the key it qualifies.
  let occurrence: number | undefined;
  const occurrenceMatch = OCCURRENCE_RE.exec(keyId);
  if (occurrenceMatch) {
    keyId = occurrenceMatch[1]!;
    occurrence = Number(occurrenceMatch[2]!);
  }

  return {
    platform,
    layerId,
    keyId,
    ...(occurrence !== undefined ? { occurrence } : {}),
    ...(sub ? { sub } : {}),
  };
}

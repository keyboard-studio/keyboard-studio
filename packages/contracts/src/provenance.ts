// see spec.md section 8 step 3 (Phase A intake) / section 12 (output — PR body
// + package metadata) — KeyboardProvenance data type
//
// Background: the legacy manual "Keyman Keyboard Request Form" gathered a block
// of intake metadata — who is requesting the keyboard, the sociolinguistic
// context of the language, and who to contact in the community — that has no
// home in the authoring flow proper. The survey (§8) computes the discovery
// axes and fills pattern slots; none of those questions shape the `.kmn`, so
// they were never modeled. KeyboardProvenance is that typed home.
//
// Contract: every field is OPTIONAL and the whole object is NON-GATING. The
// studio MUST NOT block a phase exit or the submit button on any provenance
// field (contrast the gating Layer-A/Layer-C criteria, §10). Provenance is
// serialized into the GitHub PR body and the package metadata at output time
// (§12) for attribution and contact; it is NOT written into the `.kmn` source.

/**
 * Contact details for a representative of the language community, captured
 * from the request form's "Contact Information for a Language Community
 * Representative" field. All sub-fields optional; the object is omitted
 * entirely when the requester provided nothing.
 *
 * @see spec.md §8 step 3
 */
export interface CommunityRepresentative {
  /** Representative's name. */
  name?: string;
  /** Role in the community (e.g. "language committee chair"). */
  role?: string;
  /** Contact email. */
  email?: string;
}

/**
 * Identity of the person requesting the keyboard and their relationship to the
 * language community (request form §2). Distinct from the *copyright holder*
 * captured in Phase A identity, which is build-relevant and propagated into
 * `LICENSE.md` / `.kmn` / `.kps`; the requester is attribution/contact metadata
 * only.
 *
 * @see spec.md §8 step 3
 */
export interface RequesterInfo {
  /** Requester's full name. */
  name?: string;
  /** Email or other contact information. */
  contact?: string;
  /** Affiliation / organization. */
  affiliation?: string;
  /** Relationship to the language community (e.g. "mother-tongue speaker"). */
  relationToCommunity?: string;
}

/**
 * Optional, non-gating intake / provenance metadata for a keyboard request.
 *
 * Folds the legacy request form's §1 (language sociolinguistics), §2
 * (requester identity), and the §4 reference fields (orthography link, existing
 * tools, community involvement, notes) into a single typed bag. Persisted to
 * the PR body / package metadata at output (§12), never into the `.kmn`.
 *
 * `localizedName` is the one field here that MAY influence build artifacts: it
 * can seed the language autonym shown in `.kps` / `welcome.htm`. It lives on
 * provenance (rather than a Phase A identity type) only because Phase A
 * identity is currently modeled as untyped {@link SurveyAnswer}s — there is no
 * typed identity object to attach it to. Treat it as build-relevant even so.
 *
 * @see spec.md §8 step 3 (Phase A intake)
 * @see spec.md §12 (output — PR body + package metadata)
 */
export interface KeyboardProvenance {
  /** Requester identity + relationship to the community (request form §2). */
  requester?: RequesterInfo;
  /** Language community representative contact (request form §1). */
  communityRep?: CommunityRepresentative;
  /**
   * Localized language name / autonym (request form §1 "Localized Name").
   * MAY feed the `.kps` / `welcome.htm` display name — build-relevant.
   */
  localizedName?: string;
  /**
   * Approximate number of speakers, as free text so ranges and qualifiers
   * survive (e.g. "~12,000", "fewer than 500"). Request form §1.
   */
  speakerCount?: string;
  /** Free-text description of the regions where the language is spoken. */
  regions?: string;
  /**
   * Language vitality, best-guess. Typically an EGIDS level (0–10 with 6a/6b,
   * 8a/8b sub-levels). Free text / label rather than a closed union — the
   * value is informational and the scale is contested. Request form §1.
   */
  languageStatus?: string;
  /**
   * Existing text-entry tools the community already uses (request form §4
   * "Existing Writing Tools").
   */
  existingTools?: string;
  /**
   * Link to an orthography description for the language (request form §4).
   * Recorded here as a reference; the orthography is also a primary character-
   * discovery signal in Phase B, where the linguist agent
   * ({@link CharacterDiscoveryService.synthesizeInventory}) synthesizes the
   * inventory from CLDR + orthography references — often the single most reliable
   * source for the needed characters.
   */
  orthographyUrl?: string;
  /**
   * How the community should be involved in testing/validating the keyboard
   * (request form §4 "Community Involvement").
   */
  communityInvolvement?: string;
  /**
   * Free-text casing rules supplied by the requester (request form §4). The
   * `&CasedKeys` store itself is derived automatically per Three-group routing
   * and §14 Decision 2; this note is captured for the reviewer when the casing
   * behavior is non-default.
   */
  casingNotes?: string;
  /** Any other considerations the requester flagged (request form §4). */
  additionalNotes?: string;
  /**
   * Pointer/reference to a text sample the requester pasted for Phase B
   * character discovery (§8 step 4) — one of several discovery methods, not the
   * only one (see {@link CharacterDiscoveryService}). The sample seeds the
   * character inventory; word prediction / wordlists remain out of scope (§16).
   * Stored as a reference (e.g. a filename in the virtual FS) rather than the
   * full corpus.
   *
   * @see CharacterDiscoveryService
   */
  textSampleRef?: string;
}

/**
 * Input shape for {@link makeKeyboardProvenance}. Identical to
 * {@link KeyboardProvenance} — every field is already optional — but named
 * separately to match the `XInit` factory convention used across the package
 * (see {@link BaseKeyboardInit}).
 */
export type KeyboardProvenanceInit = KeyboardProvenance;

/**
 * Drop keys whose value is `undefined` so the result satisfies
 * `exactOptionalPropertyTypes` (an explicit `key: undefined` is not assignable
 * to an optional field; an absent key is). Mirrors the conditional-spread
 * stripping in {@link makeBaseKeyboard}, generalized because provenance has
 * many more optional fields.
 */
function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

/**
 * Construct a {@link KeyboardProvenance} from a {@link KeyboardProvenanceInit},
 * stripping undefined-valued keys at the top level and within the two nested
 * objects (`requester`, `communityRep`) so the result is clean under
 * `exactOptionalPropertyTypes`.
 *
 * An empty input yields an empty object — provenance is non-gating, so "the
 * requester supplied nothing" is a valid state.
 *
 * @see spec.md §8 step 3
 * @see spec.md §12
 */
export function makeKeyboardProvenance(
  init: KeyboardProvenanceInit
): KeyboardProvenance {
  return stripUndefined({
    ...init,
    ...(init.requester !== undefined
      ? { requester: stripUndefined(init.requester) }
      : {}),
    ...(init.communityRep !== undefined
      ? { communityRep: stripUndefined(init.communityRep) }
      : {}),
  });
}

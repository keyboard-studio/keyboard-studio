/**
 * Slug-ifier and validator for Keyman keyboard identifiers.
 *
 * slugifyKeyboardId converts free-text display names into candidate keyboardIds
 * following the keymanapp/keyboards naming convention.
 *
 * validateKeyboardId checks a candidate id against the same convention and
 * returns a structured result (valid flag + optional reason string).
 */

/**
 * Convert a free-text display name to a candidate Keyman keyboardId.
 *
 * Algorithm:
 *   1. Unicode NFD normalize, then strip combining marks.
 *   2. Lowercase.
 *   3. Replace any character that is NOT [a-z0-9] with `_`.
 *   4. Collapse runs of `_` to a single `_`.
 *   5. Strip leading non-[a-z] characters, including underscores (result starts with a letter).
 *      validateKeyboardId permits a leading underscore (matching KD), but slugifyKeyboardId
 *      never produces one — the slug-ifier and the validator are intentionally asymmetric.
 *   6. Strip trailing `_`.
 *   7. Truncate to 40 characters.
 *   8. Return `""` if the result is empty.
 */
export function slugifyKeyboardId(displayName: string): string {
  if (displayName.length === 0) return "";

  // Step 1: NFD normalize then strip combining marks (Unicode property M).
  let s = displayName.normalize("NFD").replace(/\p{M}/gu, "");

  // Step 2: Lowercase.
  s = s.toLowerCase();

  // Step 3: Replace any character that is NOT [a-z0-9] with `_`.
  s = s.replace(/[^a-z0-9]/g, "_");

  // Step 4: Collapse runs of `_` to a single `_`.
  s = s.replace(/_+/g, "_");

  // Step 5: Strip leading non-[a-z] characters (including underscores).
  // Note: validateKeyboardId (aligned with KD) allows a leading underscore,
  // but slugifyKeyboardId intentionally does NOT produce one — free-text
  // input that starts with underscores after normalization should yield a
  // letter-initial slug. The validator and the slug-ifier are not symmetric.
  s = s.replace(/^[^a-z]+/, "");

  // Step 6: Strip trailing `_`.
  s = s.replace(/_+$/, "");

  // Step 7: Truncate to 40 characters.
  s = s.slice(0, 40);

  // Step 8: If empty, return "".
  return s;
}

/** Result returned by {@link validateKeyboardId}. */
export interface KeyboardIdValidation {
  valid: boolean;
  /** Undefined when valid; otherwise a short human-readable reason. */
  reason?: string;
}

// Canonical reference: ../keyman/developer/src/common/web/utils/src/valid-ids.ts line 13
// KD regex: /^[a-z_][a-z0-9_]*$/  (no length cap upstream; we add a 254-char local limit)
const KEYBOARD_ID_RE = /^[a-z_][a-z0-9_]{0,253}$/;

/**
 * Validate a candidate keyboard id against keymanapp/keyboards convention.
 *
 * Rules:
 *   - Must match `/^[a-z_][a-z0-9_]{0,253}$/` (aligned with KD `isValidKeymanKeyboardId`).
 *   - Maximum 254 characters (local limit; KD has no explicit cap).
 *
 * Naming conventions (e.g. avoiding the substring "keyboard") are documented in
 * docs/criteria.md but are NOT enforced here — they are advisory, not structural.
 *
 * Returns `{ valid: true }` on success; otherwise `{ valid: false, reason: "..." }`.
 */
export function validateKeyboardId(id: string): KeyboardIdValidation {
  if (id.length === 0) {
    return { valid: false, reason: "must start with a lowercase letter or underscore" };
  }

  if (id.length > 254) {
    return { valid: false, reason: "must be 254 characters or fewer" };
  }

  if (!KEYBOARD_ID_RE.test(id)) {
    if (!/^[a-z_]/.test(id)) {
      return { valid: false, reason: "must start with a lowercase letter or underscore" };
    }
    return { valid: false, reason: "contains invalid characters (only a-z, 0-9, and _ are allowed)" };
  }

  return { valid: true };
}

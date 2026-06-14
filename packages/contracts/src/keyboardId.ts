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
 *   5. Strip leading non-[a-z] characters (result starts with a letter).
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

  // Step 5: Strip leading non-[a-z] characters.
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

/**
 * Validate a candidate keyboard id against keymanapp/keyboards convention.
 *
 * Rules:
 *   - Must match `/^[a-z][a-z0-9_]{0,253}$/`.
 *   - Must NOT contain the substring `keyboard`
 *     (per docs/criteria.md line 18).
 *
 * Returns `{ valid: true }` when both pass; otherwise `{ valid: false, reason: "..." }`.
 */
export function validateKeyboardId(id: string): KeyboardIdValidation {
  if (id.length === 0) {
    return { valid: false, reason: "must start with a lowercase letter" };
  }

  if (!/^[a-z]/.test(id)) {
    return { valid: false, reason: "must start with a lowercase letter" };
  }

  if (!/^[a-z][a-z0-9_]{0,253}$/.test(id)) {
    if (id.length > 254) {
      return { valid: false, reason: "must be 254 characters or fewer" };
    }
    return { valid: false, reason: "contains invalid characters (only a-z, 0-9, and _ are allowed)" };
  }

  if (id.includes("keyboard")) {
    return { valid: false, reason: "must not contain the word 'keyboard'" };
  }

  return { valid: true };
}

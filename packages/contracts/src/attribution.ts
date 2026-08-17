// Attribution captured during authoring (spec 064, data-model.md).

/**
 * Who made a keyboard and who holds its copyright.
 *
 * Captured once per keyboard and held on the working copy, so it persists via
 * the existing localStorage draft (spec 034 US3) with no new storage. This is
 * the SINGLE source feeding LICENSE.md, IRHeader.copyright, and the .kps
 * <Copyright>/<Author> fields (FR-003) — 22 shipped keyboards disagree between
 * their LICENSE.md and .kmn precisely because those were written independently.
 */
export interface Attribution {
  /**
   * Person or group who made the keyboard.
   *
   * Pre-filled from the authenticated GitHub profile's `name` (D7). NEVER the
   * bare `login` handle — a handle is not a copyright holder. When the profile
   * has no name set, ask rather than substitute one.
   */
  authorName: string;

  /**
   * Optional contact. Absent when the GitHub profile email is private, which
   * must never block emission. Lands in `.kps <Author URL="mailto:…">`, and
   * pre-fills the Phase F contact question via SurveyContext (FR-016).
   */
  authorEmail?: string;

  /**
   * Free-text copyright holder (D1), defaulting to `authorName` when blank.
   *
   * One field rather than a structured joint-ownership model, because the corpus
   * expresses joint holders as prose inside a single line — e.g. "Galaxie
   * Software and SIL Global", "FirstVoices, SIL International, First Peoples'
   * Cultural Foundation". No shipped keyboard uses two copyright lines.
   */
  copyrightHolder: string;
}

/**
 * The holder string to attribute a keyboard to: the explicit holder when given,
 * otherwise the author. Pure.
 */
export function effectiveHolder(a: Attribution): string {
  const holder = a.copyrightHolder.trim();
  return holder !== "" ? holder : a.authorName.trim();
}

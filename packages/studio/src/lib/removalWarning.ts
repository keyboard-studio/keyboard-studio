// removalWarning — the pure model of the "this letter is needed" warning shown
// when an author removes a character a listed language needs (spec 114 FR-006).
//
// The needed-letter map (character to languages) comes from
// `neededLettersByLanguage`; this module only looks characters up in it, so
// Copy and Open share one answer. Lookup is NFC on both sides: a composed and a
// decomposed form are the same character. The warning never blocks: dismissing
// it keeps the removal, and dismissal lasts for the session (the caller owns
// the dismissed set; nothing is persisted).

export interface RemovalWarning {
  /** The needed character, NFC. */
  readonly char: string;
  /** Every listed language that needs it, in list order. */
  readonly languages: readonly string[];
}

/** Warnings for the removed characters a listed language needs, one per distinct NFC character, in removal order. */
export function warningsForRemoval(
  removed: readonly string[],
  needed: ReadonlyMap<string, readonly string[]>,
): RemovalWarning[] {
  const out: RemovalWarning[] = [];
  const seen = new Set<string>();
  for (const raw of removed) {
    const char = raw.normalize("NFC");
    if (seen.has(char)) continue;
    seen.add(char);
    const languages = needed.get(char);
    if (languages !== undefined && languages.length > 0) out.push({ char, languages });
  }
  return out;
}

/** The dismissed set after dismissing `char` (the input set is not mutated). */
export function dismissRemovalWarning(
  dismissed: ReadonlySet<string>,
  char: string,
): Set<string> {
  return new Set([...dismissed, char.normalize("NFC")]);
}

/** The warnings the author has not dismissed. */
export function activeRemovalWarnings(
  warnings: readonly RemovalWarning[],
  dismissed: ReadonlySet<string>,
): RemovalWarning[] {
  return warnings.filter((w) => !dismissed.has(w.char));
}

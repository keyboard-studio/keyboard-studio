// fold — accent-stripping fold for comparing language/dialect names.
//
// NFD, strip combining marks, lowercase, trim: "Gascón" folds to "gascon",
// so a typed or matched dialect name links to its registered variant or
// tagset regardless of accents (spec 115 US2). Deliberately NOT
// normalizeForCompare (NFC + lowercase, which keeps accents): dialect
// names are matched across spellings, not just across normal forms.
//
// A leaf (no imports) so both the language chooser — which statically
// imports @ethnolib/find-language and must stay behind the lazy boundary
// (spec 115 FR-037) — and the dialect proposal (imported by the entry
// chunk's QuestionField) can share the one definition.
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

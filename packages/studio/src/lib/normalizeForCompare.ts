// Shared comparison normalizer for user-facing language names / autonyms
// (spec 030, #1059 item 1). Several survey sites independently compared
// typed/seeded strings via `trim → normalize("NFC") → toLowerCase()` so
// NFC/NFD variants of the same name (e.g. Vietnamese, Yorùbá/Akan, Ainu
// diacritics) still match; this centralizes that expression.
//
// Not full Unicode case-folding (e.g. Turkish dotless-i) — that is a
// deliberately deferred decision, tracked separately (#1059 item 2). Do not
// extend this helper to case-fold without revisiting that decision.
export function normalizeForCompare(s: string): string {
  return s.trim().normalize("NFC").toLowerCase();
}

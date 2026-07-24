// Three-store confirmed-alphabet model + the marks-series placement worklist
// (specs/046-marks-question-series). The three stores are canonical; the legacy
// flat `confirmedInventory: string[]` is a projection derived via
// {@link deriveConfirmedInventory}, never independently edited.
//
// All types here are additive contract surface (no locked-type edits): they are
// carried as optional fields on SurveyPhaseResult / SurveySession and mirrored
// by zod schemas in schemas.ts (compile-time drift guards).

/**
 * Designer-supplied classification for a private-use-area character, for which
 * no linguistic decomposition data exists. Permanent and designer-owned:
 * classifiers read it first and fall back to Unicode properties only when
 * absent — it is never re-derived from any other data source.
 */
export type DeclaredRole = "letter" | "mark";

/**
 * One attested base+marks combination, exactly as confirmed present in the
 * language's orthography. Order-preserving: `marks` lists marks closest to the
 * base first, so the same two marks in the other order are a distinct stack.
 */
export interface AttestedStack {
  /** Exactly one base letter (NFC grapheme). */
  base: string;
  /** One or more marks (lone combining characters), order preserved (closest to base first). */
  marks: string[];
}

/**
 * The three-store replacement for the flat confirmed inventory. Held per phase
 * result and merged onto the session; every attachment, mental-model, and
 * output-form proposal downstream is derived from `attestedStacks`, never
 * invented independently of it.
 */
export interface ConfirmedAlphabet {
  /** Base letters (NFC, single grapheme each). Deduped, first-appearance order. */
  bases: string[];
  /** Marks as lone combining characters (rendered on U+25CC carriers in UI). Deduped. */
  marks: string[];
  /** Every attested base+marks combination, order-preserving. */
  attestedStacks: AttestedStack[];
  /** PUA-only designer classifications, keyed by character. */
  declaredRoles: Record<string, DeclaredRole>;
}

/**
 * Per-base state of a mark's attachment decision: observed in the confirmed
 * alphabet, proposed by mark-class heuristics and accepted by the designer,
 * or blocked (the default for everything else — a blocked combination must
 * never be reachable by ordinary typing on the produced keyboard).
 */
export type AttachmentState = "attested" | "plausible-accepted" | "blocked";

/** A productive mark needing its own key placement, with its confirmed attach behavior. */
export interface MarkUnit {
  mark: string;
  /** Whether the mark's key is pressed before ("prefix") or after ("postfix") the base letter's key. */
  inputOrder: "prefix" | "postfix";
}

/** A base+mark pair that must never be reachable by ordinary typing. */
export interface BlockedCombination {
  base: string;
  mark: string;
}

/**
 * The S4 whole-keyboard output-form decision (spec 046, FR-013..FR-016):
 * ready-made single (precomposed) characters vs base-plus-mark sequences.
 * Canonical home for the union — the engine's `output-form-policy.ts` (which
 * owns the decision LOGIC, not the type) re-exports this rather than
 * declaring a divergent copy, since engine depends on contracts and contracts
 * cannot depend on engine.
 */
export type OutputForm = "ready-made" | "base-plus-mark";

/**
 * The classification the marks series hands the mechanism gallery: every
 * relevant unit in exactly one group. Empty on a skipped series (no marks).
 */
export interface PlacementWorklist {
  /** Whole units (letters, incl. accented letters treated as their own letter) needing a key placement. */
  ownLetterUnits: string[];
  /** Productive mark keys needing placement, each with its input-order behavior. */
  markUnits: MarkUnit[];
  /** Combinations that must be unreachable by ordinary typing. */
  blockedCombinations: BlockedCombination[];
}

/** Factory: an empty three-store alphabet. */
export function makeConfirmedAlphabet(init?: Partial<ConfirmedAlphabet>): ConfirmedAlphabet {
  return {
    bases: init?.bases ?? [],
    marks: init?.marks ?? [],
    attestedStacks: init?.attestedStacks ?? [],
    declaredRoles: init?.declaredRoles ?? {},
  };
}

/** Factory: the empty worklist a skipped series hands the mechanism gallery. */
export function makeEmptyPlacementWorklist(): PlacementWorklist {
  return { ownLetterUnits: [], markUnits: [], blockedCombinations: [] };
}

/**
 * Derive the legacy flat inventory from the three stores: each base, each
 * attested stack composed to its NFC grapheme, and each mark's lone combining
 * character — NFC-normalised, deduped, first-appearance order (bases first,
 * then stacks, then lone marks). This is the projection every pre-046 consumer
 * of `confirmedInventory` keeps reading; it is never edited independently.
 */
export function deriveConfirmedInventory(alphabet: ConfirmedAlphabet): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string): void => {
    const g = raw.normalize("NFC").trim();
    if (g.length > 0 && !seen.has(g)) {
      seen.add(g);
      out.push(g);
    }
  };
  for (const base of alphabet.bases) push(base);
  for (const stack of alphabet.attestedStacks) push(stack.base + stack.marks.join(""));
  for (const mark of alphabet.marks) push(mark);
  return out;
}

/**
 * Structural validity of a three-store alphabet (data-model rules): every
 * stack's base appears in `bases`, every stack mark appears in `marks`, stacks
 * carry at least one mark, and a PUA character never sits in `bases`/`marks`
 * without a `declaredRoles` entry. Returns human-readable problems; empty
 * array = valid.
 */
export function validateConfirmedAlphabet(alphabet: ConfirmedAlphabet): string[] {
  const problems: string[] = [];
  const bases = new Set(alphabet.bases);
  const marks = new Set(alphabet.marks);
  for (const stack of alphabet.attestedStacks) {
    if (!bases.has(stack.base)) {
      problems.push(`attested stack base ${describeChar(stack.base)} is not in bases`);
    }
    if (stack.marks.length === 0) {
      problems.push(`attested stack on ${describeChar(stack.base)} has no marks`);
    }
    for (const mark of stack.marks) {
      if (!marks.has(mark)) {
        problems.push(
          `attested stack mark ${describeChar(mark)} (on ${describeChar(stack.base)}) is not in marks`,
        );
      }
    }
  }
  for (const ch of [...alphabet.bases, ...alphabet.marks]) {
    if (isPrivateUseChar(ch) && alphabet.declaredRoles[ch] === undefined) {
      problems.push(`private-use character ${describeChar(ch)} has no declared role`);
    }
  }
  return problems;
}

function describeChar(ch: string): string {
  const cp = ch.codePointAt(0);
  const hex = cp === undefined ? "????" : cp.toString(16).toUpperCase().padStart(4, "0");
  return `"${ch}" (U+${hex})`;
}

// Deliberately mirrors engine's characterMap.ts isCombiningMarkChar's PUA
// sibling (isPrivateUseCodePoint) rather than importing it: contracts is the
// dependency root and cannot depend on engine. Keep the two ranges in sync by
// hand if either changes.
function isPrivateUseChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd)
  );
}

/**
 * The subset of a session's flat `confirmedInventory` that did NOT come from
 * the three-store alphabet projection — i.e. entries contributed by some
 * other survey phase, unrelated to `bases`/`marks`/`attestedStacks`. Carve's
 * needed-set derivation (`deriveCarveNeededSet`, engine's `carve-needed-set`)
 * replaces only the alphabet-derived slice of `confirmedInventory` with its
 * refined tiered classification, so this "everything else" complement must
 * be re-unioned back in — this is that subtraction, factored out so it
 * doesn't rely on call sites reproducing `mergePhaseResults`' invariant that
 * `confirmedInventory` always contains the alphabet's projection.
 */
export function nonAlphabetConfirmedInventory(
  confirmedInventory: readonly string[],
  alphabet: ConfirmedAlphabet | undefined,
): Set<string> {
  const confirmedSet = new Set(confirmedInventory.map((ch) => ch.normalize("NFC")));
  const alphabetProjection = new Set(deriveConfirmedInventory(alphabet ?? makeConfirmedAlphabet()));
  return new Set([...confirmedSet].filter((ch) => !alphabetProjection.has(ch)));
}

/**
 * Canonical, deterministic content key for a confirmed alphabet — used by
 * consumers (e.g. the studio's MarksSeriesStep) that need to detect a
 * genuine content change without depending on object identity or property
 * insertion order (`JSON.stringify` is not a safe key: object key order is
 * not guaranteed equal across equivalent construction paths). Field-ordered:
 * bases, then marks, then attested stacks (base+marks joined), then
 * `declaredRoles` entries sorted by character.
 */
export function confirmedAlphabetKey(alphabet: ConfirmedAlphabet | undefined): string {
  if (alphabet === undefined) return "";
  const bases = alphabet.bases.join(",");
  const marks = alphabet.marks.join(",");
  const stacks = alphabet.attestedStacks.map((s) => `${s.base}:${s.marks.join("")}`).join(",");
  const roles = Object.entries(alphabet.declaredRoles)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([ch, role]) => `${ch}=${role}`)
    .join(",");
  return `${bases}|${marks}|${stacks}|${roles}`;
}

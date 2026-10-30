// deadkeyPurpose — one deadkey per purpose for S-02 gallery placements.
//
// A deadkey stands for one thing it adds to a base letter, the way
// basic_kbdusx has one deadkey per accent (` grave, ~ tilde, ^ circumflex,
// ' acute, " diaeresis). The gallery used to mint a fresh deadkey for every
// character it placed, all on the default trigger, so ǎ/ě/ɛ each got their
// own `+ [K_COLON] > dk(...)` and only the first could ever fire.
//
// The purpose of a character is the combining-mark sequence of its NFD form
// (ǎ, ě → U+030C caron). A character with no marks (ɛ, Ɔ) is a letter
// variant; variants share one "variant" deadkey of their own. Placements with
// the same purpose reuse one deadkey (same trigger, same id), which
// applyAssignments merges into a single bases/output store pair. A new
// purpose gets the next trigger key not already used by another deadkey, so
// every deadkey keeps a reachable trigger.

import type { KeyboardIR, MechanismAssignment } from "@keyboard-studio/contracts";
import { listDeadkeys } from "@keyboard-studio/contracts";
import { DEADKEY_OPTIONS } from "../deadkey/deadkeyTriggerOptions.ts";
import { PATTERN_DEADKEY, PATTERN_SWAP } from "./patternIds.ts";

/** Purpose key for characters with no combining mark (ɛ, Ɔ, ŋ …). */
export const VARIANT_PURPOSE = "variant";

const COMBINING_MARK = /\p{M}/u;

/**
 * The purpose a deadkey would serve for `ch`: its NFD combining marks joined
 * (e.g. "̌" for ǎ), or {@link VARIANT_PURPOSE} when it has none.
 */
export function deadkeyPurposeOf(ch: string): string {
  const marks = [...ch.normalize("NFD")].filter((c) => COMBINING_MARK.test(c));
  return marks.length > 0 ? marks.join("") : VARIANT_PURPOSE;
}

/** One S-02 deadkey as minted by this session's gallery placements. */
export interface SessionDeadkey {
  triggerKey: string;
  deadkeyName: string;
  accentChar: string;
  /** Purposes of every output this deadkey already produces. */
  purposes: Set<string>;
  /** Base letter → output already mapped on this deadkey. */
  outputsByBase: Map<string, string>;
}

/**
 * This session's S-02 deadkeys, keyed by trigger key. When more than one id
 * sits on a trigger (pre-fix sessions), the first-minted one is the reachable
 * one and is the one reported. Assignments targeting `excludeTarget` are
 * skipped so re-applying a character never clashes with itself.
 */
export function sessionDeadkeys(
  sessionAssignments: readonly MechanismAssignment[],
  excludeTarget?: string,
): Map<string, SessionDeadkey> {
  const byTrigger = new Map<string, SessionDeadkey>();
  for (const a of sessionAssignments) {
    if (excludeTarget !== undefined && a.target === excludeTarget) continue;
    for (const m of a.mechanisms) {
      if (m.patternId !== PATTERN_DEADKEY) continue;
      const sv = m.slotValues ?? {};
      const triggerKey = sv["triggerKey"];
      const deadkeyName = sv["deadkeyName"];
      if (typeof triggerKey !== "string" || typeof deadkeyName !== "string") continue;
      let dk = byTrigger.get(triggerKey);
      if (dk === undefined) {
        dk = {
          triggerKey,
          deadkeyName,
          accentChar: typeof sv["accentChar"] === "string" ? sv["accentChar"] : "",
          purposes: new Set(),
          outputsByBase: new Map(),
        };
        byTrigger.set(triggerKey, dk);
      } else if (dk.deadkeyName !== deadkeyName) {
        continue;
      }
      const bases = [...(typeof sv["baseLetters"] === "string" ? sv["baseLetters"] : "")];
      const outputs = [...(typeof sv["accentedForms"] === "string" ? sv["accentedForms"] : "")];
      bases.forEach((b, i) => {
        const out = outputs[i];
        if (out === undefined) return;
        if (!dk.outputsByBase.has(b)) dk.outputsByBase.set(b, out);
        dk.purposes.add(deadkeyPurposeOf(out));
      });
    }
  }
  return byTrigger;
}

/**
 * The output `triggerKey`'s session deadkey already produces for `baseLetter`,
 * when it is not `currentChar` — i.e. placing `currentChar` there would be
 * unreachable. `null` when there is no clash.
 */
export function s02BaseClash(params: {
  triggerKey: string;
  baseLetter: string;
  currentChar: string;
  sessionAssignments: readonly MechanismAssignment[];
}): string | null {
  const { triggerKey, baseLetter, currentChar, sessionAssignments } = params;
  const dk = sessionDeadkeys(sessionAssignments, currentChar).get(triggerKey);
  const existing = dk?.outputsByBase.get(baseLetter);
  return existing !== undefined && existing !== currentChar ? existing : null;
}

const BARE_KEY_RULE = /\+\s*\[(K_[A-Z0-9_]+)\]/g;

/** Unmodified keys that this session's S-01 key assignments write rules for. */
function sessionReassignedBareKeys(
  sessionAssignments: readonly MechanismAssignment[],
): Set<string> {
  const keys = new Set<string>();
  for (const a of sessionAssignments) {
    for (const m of a.mechanisms) {
      if (m.patternId !== PATTERN_SWAP) continue;
      const rules = m.slotValues?.["kmnRules"];
      if (typeof rules !== "string") continue;
      for (const match of rules.matchAll(BARE_KEY_RULE)) keys.add(match[1]!);
    }
  }
  return keys;
}

/**
 * The trigger key to propose for placing `currentChar` (typed as
 * `baseLetter` after the trigger) with a deadkey:
 *   1. the session deadkey already serving the same purpose, if `baseLetter`
 *      is free on it;
 *   2. otherwise the first suggested trigger no deadkey uses yet (session or
 *      starting keyboard) and no session key assignment has reassigned;
 *   3. otherwise any session deadkey with `baseLetter` free (one deadkey can
 *      carry a second purpose when bases don't collide — ç rides the acute
 *      deadkey on US-International);
 *   4. otherwise the first suggested trigger (the author must pick a key).
 */
export function proposeS02TriggerKey(params: {
  currentChar: string;
  baseLetter: string;
  sessionAssignments: readonly MechanismAssignment[];
  workingIr: KeyboardIR | null;
}): string {
  const { currentChar, baseLetter, sessionAssignments, workingIr } = params;
  const purpose = deadkeyPurposeOf(currentChar);
  const dks = [...sessionDeadkeys(sessionAssignments, currentChar).values()];
  const baseFree = (dk: SessionDeadkey) => !dk.outputsByBase.has(baseLetter);

  const samePurpose = dks.find((dk) => dk.purposes.has(purpose) && baseFree(dk));
  if (samePurpose !== undefined) return samePurpose.triggerKey;

  const used = new Set(dks.map((dk) => dk.triggerKey));
  // A bare key this session already reassigned (e.g. `[` → “) is not free: a
  // trigger rule on it would shadow that character.
  for (const key of sessionReassignedBareKeys(sessionAssignments)) used.add(key);
  if (workingIr !== null) {
    for (const d of listDeadkeys(workingIr)) {
      if (d.triggerKey !== null) used.add(d.triggerKey);
    }
  }
  const free = DEADKEY_OPTIONS.find((o) => !used.has(o.value));
  if (free !== undefined) return free.value;

  const shareable = dks.find(baseFree);
  if (shareable !== undefined) return shareable.triggerKey;

  return DEADKEY_OPTIONS[0].value;
}

// ---------------------------------------------------------------------------
// Trigger escapes — how the trigger key's own character stays typeable once a
// deadkey takes the key (sil_cameroon_qwerty's ; deadkey offers all three).
// Recorded on the deadkey's FIRST placement as the `escapes` slot (space-
// separated tokens); applyAssignments drops the double-tap / space rule when
// its token is absent and adds `+ [RALT trigger] > char` for "altgr". The
// next deadkey proposes the most recent choice.
// ---------------------------------------------------------------------------

export type DeadkeyEscape = "double-tap" | "space" | "altgr";

/** Display order, and the default before any deadkey has recorded a choice. */
export const DEADKEY_ESCAPES: readonly DeadkeyEscape[] = ["double-tap", "space", "altgr"];

export function parseDeadkeyEscapes(value: string): Set<DeadkeyEscape> {
  const tokens = new Set(value.split(/\s+/));
  return new Set(DEADKEY_ESCAPES.filter((e) => tokens.has(e)));
}

export function formatDeadkeyEscapes(escapes: ReadonlySet<DeadkeyEscape>): string {
  return DEADKEY_ESCAPES.filter((e) => escapes.has(e)).join(" ");
}

/** The `escapes` value recorded for deadkey `deadkeyName`, if any placement recorded one. */
export function recordedDeadkeyEscapes(
  sessionAssignments: readonly MechanismAssignment[],
  deadkeyName: string,
): Set<DeadkeyEscape> | null {
  for (const a of sessionAssignments) {
    for (const m of a.mechanisms) {
      const sv = m.slotValues ?? {};
      if (m.patternId === PATTERN_DEADKEY && sv["deadkeyName"] === deadkeyName && typeof sv["escapes"] === "string") {
        return parseDeadkeyEscapes(sv["escapes"]);
      }
    }
  }
  return null;
}

/**
 * The escapes to propose for a new deadkey: the most recently recorded
 * choice in this session, else all three.
 */
export function rememberedDeadkeyEscapes(
  sessionAssignments: readonly MechanismAssignment[],
): Set<DeadkeyEscape> {
  for (let i = sessionAssignments.length - 1; i >= 0; i--) {
    for (const m of sessionAssignments[i]!.mechanisms) {
      const escapes = m.slotValues?.["escapes"];
      if (m.patternId === PATTERN_DEADKEY && typeof escapes === "string") {
        return parseDeadkeyEscapes(escapes);
      }
    }
  }
  return new Set(DEADKEY_ESCAPES);
}

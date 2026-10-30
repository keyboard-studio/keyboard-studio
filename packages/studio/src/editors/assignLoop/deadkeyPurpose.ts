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
import { allocateDeadkeyId, listDeadkeys } from "@keyboard-studio/contracts";
import { DEADKEY_OPTIONS } from "../deadkey/deadkeyTriggerOptions.ts";
import { PATTERN_SWAP, deadkeyPairsOfSlots, isDeadkeyPatternId } from "./patternIds.ts";
import { TRIGGER_KEY_CHARS } from "../deadkey/deadkeyTriggerOptions.ts";
import { hex4 } from "../deadkey/deadkeyWrite.ts";
import { resolvedVkeyOf, type KeyPickerResolution } from "../../lib/charInput.ts";

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
      if (!isDeadkeyPatternId(m.patternId)) continue;
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
      for (const { base, output } of deadkeyPairsOfSlots(m.patternId, sv)) {
        if (!dk.outputsByBase.has(base)) dk.outputsByBase.set(base, output);
        dk.purposes.add(deadkeyPurposeOf(output));
      }
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
      if (isDeadkeyPatternId(m.patternId) && sv["deadkeyName"] === deadkeyName && typeof sv["escapes"] === "string") {
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
      if (isDeadkeyPatternId(m.patternId) && typeof escapes === "string") {
        return parseDeadkeyEscapes(escapes);
      }
    }
  }
  return new Set(DEADKEY_ESCAPES);
}

// ---------------------------------------------------------------------------
// The id + accentChar derivation is the second half of the seam:
// `resolveS02DeadkeyIdentity` is the ONLY place an S-02 mint derives its
// deadkeyName/accentChar. The manual deadkey Apply and the S-02 suggestion
// accept both call it; the case-pair companion reuses the identity the
// proposal captured (it must share the id, never mint a new one).
//
// Ids are numeric-only (hex4 for the deadkeyName slot): the "dead0" forced
// derivation is gone — every mint goes through allocateDeadkeyId.
//
// One deadkey per trigger: a placement on a trigger the session already gave
// a deadkey reuses that id rather than minting a second, unreachable one
// (deadkeyPurpose.ts proposes the trigger by the mark the character adds).
//
// Honest seam note: allocateDeadkeyId(workingIr) alone is NOT enough. The
// working IR does not carry this session's phase-C assignments
// (recordAssignments stores them in phaseResults; the working IR only sees
// setWorkingIR mutations), so a second S-02 mint in the same gallery visit
// would re-mint the first one's id. allocateS02DeadkeyId additionally
// reserves every numeric deadkeyName already minted in this session's
// assignments and skips past them. The reservation is session-local; ids
// minted by the Deadkeys step (committed through setWorkingIR) are visible
// via the IR itself.
// ---------------------------------------------------------------------------

/**
 * Numeric ids already minted as S-02 deadkeyName slots in this session's
 * assignments. 1–8 hex chars count — the pipeline imposes no 0xffff cap,
 * so a 5-digit session-minted id must still be reserved.
 */
function sessionMintedDeadkeyIds(
  sessionAssignments: readonly MechanismAssignment[],
): Set<number> {
  const ids = new Set<number>();
  for (const a of sessionAssignments) {
    for (const m of a.mechanisms) {
      if (!isDeadkeyPatternId(m.patternId)) continue;
      const name = m.slotValues?.["deadkeyName"];
      // 1–8 hex digits — matches the deadkey editors' parseIdText: the
      // pipeline imposes no 0xffff cap, so a 5-digit session-minted id
      // must still be reserved.
      if (typeof name !== "string" || !/^[0-9a-fA-F]{1,8}$/.test(name)) continue;
      const id = parseInt(name, 16);
      if (!Number.isNaN(id)) ids.add(id);
    }
  }
  return ids;
}

/**
 * Allocate the numeric id for a NEW S-02 deadkey assignment: the engine's
 * allocateDeadkeyId over the working IR, skipping past any ids already
 * minted in this session's assignments (see the seam note above).
 */
function allocateS02DeadkeyId(
  workingIr: KeyboardIR | null,
  sessionAssignments: readonly MechanismAssignment[],
): number {
  // Mirrors the engine's LEGACY_ID_CEILING floor (0x2FFF) for the
  // no-working-IR case — allocateDeadkeyId itself applies the same floor.
  let id = workingIr !== null ? allocateDeadkeyId(workingIr) : 0x3000;
  const reserved = sessionMintedDeadkeyIds(sessionAssignments);
  while (reserved.has(id)) id += 1;
  return id;
}

/** The identity half of an S-02 mint: numeric id + trigger literal. */
export interface S02DeadkeyIdentity {
  /** hex4 numeric id for the deadkeyName slot — never "dead0". */
  deadkeyName: string;
  /**
   * The trigger key's literal character (double-tap escape output). For the
   * 4 built-in trigger keys this is the key's character (e.g. ';' for
   * K_COLON); for a custom trigger character, the resolved character itself.
   */
  accentChar: string;
}

/**
 * Resolve the identity for a new S-02 deadkey assignment — the single seam
 * the manual deadkey card and the S-02 suggestion accept derive
 * deadkeyName/accentChar through. accentChar keeps the old convention (the
 * trigger key's literal character).
 *
 * A trigger key carries ONE deadkey: when a session placement already put a
 * deadkey on the resolved trigger, its id and accentChar are reused, so
 * applyAssignments merges the two into one bases/output store pair (see
 * deadkeyPurpose.ts). Only a trigger with no session deadkey mints a fresh id.
 */
export function resolveS02DeadkeyIdentity(params: {
  /** Raw key-picker value (one of DEADKEY_OPTIONS or ""). */
  triggerKey: string;
  /** resolveKeyPickerSelection(triggerKey, triggerKeyCustomChar, …). */
  triggerResolution: KeyPickerResolution;
  workingIr: KeyboardIR | null;
  sessionAssignments: readonly MechanismAssignment[];
}): S02DeadkeyIdentity {
  const { triggerKey, triggerResolution, workingIr, sessionAssignments } = params;
  const vkey = resolvedVkeyOf(triggerResolution);
  const existing = vkey !== null ? sessionDeadkeys(sessionAssignments).get(vkey) : undefined;
  if (existing !== undefined) {
    return { deadkeyName: existing.deadkeyName, accentChar: existing.accentChar };
  }
  const id = allocateS02DeadkeyId(workingIr, sessionAssignments);
  const accentChar =
    triggerResolution.kind === "customOk"
      ? triggerResolution.char
      : (TRIGGER_KEY_CHARS[triggerKey] ?? "");
  return { deadkeyName: hex4(id), accentChar };
}

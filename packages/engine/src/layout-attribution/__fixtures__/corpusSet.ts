// The fixed corpus set every spec 117 harness uses (T002): the attribution
// corpus suite (T027, T046), the simulateEach parity suite (T011), and the
// SC-001 / SC-002 / SC-007 / SC-009 / SC-010 assertions.
//
// Every id is in `release/` at CI's pinned corpus (ci.yml KEYBOARDS_CORPUS_SHA),
// so the set resolves in CI's release-only sparse checkout. A pick that stops
// parsing is replaced, never skipped (corpusSet.corpus.test.ts).
//
// Test-only. Never import this from product code.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));

// packages/engine/src/layout-attribution/__fixtures__ -> the repo root is five levels
// up; the keyboards checkout is its sibling (same arithmetic as ldml-export/__testing__).
export const RELEASE_ROOT = resolve(__dir, "../../../../../../keyboards/release");

/** True when the sibling `../keyboards` checkout is present. */
export const corpusAvailable: boolean = existsSync(RELEASE_ROOT);

/** The rule shapes the set must cover (tasks.md T002). */
export type CorpusCategory =
  | "simple-positional"
  | "deadkey-fanout"
  | "deadkey-keystroke"
  | "literal-context"
  | "store-based"
  | "conditional"
  | "later-group"
  | "opaque"
  | "mnemonic"
  | "iso";

export interface CorpusSetEntry {
  id: string;
  /** The shape the keyboard was picked for; most keyboards show several. */
  category: CorpusCategory;
  /** What in the source earns the pick. */
  why: string;
}

export const CORPUS_SET: readonly CorpusSetEntry[] = [
  { id: "basic_kbdus", category: "simple-positional", why: "one group, every key a context-free positional rule" },
  { id: "basic_kbdfr", category: "simple-positional", why: "AZERTY; key rules emit dk(005e), a second group resolves them" },
  { id: "sil_cameroon_qwerty", category: "simple-positional", why: "broad positional coverage across RALT layers" },
  { id: "basic_kbduk", category: "iso", why: "+ [K_oE2] and + [SHIFT K_oE2]" },
  { id: "basic_kbdgr", category: "iso", why: "K_oE2 rules and a &CasedKeys store" },
  { id: "sxava_eo", category: "iso", why: "small keyboard with + [K_oE2]" },
  { id: "dzardzongke", category: "deadkey-fanout", why: "dk(semicolon) + any(basekey) > index(output_char, 2)" },
  { id: "maltese", category: "deadkey-fanout", why: "numbered deadkeys, dk(1) + any(acutebase) > index(acute, 2)" },
  { id: "sil_wayuu", category: "deadkey-fanout", why: "named deadkeys with several fan-out tables per deadkey" },
  { id: "koalibrere", category: "deadkey-keystroke", why: "dk(K_HYPHEN) + [K_HYPHEN]; character-key rules (+ \"'\")" },
  { id: "postmodern_english_us_dualstroke", category: "deadkey-keystroke", why: "dk(one) + [SHIFT K_Q] beside dk(one) + 'a'" },
  { id: "thai_kedmanee_mattix", category: "literal-context", why: "U+0E5A dk(compose) + [SHIFT K_O]: text and deadkey context" },
  { id: "taiwan_austronesian", category: "literal-context", why: "\"e\" + [K_TAB] > \"é\" chains; if(&layer) rules" },
  { id: "northern_sierra_miwok", category: "literal-context", why: "'a' + [SHIFT RALT K_QUOTE] on a modifier layer" },
  { id: "txo_toto", category: "literal-context", why: "SMP literal contexts, '𞊨' + [SHIFT K_PERIOD]" },
  { id: "pau_cin_hau", category: "store-based", why: "one rule: + any(allcharsK) > index(allchars,1)" },
  { id: "akha_lahu", category: "store-based", why: "+ any(Input) > index(OutputU,1)" },
  { id: "enga", category: "conditional", why: "platform('desktop') + [SHIFT K_F]" },
  { id: "sil_madurese", category: "conditional", why: "platform('desktop') with literal context and store fan-out" },
  { id: "sil_yoruba8", category: "conditional", why: "if(style='dot') / set(style='bar') option stores" },
  { id: "sil_sgaw_karen", category: "later-group", why: "match > use(normalise) reorders what the key group output" },
  { id: "persian_phonetic", category: "later-group", why: "match > use(deadkeys) resolves key output in a second group" },
  { id: "korean_phonetic", category: "opaque", why: "call(jamo_combine) is held as a RawKmnFragment" },
  { id: "cs_pinyin", category: "opaque", why: "call/return and a menu store, mostly opaque" },
  { id: "sil_euro_latin", category: "opaque", why: "outs() store fragment across five groups" },
  { id: "enggano", category: "mnemonic", why: "store(&MnemonicLayout) \"1\"" },
];

/**
 * Picks whose `&TARGETS` names no web target (`'desktop'`, `'windows'`), so
 * kmcmplib emits a `.kmx` and no `.js` and the simulator has nothing to run.
 * The studio's preview has the same gap, so these exercise the Layout tab's
 * unverified path. Suites that simulate skip exactly these and assert the
 * list still matches what the compile produces.
 */
export const NO_WEB_TARGET: ReadonlySet<string> = new Set(["sil_yoruba8", "korean_phonetic", "cs_pinyin"]);

const dirCache = new Map<string, string | null>();

/** Absolute path of `release/<vendor>/<id>/source/<id>.kmn`, or null when absent. */
export function corpusKmnPath(id: string): string | null {
  const hit = dirCache.get(id);
  if (hit !== undefined) return hit;
  let found: string | null = null;
  if (corpusAvailable) {
    for (const vendor of readdirSync(RELEASE_ROOT, { withFileTypes: true })) {
      if (!vendor.isDirectory()) continue;
      const candidate = join(RELEASE_ROOT, vendor.name, id, "source", `${id}.kmn`);
      if (existsSync(candidate)) {
        found = candidate;
        break;
      }
    }
  }
  dirCache.set(id, found);
  return found;
}

/** The keyboard's `.kmn` source, or undefined when it is not in the checkout. */
export function loadCorpusKmn(id: string): string | undefined {
  const path = corpusKmnPath(id);
  return path === null ? undefined : readFileSync(path, "utf8");
}

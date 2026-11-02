// Test-only corpus resolver for the LDML export harnesses (contracts/test-harnesses.md "Corpus").
// Resolves keyboards from the sibling ../keyboards checkout (release/ and experimental/) and loads
// their source files from disk. Never import this from product code.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));

// packages/engine/src/ldml-export/__testing__ -> repo root is five levels up; the keyboards
// checkout is its sibling (same depth arithmetic as the pattern-apply corpus tests).
export const KEYBOARDS_ROOT = resolve(__dir, "../../../../../../keyboards");
export const RELEASE_ROOT = join(KEYBOARDS_ROOT, "release");
export const EXPERIMENTAL_ROOT = join(KEYBOARDS_ROOT, "experimental");

/** True when the sibling checkout is present; corpus suites skip (not fail) when it is not. */
export const corpusAvailable: boolean = existsSync(RELEASE_ROOT);

/**
 * True when the sibling checkout includes the experimental/ tree. CI checks
 * out release/ only (sparse), so this is false there.
 */
export const experimentalAvailable: boolean = existsSync(EXPERIMENTAL_ROOT);

export type CorpusRole =
  | "scaffold-fixture"
  | "handwritten-ldml-compare"
  | "ldml-pair"
  | "mnemonic"
  | "post-keystroke-touch"
  | "option-stores";

export interface CorpusEntry {
  id: string;
  role: CorpusRole;
  /** Why the keyboard is in the corpus. */
  why: string;
  /** LDML profiles (CLDR major versions) the keyboard is exercised under. */
  profiles: readonly (46 | 49)[];
}

/**
 * The three keyboards the contract leaves to task time, picked from ../keyboards:
 * - mnemonic: `enggano` declares `store(&MnemonicLayout) "1"` (row 2.7), 50 lines, has touch + kvks.
 * - PostKeystroke + touch: `chechen_latin` has `begin PostKeystroke` and a touch layout.
 * - option stores: `sil_yoruba8` uses `if(style='dot')` and `set(style='bar')`.
 */
export const REQUIRED_PICKS = {
  mnemonic: "enggano",
  postKeystrokeTouch: "chechen_latin",
  optionStores: "sil_yoruba8",
} as const;

export const CORPUS: readonly CorpusEntry[] = [
  { id: "basic_kbdus", role: "scaffold-fixture", why: "broad positional coverage", profiles: [46, 49] },
  { id: "basic_kbdfr", role: "scaffold-fixture", why: "AZERTY host", profiles: [46, 49] },
  { id: "sil_cameroon_qwerty", role: "scaffold-fixture", why: "broad positional coverage", profiles: [46, 49] },
  { id: "sil_cameroon_azerty", role: "scaffold-fixture", why: "AZERTY host", profiles: [46, 49] },
  { id: "ibono_chwerty", role: "handwritten-ldml-compare", why: "compare with the hand-written extras/ibono_chwerty.xml", profiles: [46] },
  { id: "khmer_angkor", role: "ldml-pair", why: "variables, sets, reorder-free and backspace transforms (vs khmer_ldml)", profiles: [46, 49] },
  { id: "khmer_ldml", role: "ldml-pair", why: "hand-written LDML counterpart of khmer_angkor", profiles: [46, 49] },
  { id: REQUIRED_PICKS.mnemonic, role: "mnemonic", why: "mnemonic layout, row 2.7", profiles: [46] },
  { id: REQUIRED_PICKS.postKeystrokeTouch, role: "post-keystroke-touch", why: "begin PostKeystroke and a touch layout", profiles: [46, 49] },
  { id: REQUIRED_PICKS.optionStores, role: "option-stores", why: "if()/set() option stores", profiles: [46] },
];

export interface CorpusKeyboard {
  id: string;
  /** Absolute keyboard folder. */
  dir: string;
  tree: "release" | "experimental";
  kmn?: string | undefined;
  touchLayout?: string | undefined;
  /** Raw `.kvks` text (the visual keyboard source). */
  kvks?: string | undefined;
  /** A hand-written LDML `.xml` sitting beside the source, when one exists. */
  ldmlXml?: string | undefined;
}

const dirCache = new Map<string, string | null>();

/** Finds `<root>/<vendor>/<id>`; the vendor folder (`a`, `basic`, `sil`, ...) is not assumed. */
function findKeyboardDir(root: string, id: string): string | null {
  const key = `${root}|${id}`;
  const hit = dirCache.get(key);
  if (hit !== undefined) return hit;
  let found: string | null = null;
  if (existsSync(root)) {
    for (const vendor of readdirSync(root, { withFileTypes: true })) {
      if (!vendor.isDirectory()) continue;
      const candidate = join(root, vendor.name, id);
      if (existsSync(candidate)) {
        found = candidate;
        break;
      }
    }
  }
  dirCache.set(key, found);
  return found;
}

/**
 * Whether a corpus id resolves from release/ alone. Entries that live only
 * in experimental/ (e.g. khmer_ldml) cannot resolve in a release-only
 * checkout (CI) — that is a checkout limitation, not a resolver failure,
 * so callers skip such entries instead of failing. A release/ keyboard
 * that fails to resolve is still a hard failure: never skip on this.
 */
export function resolvesFromRelease(id: string): boolean {
  return findKeyboardDir(RELEASE_ROOT, id) !== null;
}

function readIfPresent(dir: string, names: readonly string[]): string | undefined {
  for (const name of names) {
    const p = join(dir, name);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return undefined;
}

/** Resolves and loads one keyboard, or returns undefined when it is not in the checkout. */
export function loadCorpusKeyboard(id: string): CorpusKeyboard | undefined {
  const trees: readonly ["release" | "experimental", string][] = [
    ["release", RELEASE_ROOT],
    ["experimental", EXPERIMENTAL_ROOT],
  ];
  for (const [tree, root] of trees) {
    const dir = findKeyboardDir(root, id);
    if (dir === null) continue;
    const src = join(dir, "source");
    return {
      id,
      dir,
      tree,
      kmn: readIfPresent(src, [`${id}.kmn`]),
      touchLayout: readIfPresent(src, [`${id}.keyman-touch-layout`]),
      kvks: readIfPresent(src, [`${id}.kvks`]),
      ldmlXml: readIfPresent(src, [`${id}.xml`, join("extras", `${id}.xml`)]),
    };
  }
  return undefined;
}

/** Loads every corpus keyboard present in the checkout, keyed by id. */
export function loadCorpus(): Map<string, CorpusKeyboard> {
  const out = new Map<string, CorpusKeyboard>();
  for (const entry of CORPUS) {
    const kb = loadCorpusKeyboard(entry.id);
    if (kb) out.set(entry.id, kb);
  }
  return out;
}

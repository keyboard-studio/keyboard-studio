/**
 * Corpus gate for #2238 (the #2232 ruling's acceptance gate): over the
 * FULL release corpus, every keyboard that uses named deadkeys must
 * round-trip parse → emit → parse with the multiset of deadkey NAMES
 * (verbatim spelling, per position) identical, and the codec must produce
 * ZERO fragments with the `named-deadkey` opaque reason.
 *
 * Root: env KS_KEYBOARDS_FULL when set (fail — never skip — when set but
 * missing), else the sibling `keyboards-full` checkout. Skipped only when
 * no full corpus is available locally; CI's corpus lane provides one.
 *
 * Pinned totals — parser-level census over this corpus, measured with
 * the pre-#2238 parser (baseline) and this parser (post):
 *   keyboards in the gate population:            85 → 85
 *   fragments, named-deadkey reason:           5,906 → 0
 *   fragments, all reasons:                    6,406 → 507
 *   distinct names, case-folded, source tokens
 *     over all 89 source-mention files:           309
 *   distinct names reaching the typed IR (85):    304
 *     (the 5-name gap: dotnasaldownstep / oddnasaldownstep / a/x live
 *     only inside fragments held opaque for other reasons — preserved
 *     byte-for-byte by the fragment itself — and the rest only in the
 *     4 non-gate keyboards' comments/constructs)
 * #2247 addendum (unspaced-+ glue fix): population 85 → 86
 * (sil_korda_latin's only named deadkeys are its glued `dk(space)+`
 * escapes, now typed), distinct typed names 304 → 306 (dotnasaldownstep
 * and oddnasaldownstep reach typed elements via their glued escapes;
 * the gap is now 3 names), fragments and every per-reason count
 * IDENTICAL (507) — glued rules were never fragments, they were typed
 * rules carrying a raw element.
 * Every non-named reason count is IDENTICAL pre/post except two
 * reclassifications: constructs that were swallowed whole into a
 * named-deadkey fragment (the parser's early return took the whole
 * rule/store under the first opaque reason) now surface under their own
 * true reason once the named part types — korean_rr call-return 12 → 14
 * (+2) and malar_tirhuta smp-literal 121 → 126 (+5). The 7 are reason
 * changes, not new opacity: every affected keyboard's fragment total
 * falls sharply. (The #2232/#2238 crews' 5,767 figure came from the
 * supportability scanner's inventory, a different instrument; this
 * gate's authority is the parser census, baselined above.)
 *
 * Population: keyboards whose PARSED IR carries at least one namedDeadkey
 * element (store, rule, or opaque-store sketch). A raw source-text scan
 * finds 89 files mentioning a named dk() token — the 3 extra (pukapuka,
 * winchus, sil_myanmar_my3) keep theirs only in comments or in unmodelled
 * match/call constructs, so no named deadkey ever reaches their IR; they
 * are outside the gate by construction, not missed by it.
 * (sil_korda_latin was the 4th until #2247 — see the addendum above.)
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";
import { recognizePatterns } from "../recognizer/index.js";
import { classifyRemovalCapabilities } from "../recognizer/classifyRemovalCapabilities.js";
import {
  deadkeyNameKey,
  isNamedDeadkeyName,
  listDeadkeys,
} from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dir, "../../../../../keyboards-full");
const ROOT = process.env.KS_KEYBOARDS_FULL ?? DEFAULT_ROOT;
const rootExists = fs.existsSync(path.join(ROOT, "release"));

if (process.env.KS_KEYBOARDS_FULL !== undefined && !rootExists) {
  throw new Error(
    `KS_KEYBOARDS_FULL=${ROOT} does not contain a release/ tree — the #2238 corpus gate must not skip silently`,
  );
}
if (!rootExists) {
  console.warn(
    `[WARN] full keyboards corpus not found at ${ROOT}; skipping the #2238 named-deadkey corpus gate`,
  );
}

function* walkKmn(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkKmn(p);
    else if (entry.name.endsWith(".kmn")) yield p;
  }
}

/** Source mentions at least one named dk(name) token (shared boundary). */
function sourceMentionsNamedDeadkey(text: string): boolean {
  for (const m of text.matchAll(/\bdk\(\s*([^\s()]+)\s*\)/g)) {
    if (isNamedDeadkeyName(m[1]!)) return true;
  }
  return false;
}

/** Named-deadkey names in document order, verbatim (stores, rules, sketches). */
function namedNames(ir: KeyboardIR): string[] {
  const out: string[] = [];
  const scan = (els: readonly { kind: string; name?: string }[]) => {
    for (const el of els) if (el.kind === "namedDeadkey") out.push(el.name!);
  };
  for (const s of ir.stores) scan(s.items);
  for (const g of ir.groups)
    for (const r of g.rules) {
      scan(r.context);
      scan(r.output);
    }
  for (const f of ir.raw) if (f.storeSketch) scan(f.storeSketch);
  return out;
}

interface KbResult {
  id: string;
  names: string[];
  rawAfter: number;
  rawByReason: Record<string, number>;
  typedDkRules: number;
  typedDkStores: number;
}

function analyse(id: string, first: KeyboardIR, violations: string[]): KbResult {
  const namedFrags = first.raw.filter((f) => f.reason === OPAQUE_REASONS.NAMED_DEADKEY);
  if (namedFrags.length > 0) {
    violations.push(`${id}: ${namedFrags.length} named-deadkey fragments remain after parse`);
  }
  const names1 = namedNames(first);
  const emitted = emit(first);
  const second = parse(emitted, id).ir;
  const names2 = namedNames(second);
  if (JSON.stringify(names1) !== JSON.stringify(names2)) {
    violations.push(
      `${id}: name multiset changed across round trip (${names1.length} → ${names2.length})`,
    );
  }
  if (second.raw.length > first.raw.length) {
    violations.push(
      `${id}: opaque count increased across round trip (${first.raw.length} → ${second.raw.length})`,
    );
  }
  let typedDkRules = 0;
  for (const g of first.groups)
    for (const r of g.rules)
      if (
        r.context.some((c) => c.kind === "namedDeadkey") ||
        r.output.some((c) => c.kind === "namedDeadkey")
      )
        typedDkRules++;
  const typedDkStores = first.stores.filter((s) =>
    s.items.some((i) => i.kind === "namedDeadkey"),
  ).length;
  const rawByReason: Record<string, number> = {};
  for (const f of first.raw) rawByReason[f.reason] = (rawByReason[f.reason] ?? 0) + 1;
  return { id, names: names1, rawAfter: first.raw.length, rawByReason, typedDkRules, typedDkStores };
}

describe.skipIf(!rootExists)("named deadkeys — full-corpus gate (#2238)", () => {
  it(
    "all named-deadkey keyboards round-trip name-identical; zero named-deadkey fragments",
    { timeout: 1_200_000 },
    () => {
      const files = [...walkKmn(path.join(ROOT, "release"))];
      expect(files.length).toBeGreaterThanOrEqual(900);

      const violations: string[] = [];
      const results: KbResult[] = [];
      const distinctKeys = new Set<string>();
      const sourceDistinctKeys = new Set<string>();
      let residualRaw = 0;
      let sourceMentionCount = 0;
      const census: Record<string, number> = {};

      for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        if (sourceMentionsNamedDeadkey(text)) {
          sourceMentionCount++;
          for (const m of text.matchAll(/\bdk\(\s*([^\s()]+)\s*\)/g)) {
            if (isNamedDeadkeyName(m[1]!)) sourceDistinctKeys.add(deadkeyNameKey(m[1]!));
          }
        }
        const id = path.basename(file, ".kmn");
        const first = parse(text, id).ir;
        // Gate population: the parsed IR carries at least one named
        // element. Keyboards mentioning named deadkeys only in comments
        // or unmodelled constructs never reach the IR (see header).
        if (namedNames(first).length === 0) continue;
        const r = analyse(id, first, violations);
        results.push(r);
        residualRaw += r.rawAfter;
        for (const [reason, n] of Object.entries(r.rawByReason)) {
          census[reason] = (census[reason] ?? 0) + n;
        }
        for (const n of r.names) distinctKeys.add(deadkeyNameKey(n));
      }

      expect(violations).toEqual([]);
      // Pinned totals (parser census; baseline in the header comment).
      // The source-mention count (89) is pinned too, so the 3 remaining
      // comment/construct-only keyboards are accounted for, never
      // silently lost.
      expect(sourceMentionCount).toBe(89);
      // Population 85 → 86 with #2247: sil_korda_latin's only named
      // deadkeys are its two `dk(space)+` double-tap escapes, which the
      // unspaced-+ glue previously kept out of the typed IR entirely.
      expect(results.length).toBe(86);
      expect(residualRaw).toBe(507);
      expect(census).toEqual({
        "smp-literal": 190,
        "if-option-store": 148,
        "outs-expansion": 111,
        "option-store-directive": 32,
        "call-return": 18,
        "menu-store-syntax": 4,
        "malformed-range": 4,
      });
      expect(sourceDistinctKeys.size).toBe(309);
      // 304 → 306 with #2247: the glued `dk(dotNasalDownstep)+` /
      // `dk(oddNasalDownstep)+` escapes (sil_nigeria_dot /
      // sil_nigeria_odd_vowels) now reach typed elements, closing two of
      // the five gap names named in the header.
      expect(distinctKeys.size).toBe(306);

      const byId = new Map(results.map((r) => [r.id, r]));
      // typedDkRules = rules with a namedDeadkey element in context or
      // output (armenian split: 528 both, 32 output-only, 38 context-only).
      expect(byId.get("armenian_mnemonic_r")?.typedDkRules).toBe(598);
      expect(byId.get("armenian_mnemonic_r")?.typedDkStores).toBe(6);
      expect(byId.get("russian_mnemonic_r")?.typedDkRules).toBe(125);
      // The two reclassification sites (see header): fragments that were
      // named-deadkey pre-#2238 and now carry their own true reason.
      expect(byId.get("korean_rr")?.rawByReason["call-return"]).toBe(14);
      expect(byId.get("malar_tirhuta")?.rawByReason["smp-literal"]).toBe(126);

      // The case-variant pair keyboards keep BOTH spellings (one deadkey,
      // two source spellings — fidelity is verbatim, identity folds). The
      // capital spelling occurs only in the double-tap escape rule,
      // written `dk(Semicolon)+ ";"` with no space before `+`. Pre-#2247
      // the tokenizer never split that glue, so the name rode in a raw
      // context element and was asserted at the emitted-text level only;
      // since #2247 both spellings reach typed namedDeadkey elements and
      // emit reproduces the capital spelling in the spaced canonical form.
      for (const id of ["embera_north", "landuma"]) {
        const names = byId.get(id)?.names ?? [];
        expect(names).toContain("semicolon");
        expect(names).toContain("Semicolon");
        const file = files.find((f) => path.basename(f, ".kmn") === id)!;
        const emitted = emit(parse(fs.readFileSync(file, "utf8"), id).ir);
        expect(emitted).toContain("dk(Semicolon)");
      }
    },
  );

  it(
    "non-adoption + inventory parity on the flagship keyboards (armenian, embera)",
    { timeout: 600_000 },
    () => {
      const load = (id: string): KeyboardIR => {
        const file = path.join(
          ROOT, "release", id[0]!, id, "source", `${id}.kmn`,
        );
        return parse(fs.readFileSync(file, "utf8"), id).ir;
      };
      const isNamedRule = (r: KeyboardIR["groups"][number]["rules"][number]) =>
        r.context.some((c) => c.kind === "namedDeadkey") ||
        r.output.some((c) => c.kind === "namedDeadkey");

      for (const id of ["armenian_mnemonic_r", "embera_north"]) {
        const ir = load(id);
        // Recognizer runs over the newly-typed population without
        // throwing and claims NONE of it (adoption is a separate ruling).
        const recognized = recognizePatterns(ir).ir;
        const named = recognized.groups.flatMap((g) => g.rules).filter(isNamedRule);
        expect(named.length).toBeGreaterThan(0);
        expect(named.filter((r) => r.ownedByPattern !== undefined)).toEqual([]);
        // The posture guard holds over the whole real population.
        const caps = classifyRemovalCapabilities(recognized);
        expect(
          named.filter((r) => caps.get(r.nodeId) !== "not-removable:opaque"),
        ).toEqual([]);
      }

      // listDeadkeys identity parity with the fragment era (names,
      // trigger keys, origin — verified against the pre-#2238 parser):
      // embera's entries are completely unchanged (its fan-outs are
      // char-output chains, so pair counts were and stay 0); armenian's
      // 18 entries keep their identity and now carry the cluster data
      // the fragment scrape could not recover (stores + real pair
      // counts, previously null/0).
      const embera = listDeadkeys(load("embera_north"));
      expect(embera.map((d) => [d.name, d.triggerKey, d.pairCount])).toEqual([
        ["left_square_bracket", "[", 0],
        ["quote", "'", 0],
        ["semicolon", ";", 0],
      ]);
      const armenian = listDeadkeys(load("armenian_mnemonic_r"));
      expect(armenian).toHaveLength(18);
      expect(armenian.map((d) => d.name)).toEqual([
        "apostrophe", "backslash", "capital_co", "capital_da",
        "capital_gim", "capital_ken", "capital_seh", "capital_tyun",
        "capital_za", "double_quote", "slash", "small_co", "small_da",
        "small_gim", "small_ken", "small_seh", "small_tyun", "small_za",
      ]);
      for (const d of armenian) {
        expect(d.id).toBeNull();
        expect(d.baseStore).not.toBeNull();
        expect(d.outputStore).not.toBeNull();
        expect(d.pairCount).toBeGreaterThan(0);
        expect(d.authorName).toBeUndefined();
      }
    },
  );
});

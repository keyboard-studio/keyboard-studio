import type {
  ContextElement,
  IRRule,
  IRStore,
  NormalizationMap,
  OutputElement,
  OutputRepertoire,
} from "@keyboard-studio/contracts";
import { NORMALIZATION_STORE_PREFIX } from "./constants.js";

/**
 * Rule packing (spec 086 R5): a greedy safe set cover of the maps over five
 * store-indexed rule shapes, emitted as IR rules over `generated_cn_*` stores.
 *
 * | Shape | Context -> output |
 * |---|---|
 * | P0 | `any(H) any(M)...` -> `index(F,1)... index(M,2)...` (rewrite head, pass marks) |
 * | T  | `any(H) <literal tail>` -> `index(E,1)...` |
 * | H  | `<literal head> any(T)` -> `index(E,2)...` (two-character maps) |
 * | P  | `any(H) m1 any(M)...` (fixed first mark, the rest pass through) |
 * | P2 | `any(H) any(Mid) m2` -> `index(F,1) index(Mid,2)` |
 *
 * A pass-through shape is admitted for a head only if every cluster it can
 * match is a known map's alternate, rewritten to exactly that map's target:
 * it never matches a produced cluster or an unmapped one.
 * No rule contains `if()` or a backspace key.
 */

interface Map1 {
  /** Pasted alternate, as code points. */
  a: string[];
  /** Produced cluster, as code points. */
  e: string[];
}

type CandKind = "P0" | "P" | "P2" | "T" | "H";
interface Cand {
  kind: CandKind;
  key: string;
  members: Map1[];
  lit1?: string;
  /** Learned pass sets, one per pass-through position (P0/P); absent means "every repertoire mark" at each. */
  pass?: string[][];
}

export interface PackedRules {
  stores: IRStore[];
  rules: IRRule[];
}

/**
 * Returns `null` when `shouldStop` fired before packing finished. Generated
 * store names skip `reservedStoreNames` (lowercased), the keyboard's own stores.
 */
export function packNormalization(
  mapList: readonly NormalizationMap[],
  repertoire: OutputRepertoire,
  shouldStop: () => boolean = () => false,
  reservedStoreNames: ReadonlySet<string> = new Set(),
): PackedRules | null {
  const maps: Map1[] = mapList.map((m) => ({ a: [...m.from], e: [...m.to] }));
  const M = [...repertoire.marks];
  const Mset = new Set(M);
  const produced = repertoire.clusters;

  const stores: IRStore[] = [];
  const rules: IRRule[] = [];
  const storeByContent = new Map<string, string>();
  let nextName = 0;
  const store = (vals: string[]): string => {
    const key = vals.join("\u0000");
    const have = storeByContent.get(key);
    if (have !== undefined) return have;
    let name = `${NORMALIZATION_STORE_PREFIX}${nextName++}`;
    while (reservedStoreNames.has(name.toLowerCase())) name = `${NORMALIZATION_STORE_PREFIX}${nextName++}`;
    stores.push({
      nodeId: `${NORMALIZATION_STORE_PREFIX}store_${stores.length}`,
      name,
      items: vals.map((value) => ({ kind: "char" as const, value })),
      isSystem: false,
    });
    storeByContent.set(key, name);
    return name;
  };
  const any = (s: string): ContextElement => ({ kind: "any", storeRef: s });
  const lits = (cps: string[]): ContextElement[] => cps.map((value) => ({ kind: "char" as const, value }));
  const idx = (s: string, offset: number): OutputElement => ({ kind: "index", storeRef: s, offset });
  const outChars = (cps: string[]): OutputElement[] => cps.map((value) => ({ kind: "char" as const, value }));
  const rule = (context: ContextElement[], output: OutputElement[]): void => {
    rules.push({ nodeId: `${NORMALIZATION_STORE_PREFIX}rule_${rules.length}`, context, output });
  };

  const bySrc = new Map(maps.map((m) => [m.a.join(""), m] as const));
  const byLen = new Map<number, Map1[]>();
  for (const m of maps) byLen.set(m.a.length, [...(byLen.get(m.a.length) ?? []), m]);

  for (const [L, all] of [...byLen].sort((x, y) => x[0] - y[0])) {
    if (shouldStop()) return null;
    const cands = new Map<string, Cand>();
    const addTo = (kind: CandKind, key: string, m: Map1, lit1?: string, pass?: string[][]): void => {
      const k = `${kind}|${key}`;
      let c = cands.get(k);
      if (c === undefined) {
        c = { kind, key, members: [] };
        if (lit1 !== undefined) c.lit1 = lit1;
        if (pass !== undefined) c.pass = pass;
        cands.set(k, c);
      }
      c.members.push(m);
    };
    // Pass-through coverage: every cluster the shape can match must be a known
    // map's alternate with exactly the shape's output. A match with no map
    // would rewrite pasted text the keyboard cannot produce (FR-003).
    const covers = (str: string, out: string): boolean => {
      if (produced.has(str)) return false;
      const m = bySrc.get(str);
      return m !== undefined && m.e.join("") === out;
    };
    const product = (sets: string[][]): string[][] =>
      sets.reduce<string[][]>((acc, set) => acc.flatMap((t) => set.map((x) => [...t, x])), [[]]);
    const safeOver = (prefix: string, sets: string[][], f: string): boolean =>
      product(sets).every((t) => covers(prefix + t.join(""), f + t.join("")));
    const safe = (prefix: string, k: number, f: string): boolean =>
      safeOver(prefix, Array.from({ length: k }, () => M), f);
    // Learned pass sets: per pass-through position, only the marks the member maps show there.
    const learned = (pm: Map1[], from: number): string[][] =>
      Array.from({ length: L - from }, (_, j) => [...new Set(pm.map((m) => m.a[from + j] as string))].sort());
    const passKey = (pass: string[][]): string => pass.map((set) => set.join("")).join(",");
    const heads = new Map<string, Map1[]>();
    for (const m of all) heads.set(m.a[0] as string, [...(heads.get(m.a[0] as string) ?? []), m]);
    for (const [h, hm] of heads) {
      if (shouldStop()) return null;
      if (L >= 2) {
        const pm = hm.filter((m) => m.a.slice(1).every((c) => Mset.has(c)) && m.e.slice(-(L - 1)).join("") === m.a.slice(1).join(""));
        if (pm.length > 0) {
          const f = (pm[0] as Map1).e.slice(0, (pm[0] as Map1).e.length - (L - 1)).join("");
          if (safe(h, L - 1, f)) for (const m of pm) addTo("P0", String([...f].length), m);
          else {
            const pass = learned(pm, 1);
            if (safeOver(h, pass, f)) {
              for (const m of pm) addTo("P0", `${[...f].length}|${passKey(pass)}`, m, undefined, pass);
            }
          }
        }
      }
      if (L >= 3) {
        const byM1 = new Map<string, Map1[]>();
        for (const m of hm) byM1.set(m.a[1] as string, [...(byM1.get(m.a[1] as string) ?? []), m]);
        for (const [m1, mm] of byM1) {
          const pm = mm.filter((m) => m.a.slice(2).every((c) => Mset.has(c)) && m.e.slice(-(L - 2)).join("") === m.a.slice(2).join(""));
          if (pm.length > 0) {
            const f = (pm[0] as Map1).e.slice(0, (pm[0] as Map1).e.length - (L - 2)).join("");
            if (safe(h + m1, L - 2, f)) for (const m of pm) addTo("P", `${m1}|${[...f].length}`, m, m1);
            else {
              const pass = learned(pm, 2);
              if (safeOver(h + m1, pass, f)) {
                for (const m of pm) addTo("P", `${m1}|${[...f].length}|${passKey(pass)}`, m, m1, pass);
              }
            }
          }
        }
      }
    }
    if (L === 3) {
      const byLast = new Map<string, Map1[]>();
      for (const m of all) if (m.e[m.e.length - 1] === m.a[1]) byLast.set(m.a[2] as string, [...(byLast.get(m.a[2] as string) ?? []), m]);
      for (const [m2, mm] of byLast) {
        const hs = new Map<string, Map1[]>();
        for (const m of mm) hs.set(m.a[0] as string, [...(hs.get(m.a[0] as string) ?? []), m]);
        for (const [h, pm] of hs) {
          const f = (pm[0] as Map1).e.slice(0, -1).join("");
          if (!pm.every((m) => m.e.slice(0, -1).join("") === f)) continue;
          // This head's own middle marks, so the shape matches only mapped clusters.
          const mids = [...new Set(pm.map((m) => m.a[1] as string))].sort();
          if (mids.every((t) => covers(h + t + m2, f + t))) {
            for (const m of pm) addTo("P2", `${m2}|${[...f].length}|${mids.join("")}`, m, m2);
          }
        }
      }
    }
    for (const m of all) {
      addTo("T", `${m.a.slice(1).join("")}|${m.e.length}`, m);
      if (L === 2) addTo("H", `${m.a[0]}|${m.e.length}`, m);
    }

    const covered = new Set<Map1>();
    while (covered.size < all.length) {
      let best: Cand | null = null;
      let bestN = 0;
      for (const c of cands.values()) {
        const k = c.members.filter((m) => !covered.has(m)).length;
        if (k > bestN) {
          best = c;
          bestN = k;
        }
      }
      if (best === null) return null; // unreachable: every map is a T candidate
      const grp = best.members.filter((m) => !covered.has(m));
      for (const m of grp) covered.add(m);
      const uniqBy = (f: (m: Map1) => string): Map1[] => {
        const seen = new Set<string>();
        return grp.filter((m) => {
          const k = f(m);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };
      const first = grp[0] as Map1;
      const Le = first.e.length;
      if (best.kind === "P0" || best.kind === "P") {
        const fixed = best.kind === "P0" ? 1 : 2;
        const pass = L - fixed;
        const u = uniqBy((m) => m.a[0] as string);
        const h = store(u.map((m) => m.a[0] as string));
        const pre = Array.from({ length: Le - pass }, (_, j) => idx(store(u.map((m) => m.e[j] as string)), 1));
        const mStores = Array.from({ length: pass }, (_, j) => store(best.pass?.[j] ?? M));
        rule(
          [any(h), ...(fixed === 2 ? lits([best.lit1 as string]) : []), ...mStores.map(any)],
          [...pre, ...mStores.map((ms, j) => idx(ms, j + fixed + 1))],
        );
      } else if (best.kind === "P2") {
        const u = uniqBy((m) => m.a[0] as string);
        const h = store(u.map((m) => m.a[0] as string));
        const pre = Array.from({ length: Le - 1 }, (_, j) => idx(store(u.map((m) => m.e[j] as string)), 1));
        const midChars = best.key.split("|")[2] ?? "";
        const ps = store(midChars !== "" ? [...midChars] : M);
        rule([any(h), any(ps), ...lits([best.lit1 as string])], [...pre, idx(ps, 2)]);
      } else if (best.kind === "H") {
        const u = uniqBy((m) => m.a[1] as string);
        const t = store(u.map((m) => m.a[1] as string));
        rule([...lits([first.a[0] as string]), any(t)], first.e.map((_, j) => idx(store(u.map((m) => m.e[j] as string)), 2)));
      } else {
        const u = uniqBy((m) => m.a[0] as string);
        if (u.length === 1) rule(lits(first.a), outChars(first.e));
        else {
          const h = store(u.map((m) => m.a[0] as string));
          rule([any(h), ...lits(first.a.slice(1))], first.e.map((_, j) => idx(store(u.map((m) => m.e[j] as string)), 1)));
        }
      }
    }
  }
  return { stores, rules };
}

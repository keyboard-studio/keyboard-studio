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
 * A pass-through shape is admitted for a head only if it can never match a
 * cluster the keyboard produces and agrees with every known map it covers.
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
  /** A learned single-mark pass set (P0/P with one pass-through mark); absent means "every repertoire mark". */
  pass?: string[];
}

export interface PackedRules {
  stores: IRStore[];
  rules: IRRule[];
}

/** Returns `null` when `shouldStop` fired before packing finished. */
export function packNormalization(
  mapList: readonly NormalizationMap[],
  repertoire: OutputRepertoire,
  shouldStop: () => boolean = () => false,
): PackedRules | null {
  const maps: Map1[] = mapList.map((m) => ({ a: [...m.from], e: [...m.to] }));
  const M = [...repertoire.marks];
  const Mset = new Set(M);
  const produced = repertoire.clusters;

  const stores: IRStore[] = [];
  const rules: IRRule[] = [];
  const storeByContent = new Map<string, string>();
  const store = (vals: string[]): string => {
    const key = vals.join("\u0000");
    const have = storeByContent.get(key);
    if (have !== undefined) return have;
    const name = `${NORMALIZATION_STORE_PREFIX}${stores.length}`;
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
  const tuples = (k: number): string[][] => (k === 0 ? [[]] : tuples(k - 1).flatMap((t) => M.map((m) => [...t, m])));
  const byLen = new Map<number, Map1[]>();
  for (const m of maps) byLen.set(m.a.length, [...(byLen.get(m.a.length) ?? []), m]);

  for (const [L, all] of [...byLen].sort((x, y) => x[0] - y[0])) {
    if (shouldStop()) return null;
    const cands = new Map<string, Cand>();
    const addTo = (kind: CandKind, key: string, m: Map1, lit1?: string, pass?: string[]): void => {
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
    // Pass-through safety: prefix (fixed part) + every tuple of k marks.
    const safe = (prefix: string, k: number, f: string): boolean =>
      tuples(k).every((t) => {
        const str = prefix + t.join("");
        if (produced.has(str)) return false;
        const m = bySrc.get(str);
        return m === undefined || m.e.join("") === f + t.join("");
      });
    const safeOver = (prefix: string, marks: string[], f: string): boolean =>
      marks.every((t) => {
        const str = prefix + t;
        if (produced.has(str)) return false;
        const m = bySrc.get(str);
        return m === undefined || m.e.join("") === f + t;
      });
    // Learned pass sets: only the single marks the member maps actually show.
    const learned = (pm: Map1[]): string[] => [...new Set(pm.map((m) => m.a[m.a.length - 1] as string))].sort();
    const heads = new Map<string, Map1[]>();
    for (const m of all) heads.set(m.a[0] as string, [...(heads.get(m.a[0] as string) ?? []), m]);
    for (const [h, hm] of heads) {
      if (shouldStop()) return null;
      if (L >= 2) {
        const pm = hm.filter((m) => m.a.slice(1).every((c) => Mset.has(c)) && m.e.slice(-(L - 1)).join("") === m.a.slice(1).join(""));
        if (pm.length > 0) {
          const f = (pm[0] as Map1).e.slice(0, (pm[0] as Map1).e.length - (L - 1)).join("");
          if (safe(h, L - 1, f)) for (const m of pm) addTo("P0", String([...f].length), m);
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
            else if (L === 3) {
              const pass = learned(pm);
              if (safeOver(h + m1, pass, f)) {
                for (const m of pm) addTo("P", `${m1}|${[...f].length}|${pass.join("")}`, m, m1, pass);
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
        const mids = [...new Set(mm.map((m) => m.a[1] as string))];
        const hs = new Map<string, Map1[]>();
        for (const m of mm) hs.set(m.a[0] as string, [...(hs.get(m.a[0] as string) ?? []), m]);
        for (const [h, pm] of hs) {
          const f = (pm[0] as Map1).e.slice(0, -1).join("");
          if (!pm.every((m) => m.e.slice(0, -1).join("") === f)) continue;
          const ok = mids.every((t) => {
            const str = h + t + m2;
            if (produced.has(str)) return false;
            const m = bySrc.get(str);
            return m === undefined || m.e.join("") === f + t;
          });
          if (ok) for (const m of pm) addTo("P2", `${m2}|${[...f].length}|${mids.join("")}`, m, m2);
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
        const mStore = store(best.pass ?? M);
        rule(
          [any(h), ...(fixed === 2 ? lits([best.lit1 as string]) : []), ...Array.from({ length: pass }, () => any(mStore))],
          [...pre, ...Array.from({ length: pass }, (_, j) => idx(mStore, j + fixed + 1))],
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

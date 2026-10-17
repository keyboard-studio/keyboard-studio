/**
 * s06-families — the S-06 (two-trigger chain, library pattern) cluster finder,
 * shared by the hand-written s06Recognizer (rules/s06-deadkey-chained-two-tier.ts)
 * and the removal-capability classifier's per-member shape check
 * (classifyRemovalCapabilities.ts, queue-2235-ruling.md §2). Issue #2235.
 *
 * The predicate is queue-2235-ruling.md §3 VERBATIM, as exercised by the
 * parser-verified census recorded on #2235 (full release corpus, 933 .kmn,
 * codec at dev b78bb083): admitted n = 1 keyboard — sil_cameroon_azerty,
 * 5 sub-clusters over family dk(0x21). All shape checks run on the CLEANED
 * context (the codec's `+` separator elements stripped via the contracts
 * `isPlusSeparator` notion), and deadkey identity is keyed over the
 * deadkey-element UNION: numeric `deadkey` by id, `namedDeadkey` by
 * `deadkeyNameKey` (the library pattern's own scaffolded output uses named
 * deadkeys, so a numeric-only finder would miss the studio's own chains).
 *
 * A sub-cluster {family F, tier-2 T} exists iff all of:
 *   1. Arming: a rule with no deadkey in context whose sole output is dk(F).
 *   2. Pure edge: a rule whose output is *solely* dk(T), T≠F, whose context
 *      is dk(F) followed by exactly one key element (vkey or char). Output
 *      purity is the mandatory gate — it alone excludes every delay-line
 *      flush in the corpus (armenian_mnemonic_r: 496 loose edges, 0 pure;
 *      russian_mnemonic_r: 81, 0 pure — the S-06 pending-letter sense is
 *      NOT claimed by this finder, by design).
 *   3. Tier-2 resolution: [dk(T), any(S)] > index(OUT, 2) — single `index`
 *      output, offset = cleaned context length.
 *   4. Boundedness: T heads no onward edge within the cluster (no rule with
 *      dk(T) in context and a deadkey in output beyond its
 *      resolutions/fallbacks) — the formal separator from the unbounded
 *      delay line.
 *
 * Owned nodes (per admitted family, grouped by F — sub-clusters sharing F
 * share the arming rules, so one Pattern per F carries them all): the
 * arming, edge, and tier-2 resolution rules; the tier-1 direct resolution
 * of F if present; any `notany`-fallback / double-press rules headed by F
 * or T. Fallbacks and double-press rules are NOT required for the claim
 * (sil_cameroon_azerty has no `notany` fallbacks — miss handling is folded
 * into its stores as trailing `beep` slots). Sibling families on the same
 * keyboard are untouched: cluster assembly is scoped to rules reachable
 * from a pure edge.
 */

import type {
  ContextElement,
  IRRule,
  KeyboardIR,
  OutputElement,
} from "@keyboard-studio/contracts";
import { deadkeyNameKey, isPlusSeparator } from "@keyboard-studio/contracts";
import { formatDkName, isBehaviourOwned } from "./utils.js";

// ---------------------------------------------------------------------------
// Deadkey-element union identity
// ---------------------------------------------------------------------------

type DeadkeyBearingElement = ContextElement | OutputElement;

/** Identity key for a deadkey element: `num:<id>` or `nam:<deadkeyNameKey>`. */
export function deadkeyElementKey(el: DeadkeyBearingElement): string | null {
  if (el.kind === "deadkey") return `num:${el.id}`;
  if (el.kind === "namedDeadkey") return `nam:${deadkeyNameKey(el.name)}`;
  return null;
}

/** Display discriminator for a deadkey key: `dk_0021` or `dk(<nameKey>)`. */
export function deadkeyDiscriminator(key: string): string {
  if (key.startsWith("num:")) {
    return formatDkName(Number(key.slice(4)));
  }
  return `dk(${key.slice(4)})`;
}

/** The rule's context with `+` separator elements removed (a view). */
export function s06CleanedContext(rule: IRRule): ContextElement[] {
  return rule.context.filter((el) => !isPlusSeparator(el));
}

function soleDeadkeyOutputKey(rule: IRRule): string | null {
  if (rule.output.length !== 1) return null;
  return deadkeyElementKey(rule.output[0]!);
}

// ---------------------------------------------------------------------------
// Per-member shape used by the capability settlement (ruling §2.2)
// ---------------------------------------------------------------------------

/**
 * The single-`index` parallel fan-out member shape, evaluated on the cleaned
 * context over the deadkey-element union: `[dk, any(S)] > index(OUT, n)`
 * with n = cleaned context length. This is the ONLY S-06 member shape that
 * earns `removable:slot-fill` under the §2 settlement.
 */
export function isS06FanOutMember(rule: IRRule): boolean {
  const cleaned = s06CleanedContext(rule);
  if (cleaned.length !== 2) return false;
  if (deadkeyElementKey(cleaned[0]!) === null) return false;
  if (cleaned[1]!.kind !== "any") return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0]!;
  return out.kind === "index" && out.offset === cleaned.length;
}

// ---------------------------------------------------------------------------
// Cluster assembly (§3 predicate)
// ---------------------------------------------------------------------------

export interface S06SubCluster {
  familyKey: string;
  tier2Key: string;
  edges: IRRule[];
  resolutions: IRRule[];
}

export interface S06Family {
  familyKey: string;
  /** Pattern-id discriminator for F, e.g. `dk_0021`. */
  discriminator: string;
  /** First-seen display spelling of F: `dk_0021` or the verbatim dk(name). */
  familyDisplay: string;
  arming: IRRule[];
  subClusters: S06SubCluster[];
  tier1DirectResolutions: IRRule[];
  fallbacks: IRRule[];
  doublePresses: IRRule[];
  /** Every owned rule, deduplicated, in IR order. */
  ownedRules: IRRule[];
}

function isCandidate(rule: IRRule): boolean {
  // FR-021: behaviour-owned rules are never pattern candidates. (Admission
  // itself is computed over all rules, census-faithful; this filter applies
  // only to ownership.)
  return rule.ownedByPattern === undefined && !isBehaviourOwned(rule);
}

export function findS06Families(ir: KeyboardIR): S06Family[] {
  const allRules: IRRule[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) allRules.push(rule);
  }

  // 1. Arming: no deadkey in the cleaned context, sole output dk(F).
  const armingByF = new Map<string, IRRule[]>();
  const familyDisplayByKey = new Map<string, string>();
  for (const rule of allRules) {
    const cleaned = s06CleanedContext(rule);
    if (cleaned.some((el) => deadkeyElementKey(el) !== null)) continue;
    const F = soleDeadkeyOutputKey(rule);
    if (F === null) continue;
    const list = armingByF.get(F) ?? [];
    list.push(rule);
    armingByF.set(F, list);
    if (!familyDisplayByKey.has(F)) {
      const out = rule.output[0]!;
      familyDisplayByKey.set(
        F,
        out.kind === "deadkey"
          ? formatDkName(out.id)
          : out.kind === "namedDeadkey"
            ? out.name
            : F,
      );
    }
  }

  // 2. Pure edges: sole output dk(T), T≠F; cleaned context dk(F) + exactly
  //    one key element (vkey or char).
  interface PureEdge {
    F: string;
    T: string;
    rule: IRRule;
  }
  const pureEdges: PureEdge[] = [];
  for (const rule of allRules) {
    const T = soleDeadkeyOutputKey(rule);
    if (T === null) continue;
    const cleaned = s06CleanedContext(rule);
    if (cleaned.length !== 2) continue;
    const F = deadkeyElementKey(cleaned[0]!);
    if (F === null || F === T) continue;
    const second = cleaned[1]!;
    if (second.kind !== "vkey" && second.kind !== "char") continue;
    pureEdges.push({ F, T, rule });
  }

  // 3. Tier-2 resolutions by head deadkey: [dk(T), any(S)] > index(OUT, 2).
  const resolutionsByT = new Map<string, IRRule[]>();
  for (const rule of allRules) {
    if (!isS06FanOutMember(rule)) continue;
    const T = deadkeyElementKey(s06CleanedContext(rule)[0]!)!;
    const list = resolutionsByT.get(T) ?? [];
    list.push(rule);
    resolutionsByT.set(T, list);
  }

  // 4. Boundedness: T heads no onward edge — no rule with dk(T) in context
  //    and a deadkey in output, beyond T's resolutions / fallbacks.
  const hasOnwardEdge = (T: string): boolean =>
    allRules.some((rule) => {
      const cleaned = s06CleanedContext(rule);
      if (!cleaned.some((el) => deadkeyElementKey(el) === T)) return false;
      if (!rule.output.some((el) => deadkeyElementKey(el) !== null)) {
        return false;
      }
      const isResolution =
        cleaned.length === 2 &&
        deadkeyElementKey(cleaned[0]!) === T &&
        cleaned[1]!.kind === "any" &&
        rule.output.length === 1 &&
        rule.output[0]!.kind === "index";
      const isFallback = cleaned.some((el) => el.kind === "notany");
      return !isResolution && !isFallback;
    });

  // Sub-clusters: {F, T} admitted iff arming + pure edge + resolution +
  // boundedness all hold.
  const subClustersByF = new Map<string, S06SubCluster[]>();
  for (const edge of pureEdges) {
    if (!armingByF.has(edge.F)) continue;
    const resolutions = resolutionsByT.get(edge.T);
    if (resolutions === undefined || resolutions.length === 0) continue;
    if (hasOnwardEdge(edge.T)) continue;
    const list = subClustersByF.get(edge.F) ?? [];
    let sub = list.find((s) => s.tier2Key === edge.T);
    if (sub === undefined) {
      sub = {
        familyKey: edge.F,
        tier2Key: edge.T,
        edges: [],
        resolutions,
      };
      list.push(sub);
      subClustersByF.set(edge.F, list);
    }
    sub.edges.push(edge.rule);
  }

  // Group by F into families (one Pattern per F).
  const families: S06Family[] = [];
  for (const [F, subClusters] of subClustersByF) {
    const tier2Keys = new Set(subClusters.map((s) => s.tier2Key));
    const heads = new Set<string>([F, ...tier2Keys]);

    const tier1DirectResolutions = resolutionsByT.get(F) ?? [];

    // Fallbacks / double-press rules headed by F or T (not required for the
    // claim; owned when present). Double-press is the strict [dk(X), dk(X)]
    // form — the [dk(T), vkey] spelling is the S-02 escape shape and is
    // never claimed here.
    const fallbacks: IRRule[] = [];
    const doublePresses: IRRule[] = [];
    for (const rule of allRules) {
      const cleaned = s06CleanedContext(rule);
      if (cleaned.length !== 2) continue;
      const head = deadkeyElementKey(cleaned[0]!);
      if (head === null || !heads.has(head)) continue;
      if (cleaned.some((el) => el.kind === "notany")) {
        fallbacks.push(rule);
      } else if (
        deadkeyElementKey(cleaned[1]!) === head &&
        rule.output.length === 1 &&
        rule.output[0]!.kind === "char"
      ) {
        doublePresses.push(rule);
      }
    }

    const ownedSet = new Set<string>();
    const own = (rule: IRRule) => {
      if (!isCandidate(rule) || ownedSet.has(rule.nodeId)) return;
      ownedSet.add(rule.nodeId);
    };
    for (const rule of armingByF.get(F) ?? []) own(rule);
    for (const sub of subClusters) {
      for (const rule of sub.edges) own(rule);
      for (const rule of sub.resolutions) own(rule);
    }
    for (const rule of tier1DirectResolutions) own(rule);
    for (const rule of fallbacks) own(rule);
    for (const rule of doublePresses) own(rule);

    // Owned rules in IR order (deterministic Pattern contents).
    const ownedRules = allRules.filter((r) => ownedSet.has(r.nodeId));

    families.push({
      familyKey: F,
      discriminator: deadkeyDiscriminator(F),
      familyDisplay: familyDisplayByKey.get(F) ?? F,
      arming: (armingByF.get(F) ?? []).filter((r) => ownedSet.has(r.nodeId)),
      subClusters,
      tier1DirectResolutions: tier1DirectResolutions.filter((r) =>
        ownedSet.has(r.nodeId),
      ),
      fallbacks: fallbacks.filter((r) => ownedSet.has(r.nodeId)),
      doublePresses: doublePresses.filter((r) => ownedSet.has(r.nodeId)),
      ownedRules,
    });
  }
  return families;
}

import { cpCompare, type NormalizationMap, type OutputRepertoire } from "@keyboard-studio/contracts";

/**
 * Pasted alternate -> produced cluster maps (spec 086 R3).
 *
 * Each produced cluster is its own target; its NFC and NFD forms, where they
 * differ from it, are alternates. An alternate the keyboard itself produces is
 * dropped (FR-005). When one alternate stands for several produced clusters
 * (same NFC, different mark order) the code-point-first cluster is the target
 * and the others are recorded in `ambiguous` (FR-004). Sorted by `from`.
 */
export function buildNormalizationMaps(repertoire: OutputRepertoire): NormalizationMap[] {
  const byAlternate = new Map<string, string[]>();
  for (const c of repertoire.clusters) {
    for (const a of new Set([c.normalize("NFC"), c.normalize("NFD")])) {
      if (a === c || repertoire.clusters.has(a)) continue;
      const list = byAlternate.get(a);
      if (list === undefined) byAlternate.set(a, [c]);
      else list.push(c);
    }
  }
  return [...byAlternate.keys()].sort(cpCompare).map((from) => {
    const targets = (byAlternate.get(from) as string[]).sort(cpCompare);
    const map: NormalizationMap = { from, to: targets[0] as string };
    if (targets.length > 1) map.ambiguous = targets.slice(1);
    return map;
  });
}

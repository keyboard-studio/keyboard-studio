// Assembles the LdmlDocument (FR-020 to FR-025; task T034).
//
// N items are never lowered and M/A items always are (FR-009): the classifier's RulePlans say
// which rules reach this point. This module only places them: the key map from baseFill and
// triggers, the transform groups in call order, the variables, and the document header.

import type { LDMLKeyboard } from "@keymanapp/developer-utils";
import { resolveLangtag } from "../../langtags/index.js";
import type { ClassifyDetail } from "../classify/classify.js";
import { findStore, isGuardElement, type RulePlan } from "../classify/ruleElements.js";
import { layerModifiers } from "../classify/keystrokes.js";
import type { TargetProfile } from "../profiles/types.js";
import type { LdmlExportInput } from "../types.js";
import type { LdmlDocument, LdmlTransform, LdmlTransformGroup } from "../xml/model.js";
import { computeGrid, type Grid } from "./baseFill.js";
import { casedKeys } from "./capsExpand.js";
import { compareCodePoints, resolveIds, resolveMarkerIds, type IdRequest } from "./keyIds.js";
import { FORM_ROWS } from "./positions.js";
import { sortKmcmplibOrder } from "./precedence.js";
import { buildProvenance, type ProvenanceRecord } from "./provenance.js";
import { cellKey, keyIdProposal, partsFromText, partsKey, planTriggers, type Part, ruleParts } from "./triggers.js";
import { escapeOutput, marker, renderRule, type RenderedTransform, type RenderEnv } from "./transforms.js";
import { dkKey } from "../classify/ruleElements.js";

export interface LowerResult {
  doc: LdmlDocument;
  grid: Grid;
  provenance: ProvenanceRecord;
  /** Marker id to the deadkey name it stands for. */
  markers: ReadonlyMap<string, string>;
}

/** `major.minor.patch` from a KMN version (`1.0` gives `1.0.0`; anything else gives `1.0.0`). */
export function normaliseVersion(v: string): string {
  const parts = v.trim().split(".");
  const nums = parts.map((p) => (/^\d+$/.test(p) ? p : null));
  if (parts.length === 0 || nums.some((n) => n === null)) return "1.0.0";
  const [a = "0", b = "0", c = "0"] = nums as string[];
  return `${a}.${b}.${c}`;
}

/** The minimal likely-subtags form of a tag, never containing an extension such as `-k0-`. */
export function minimalLocale(tag: string): string {
  const base = tag.split(/-[a-z]-/i)[0] ?? tag;
  const r = resolveLangtag(base);
  if (r === null) return base;
  const [lang = "", script = "", region = ""] = r.full.split("-");
  const candidates = [lang, region ? `${lang}-${region}` : "", script ? `${lang}-${script}` : "", r.full].filter((c) => c !== "");
  for (const c of candidates) if (resolveLangtag(c)?.full === r.full) return c;
  return r.full;
}

function sanitizeSetId(name: string, used: Map<string, string>): string {
  const key = name.toLowerCase();
  const existing = used.get(key);
  if (existing !== undefined) return existing;
  let id = name.replace(/[^0-9A-Za-z_]/g, (c) => `_${(c.codePointAt(0) ?? 0).toString(16)}_`);
  if (id === "") id = "_";
  const taken = new Set(used.values());
  let n = 2;
  const base = id;
  while (taken.has(id)) id = `${base}_${n++}`;
  used.set(key, id);
  return id;
}

function contextLength(plan: RulePlan): number {
  return plan.pre.filter((e) => !isGuardElement(e)).length;
}

export function lowerDocument(
  input: LdmlExportInput,
  profile: TargetProfile,
  detail: ClassifyDetail,
): LowerResult {
  const { ir, baseLayout } = input;
  const plans = detail.plans;
  const sourceName = `source/${input.keyboardId}.kmn`;
  const store = (name: string) => findStore(ir, name);
  const cased = casedKeys(ir, baseLayout);
  const grid = computeGrid({ plans, baseLayout, form: detail.form, cased, ir });
  const trig = planTriggers(grid, store);

  // --- markers -----------------------------------------------------------------------------------
  const labels = new Map<string, string>();
  const note = (source: string, label: string): void => {
    if (!labels.has(source)) labels.set(source, label);
  };
  for (const p of plans) {
    if (!p.lower) continue;
    for (const el of p.pre) if (el.kind === "deadkey" || el.kind === "namedDeadkey") note(dkKey(el), el.kind === "deadkey" ? `${el.id}` : el.name);
    for (const el of p.rule.output) if (el.kind === "deadkey" || el.kind === "namedDeadkey") note(dkKey(el), el.kind === "deadkey" ? `${el.id}` : el.name);
  }
  const markerSources = new Set<string>([...labels.keys(), ...trig.triggerSources]);
  const markerIds = resolveMarkerIds([...markerSources].sort(compareCodePoints));
  const markerOf = (source: string): string => markerIds.get(source) ?? "_";

  // --- variables ---------------------------------------------------------------------------------
  const setIds = new Map<string, string>();
  const setStores = new Map<string, string>();
  const setVar = (name: string): string => {
    const id = sanitizeSetId(name, setIds);
    setStores.set(id, name);
    return id;
  };
  const env: RenderEnv = { ir, markerId: markerOf, setVar, sourceName };

  // --- transforms: keystroke groups (merged, in call order) -----------------------------------------
  interface Entry {
    t: RenderedTransform;
    triggerKey: string;
    ctxLen: number;
    line: number;
  }
  const entries: Entry[] = [];
  for (const layer of grid.layers) {
    for (const cell of layer.cells) {
      if (cell.ctxRules.length === 0) continue;
      const kind = trig.cells.get(cellKey(layer, cell.vkey));
      if (kind === undefined || kind.kind === "gap") continue;
      const from = kind.kind === "marker" ? marker(markerOf(kind.source)) : partsFromText(kind.parts, markerOf, "from");
      for (const r of cell.ctxRules) {
        for (const t of renderRule(env, r.plan, { from }, r.itemIndex)) {
          entries.push({ t, triggerKey: `${cell.vkey}|${layer.modifiers}`, ctxLen: contextLength(r.plan), line: r.plan.rule.sourceLine ?? 0 });
        }
      }
    }
  }
  const sorted = sortKmcmplibOrder(entries, (e) => ({ triggerKey: e.triggerKey, contextLength: e.ctxLen, sourceLine: e.line }));
  const seen = new Set<string>();
  const mainTransforms: LdmlTransform[] = [];
  for (const e of sorted) {
    const key = `${e.t.transform.from}\u0000${e.t.transform.to ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mainTransforms.push(e.t.transform);
  }
  // Key ids, needed by the catch-all comments.
  const keyIdOf = new Map<string, string>();
  const requests: IdRequest[] = [];
  const keyParts = new Map<string, Part[]>();
  for (const [ck, k] of trig.cells) {
    void ck;
    if (k.kind === "gap") continue;
    const parts: Part[] = k.kind === "text" ? k.parts : [{ t: "marker", source: k.source }];
    const pk = partsKey(parts);
    if (keyParts.has(pk)) continue;
    keyParts.set(pk, parts);
    requests.push({ source: pk, id: keyIdProposal(parts, markerOf) });
  }
  const resolved = resolveIds(requests);
  for (const [pk] of keyParts) keyIdOf.set(pk, resolved.get(pk) as string);

  for (const c of trig.catchAlls) {
    const id = markerOf(c.source);
    const keyId = keyIdOf.get(partsKey([{ t: "marker", source: c.source }])) ?? id;
    const t: LdmlTransform = { from: marker(id), comment: `exporter: trigger catch-all for ${keyId}` };
    const to = partsFromText(c.defaultParts, markerOf, "to");
    if (to !== "") t.to = to;
    mainTransforms.push(t);
  }

  const keyGroupNames = detail.graph.order.filter((g) => g.usingKeys).map((g) => g.name);
  const simpleGroups: LdmlTransformGroup[] = [];
  if (mainTransforms.length > 0) simpleGroups.push({ comment: `KMN group: ${keyGroupNames.join(", ")}`, transform: mainTransforms });

  // --- transforms: context-only groups in call order -------------------------------------------------
  for (const g of detail.graph.order) {
    if (g.usingKeys) continue;
    const rows: Entry[] = [];
    for (const p of plans) {
      if (p.group !== g || !p.lower || p.keystroke !== null || p.rule.matchKind !== undefined) continue;
      for (const t of renderRule(env, p, null, null)) {
        rows.push({ t, triggerKey: "", ctxLen: contextLength(p), line: p.rule.sourceLine ?? 0 });
      }
    }
    const s2 = sortKmcmplibOrder(rows, (e) => ({ triggerKey: "", contextLength: e.ctxLen, sourceLine: e.line }));
    const group: LdmlTransformGroup = { comment: `KMN group: ${g.name}`, transform: s2.map((e) => e.t.transform) };
    if ((group.transform?.length ?? 0) > 0) simpleGroups.push(group);
  }

  // --- backspace transforms ------------------------------------------------------------------------
  const bsRows: Entry[] = [];
  for (const p of plans) {
    if (!p.lower || !p.backspace) continue;
    for (const t of renderRule(env, p, null, null)) bsRows.push({ t, triggerKey: "", ctxLen: contextLength(p), line: p.rule.sourceLine ?? 0 });
  }
  const bsSorted = sortKmcmplibOrder(bsRows, (e) => ({ triggerKey: "", contextLength: e.ctxLen, sourceLine: e.line }));
  const bsTransforms: LdmlTransform[] = [];
  const bsSeen = new Set<string>();
  for (const e of bsSorted) {
    const k = `${e.t.transform.from}\u0000${e.t.transform.to ?? ""}`;
    if (!bsSeen.has(k)) {
      bsSeen.add(k);
      bsTransforms.push(e.t.transform);
    }
  }

  // --- marker legend: original deadkey names, on the first transform that uses each ---------------------
  const legendUnplaced: string[] = [];
  const allTransforms = [...mainTransforms, ...simpleGroups.slice(1).flatMap((g) => g.transform ?? []), ...bsTransforms];
  const markerNames = new Map<string, string>();
  for (const [src, label] of labels) markerNames.set(markerOf(src), label);
  for (const [id, label] of [...markerNames].sort(([a], [b]) => compareCodePoints(a, b))) {
    const needle = marker(id);
    const t = allTransforms.find((x) => (x.from ?? "").includes(needle) || (x.to ?? "").includes(needle));
    const text = `marker ${id} = deadkey ${label}`;
    if (t === undefined) legendUnplaced.push(text);
    else t.comment = `${t.comment ?? ""}; ${text}`;
  }

  // --- keys and layers -----------------------------------------------------------------------------------
  const keyDefs = new Map<string, string>();
  for (const [pk, parts] of keyParts) {
    const id = keyIdOf.get(pk) as string;
    const text = partsFromText(parts, markerOf, "output");
    const implied = parts.length === 1 && parts[0]?.t === "text" && id === keyIdProposal(parts, markerOf) && /^[A-Za-z0-9]$|^ $/.test(parts[0].v);
    if (!implied) keyDefs.set(id, text);
  }
  const rows = FORM_ROWS[grid.form];
  const layers: LDMLKeyboard.LKLayer[] = grid.layers.map((layer) => {
    const byVKey = new Map(layer.cells.map((c) => [c.vkey, c] as const));
    return {
      modifiers: layer.modifiers,
      row: rows.map((cells) => ({
        keys: cells
          .map((cell) => {
            const k = trig.cells.get(cellKey(layer, cell.vkey));
            if (k === undefined || k.kind === "gap" || byVKey.get(cell.vkey) === undefined) return "gap";
            const parts: Part[] = k.kind === "text" ? k.parts : [{ t: "marker", source: k.source }];
            return keyIdOf.get(partsKey(parts)) ?? "gap";
          })
          .join(" "),
      })),
    } as LDMLKeyboard.LKLayer;
  });

  // --- document -------------------------------------------------------------------------------------------
  const meta = input.metadata;
  const langs = meta.languages.map(minimalLocale);
  const locale = langs[0] ?? "und";
  const doc: LdmlDocument = {
    comment: headerComment(input, profile, detail, legendUnplaced),
    xmlns: profile.namespace,
    locale,
    conformsTo: profile.id,
    info: {
      name: meta.name || ir.header.name,
      author: meta.author,
      layout: baseLayout.family,
      ...(meta.indicator ? { indicator: meta.indicator } : {}),
      ...(profile.writeAttribution && meta.attributionText ? { attribution: meta.attributionText } : {}),
    } as LdmlDocument["info"],
    version: { number: normaliseVersion(meta.version || ir.header.version) },
  };
  if (langs.length > 1) doc.locales = langs.slice(1).map((id) => ({ id }));
  if (keyDefs.size > 0) {
    doc.keys = [...keyDefs].sort(([a], [b]) => compareCodePoints(a, b)).map(([id, output]) => ({ id, output }));
  }
  doc.layers = [{ formId: grid.form, layer: layers } as LDMLKeyboard.LKLayers];
  if (setStores.size > 0) {
    doc.variables = {
      set: [...setStores]
        .sort(([a], [b]) => compareCodePoints(a, b))
        .map(([id, name]) => ({
          id,
          value: (store(name)?.items ?? []).map((it) => (it.kind === "char" ? escapeOutput(it.value, true) : "")).join(" "),
        })),
    } as LDMLKeyboard.LKVariables;
  }
  const transforms: NonNullable<LdmlDocument["transforms"]> = [];
  if (simpleGroups.length > 0) transforms.push({ type: "simple", transformGroup: simpleGroups });
  if (bsTransforms.length > 0) {
    transforms.push({ type: "backspace", transformGroup: [{ comment: `KMN group: ${keyGroupNames.join(", ")}`, transform: bsTransforms }] });
  }
  if (transforms.length > 0) doc.transforms = transforms;

  const provenance = buildProvenance(grid, { id: baseLayout.id, source: baseLayout.source });
  void layerModifiers;
  void ruleParts;
  return { doc, grid, provenance, markers: markerNames };
}

const oneLine = (t: string): string => t.replace(/\s+/g, " ").trim().normalize("NFC");

/** `Label: value` pieces joined by three spaces; absent values are left out, and so is an empty line. */
function labelled(pairs: ReadonlyArray<readonly [string, string]>): string | null {
  const parts = pairs.filter(([, v]) => oneLine(v) !== "").map(([k, v]) => `${k}: ${oneLine(v)}`);
  return parts.length === 0 ? null : parts.join("   ");
}

/**
 * The FR-042 documentation comment (contracts/export-package.md). Every value comes from the
 * metadata or the input; there is no timestamp, so the same input always gives the same text.
 */
function headerComment(
  input: LdmlExportInput,
  profile: TargetProfile,
  detail: ClassifyDetail,
  unplaced: readonly string[],
): string {
  const m = input.metadata;
  const name = oneLine(m.name || input.ir.header.name);
  const lines: string[] = [`${name} (${input.keyboardId}) version ${oneLine(m.version || input.ir.header.version)}`];
  if (oneLine(m.description) !== "") lines.push(oneLine(m.description));
  const rights = labelled([["Copyright", m.copyright], ["Licence", m.licenceName]]);
  if (rights !== null) lines.push(rights);
  const who = labelled([["Author", m.author], ["Attribution", m.attributionText], ["Home page", m.homePage]]);
  if (who !== null) lines.push(who);
  lines.push(
    `Exported by Keyboard Studio ${input.studioVersion} under LDML profile ${profile.id} (TR35 ${profile.tr35Revision}).`,
    `Base keyboard resolved against: ${input.baseLayout.label} (${input.baseLayout.id}), chosen by: ${input.baseLayout.source}.`,
    "What did not carry over: LDML-EXPORT-REPORT.md",
  );
  void detail;
  for (const u of unplaced) lines.push(u);
  return lines.join("\n");
}

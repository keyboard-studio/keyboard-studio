/**
 * findOwners -- who produced the nodes a Code-tab change overrides (spec 117 US8, FR-062).
 *
 * A target identical to a `startIr` node has no owner: it is the starting point, not
 * another decision's work. Otherwise the owner comes from markers (`@deadkey` comment
 * tokens and `dk_*` stores -> deadkeys; `rulesStepAdded` / `ownedByBehaviour` -> rules
 * step; `authorEdit`; identity's header stores -> identity), else `another-step`
 * (Assign-tab rules carry no marker, so the label stays honest rather than guessing).
 */

import type {
  IRChange,
  IRComment,
  IRNode,
  IRRule,
  IRStore,
  KeyboardIR,
  OwnerRef,
  StoreValue,
} from "@keyboard-studio/contracts";
import { emitStore } from "../codec/emit.js";
import { canonicalNodeText, isFrag, isRule, locate, sequenceOf } from "./sequence.js";

type Owner = OwnerRef["owner"];

const IDENTITY_STORES = new Set([
  "name",
  "copyright",
  "version",
  "keyboardversion",
  "bcp47",
  "languages",
  "targets",
  "keyboardid",
  "message",
  "bitmap",
]);

function storeText(s: StoreValue | IRStore): string {
  return `${s.isSystem ? "S" : "U"}|${emitStore({ nodeId: "", ...s })}`;
}

function ownerOfStore(s: StoreValue): Owner {
  const name = s.name.toLowerCase();
  if (name.startsWith("dk_")) return "deadkeys";
  if (s.isSystem && IDENTITY_STORES.has(name)) return "identity";
  if (s.rulesStepAdded === true || s.ownedByBehaviour !== undefined) return "rules-step";
  return "another-step";
}

function ownerOfNode(node: IRNode): Owner {
  if (isRule(node)) {
    const r: IRRule = node;
    if (r.trailingComment?.includes("@deadkey")) return "deadkeys";
    if (r.rulesStepAdded === true || r.ownedByBehaviour !== undefined) return "rules-step";
    if (r.authorEdit === "layout-tab") return "layout-tab";
    if (r.authorEdit === "code-tab") return "code-tab";
    return "another-step";
  }
  if (isFrag(node)) return "another-step";
  return (node as IRComment).text.includes("@deadkey") ? "deadkeys" : "another-step";
}

export function findOwners(ir: KeyboardIR, startIr: KeyboardIR, changes: readonly IRChange[]): OwnerRef[] {
  const out: OwnerRef[] = [];
  changes.forEach((c, change) => {
    if (c.change === "remove" || c.change === "replace") {
      const container = c.at.container;
      const usingKeys = container.kind === "group" ? container.usingKeys : false;
      const startTexts = new Set(sequenceOf(startIr, container).map((s) => s.text));
      if (startTexts.has(canonicalNodeText(c.old, usingKeys))) return;
      const seq = sequenceOf(ir, container);
      const idx = locate(seq, c.at);
      const live = idx === undefined || idx < 0 ? c.old : seq[idx]!.node;
      out.push({ change, owner: ownerOfNode(live) });
    } else if (c.change === "remove-store" || (c.change === "set-store" && c.previous !== undefined)) {
      const previous = c.previous!;
      const same = startIr.stores.some(
        (s) => s.name.toLowerCase() === c.name.toLowerCase() && s.isSystem === previous.isSystem && storeText(s) === storeText(previous),
      );
      if (same) return;
      const live = ir.stores.find((s) => s.name.toLowerCase() === c.name.toLowerCase() && s.isSystem === previous.isSystem);
      out.push({ change, owner: ownerOfStore(live ?? previous) });
    }
  });
  return out;
}

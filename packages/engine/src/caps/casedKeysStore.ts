// Write / remove the `&CasedKeys` system store (spec 112, data-model).

import { casedKeysStoreText, storeItemText, type KeyboardIR, type IRStore } from "@keyboard-studio/contracts";

const MIN_VERSION = "14.0";

function findStore(ir: KeyboardIR, name: string): IRStore | undefined {
  const upper = name.toUpperCase();
  return ir.stores.find((s) => s.isSystem && s.name.toUpperCase() === upper);
}

function declaredVersion(ir: KeyboardIR): string | null {
  const store = findStore(ir, "VERSION");
  if (store === undefined) return null;
  return store.items
    .map((i) => storeItemText(i, "?"))
    .join("");
}

/** Absent or empty counts as below; an unparsable value is left alone (never lowered). */
function isBelowMinimum(declared: string | null): boolean {
  const text = (declared ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (text === "") return true;
  const major = Number.parseInt(text.split(".")[0] ?? "", 10);
  return !Number.isNaN(major) && major < 14;
}

/** Write or replace store(&CasedKeys); raise &VERSION to 14.0 when lower. */
export function writeCasedKeysStore(
  ir: KeyboardIR,
  keys: readonly string[],
): { versionRaised: { from: string | null; to: "14.0" } | null } {
  const items = [{ kind: "raw" as const, text: casedKeysStoreText(keys) }];
  const existing = findStore(ir, "CASEDKEYS");
  if (existing !== undefined) existing.items = items;
  else ir.stores.push({ nodeId: "store:CasedKeys", name: "CasedKeys", isSystem: true, items });

  const from = declaredVersion(ir);
  if (!isBelowMinimum(from)) return { versionRaised: null };
  const versionItems = [...MIN_VERSION].map((value) => ({ kind: "char" as const, value }));
  const version = findStore(ir, "VERSION");
  if (version !== undefined) version.items = versionItems;
  else ir.stores.push({ nodeId: "store:VERSION", name: "VERSION", isSystem: true, items: versionItems });
  return { versionRaised: { from, to: MIN_VERSION } };
}

export function removeCasedKeysStore(ir: KeyboardIR): void {
  ir.stores = ir.stores.filter((s) => !(s.isSystem && s.name.toUpperCase() === "CASEDKEYS"));
}

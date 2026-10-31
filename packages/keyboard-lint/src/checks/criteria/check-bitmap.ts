// Check 7.9 — KM_LINT_BITMAP_PLACEHOLDER (spec 084 Batch 1).
//
// `store(&BITMAP)` must reference the actual keyboard .ico, not a
// template placeholder (e.g. `qaa.ico`), and the referenced file must
// exist in the package. Sources: the IR's &BITMAP system store (the
// codec canonicalises it to the store named "BITMAP"; header
// .storeDirectives raw bodies are scanned as a fallback for IRs built
// by other producers), plus the judged VFS inventory for existence.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  baseNameLower,
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

/** Template placeholder bitmap names that ship in starter templates. */
const PLACEHOLDER_BITMAPS: ReadonlySet<string> = new Set(["qaa.ico"]);

/** The &BITMAP reference as a single string, from IR stores or raw directives. */
export function bitmapReference(ir: KeyboardIR): string | undefined {
  for (const store of ir.stores) {
    if (!store.isSystem || store.name.toUpperCase() !== "BITMAP") continue;
    const value = store.items
      .map((item) =>
        item.kind === "char"
          ? item.value
          : item.kind === "raw"
            ? item.text
            : "",
      )
      .join("")
      .trim();
    if (value !== "") return value;
  }
  for (const body of ir.header.storeDirectives) {
    const m = /&?BITMAP\b[^'"]*['"]([^'"]+)['"]/i.exec(body);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/** 7.9 — placeholder bitmap reference, or a referenced .ico absent from the VFS. */
export function checkBitmapPlaceholder(
  ir: KeyboardIR,
  filePaths: readonly string[],
): CheckResult {
  const ref = bitmapReference(ir);
  if (ref === undefined)
    return checkPassed("KM_LINT_BITMAP_PLACEHOLDER", [
      "No store(&BITMAP) reference to check.",
    ]);
  const file = kmnPath(ir.header.keyboardId);
  const base = baseNameLower(ref);
  if (PLACEHOLDER_BITMAPS.has(base)) {
    return checkFailed("KM_LINT_BITMAP_PLACEHOLDER", [
      criteriaFinding({
        code: "KM_LINT_BITMAP_PLACEHOLDER",
        file: file,
        message: `store(&BITMAP) references "${ref}", a template placeholder, not this keyboard's own icon.`,
        hint: "Point &BITMAP at the keyboard's actual .ico file.",
      }),
    ]);
  }
  const present = filePaths.some((p) => baseNameLower(p) === base);
  if (!present) {
    return checkFailed("KM_LINT_BITMAP_PLACEHOLDER", [
      criteriaFinding({
        code: "KM_LINT_BITMAP_PLACEHOLDER",
        file: file,
        message: `store(&BITMAP) references "${ref}", but no such .ico file is in the package.`,
        hint: "Add the referenced .ico to the package, or point &BITMAP at the icon that ships.",
      }),
    ]);
  }
  return checkPassed("KM_LINT_BITMAP_PLACEHOLDER", [
    `store(&BITMAP) references "${ref}", present in the package.`,
  ]);
}

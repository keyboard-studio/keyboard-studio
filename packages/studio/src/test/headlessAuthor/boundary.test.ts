// Boundary test for the headless scripted author (spec 107 FR-013, FR-014,
// FR-016, SC-010).
//
// The author is the product minus React rendering: it may call only what the
// UI calls. This test statically scans every file under headlessAuthor/ and
// fails on a divergence from the product:
//   (a) an import of product code that is not an INVENTORY entry;
//   (b) a mock or spy (vi.mock, vi.doMock, vi.spyOn, vi.stubGlobal);
//   (c) a direct store write outside the one allow-listed reset function;
//   (d) an INVENTORY entry not imported by both its production callers and an
//       author file (the inventory is two-sided).
// It also checks the product side (FR-016): no product file names KS_AUTHOR or
// imports from headlessAuthor/. The depcruise rule
// `product-not-to-headless-author` covers the import half again at lint time.
//
// The scanners are pure functions over (path, text), exercised on synthetic
// sources below (each rule must fire) and then applied once to the real tree.
// Paths are posix and relative to packages/studio/src.
//
// Type-only imports (`import type`, `export type`, inline `type X`) are exempt
// from rule (a): a type carries no behaviour, so it cannot make the author
// diverge from the product.
//
// Rules (a) and (c) skip *.test.ts files (they legitimately import vitest and
// the module under test); rule (b) applies to every file, tests included.
// Detection is textual, not an AST: comments are blanked first, so prose that
// mentions a forbidden call is not a violation.

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INVENTORY,
  REPLAY_MODULES,
  STORE_RESET_ALLOW,
  type InventoryEntry,
} from "./driftGuard.ts";

const here = dirname(fileURLToPath(import.meta.url));
const STUDIO_SRC = resolve(here, "../..");
const PACKAGES = resolve(STUDIO_SRC, "../..");
const HA_PREFIX = "test/headlessAuthor/";

export interface SourceFile {
  /** Studio-src-relative posix path, e.g. `test/headlessAuthor/runAuthorCase.ts`. */
  path: string;
  text: string;
}

export interface Violation {
  path: string;
  line: number;
  rule: string;
  detail: string;
}

const isTestFile = (path: string): boolean => /\.test\.[tj]sx?$/.test(path);

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Blank out comments, keeping every newline and string literal so offsets and
 * line numbers are unchanged. A small state machine: quotes open a string,
 * `//` and block comments are blanked outside strings.
 */
export function stripComments(text: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const c = text[i] as string;
    const n = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\" && n !== undefined) {
        out += n;
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
    } else if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i++;
      }
    } else if (c === "/" && n === "*") {
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
    } else {
      if (c === '"' || c === "'" || c === "`") quote = c;
      out += c;
      i++;
    }
  }
  return out;
}

const lineOf = (text: string, offset: number): number =>
  text.slice(0, offset).split("\n").length;

// ---------------------------------------------------------------------------
// Import parsing and resolution
// ---------------------------------------------------------------------------

export interface ParsedImport {
  line: number;
  specifier: string;
  /** Value-imported names (pre-alias); "default" and "*" for those forms. */
  names: string[];
  /** True when the whole statement is `import type` / `export type`. */
  typeOnly: boolean;
}

/** Parse static `import`/`export ... from` statements and dynamic `import()`. */
export function parseImports(text: string): ParsedImport[] {
  const code = stripComments(text);
  const found: ParsedImport[] = [];

  const stmt =
    /\b(?:import|export)\s+(type\s+)?((?:\*\s*as\s+\w+|[\w$]+)?\s*,?\s*(?:\{[^}]*\})?)\s*from\s*["']([^"']+)["']/g;
  for (const m of code.matchAll(stmt)) {
    const clause = m[2] ?? "";
    const names: string[] = [];
    const braces = /\{([^}]*)\}/.exec(clause);
    const head = clause.replace(/\{[^}]*\}/, "").replace(",", " ").trim();
    if (head.startsWith("*")) names.push("*");
    else if (head) names.push("default");
    if (braces) {
      for (const part of (braces[1] ?? "").split(",")) {
        const p = part.trim();
        if (!p || /^type\s/.test(p)) continue;
        names.push((p.split(/\s+as\s+/)[0] ?? p).trim());
      }
    }
    found.push({
      line: lineOf(code, m.index ?? 0),
      specifier: m[3] as string,
      names,
      typeOnly: Boolean(m[1]),
    });
  }

  const bare = /\bimport\s*["']([^"']+)["']/g;
  for (const m of code.matchAll(bare)) {
    found.push({ line: lineOf(code, m.index ?? 0), specifier: m[1] as string, names: ["*"], typeOnly: false });
  }
  const dynamic = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of code.matchAll(dynamic)) {
    found.push({ line: lineOf(code, m.index ?? 0), specifier: m[1] as string, names: ["*"], typeOnly: false });
  }
  return found;
}

const stripExt = (p: string): string => p.replace(/\.(?:[cm]?[tj]sx?)$/, "");

const PRODUCT_PACKAGES = ["@keyboard-studio/engine", "@keyboard-studio/contracts"];

const isProductPackage = (spec: string): boolean =>
  PRODUCT_PACKAGES.some((p) => spec === p || spec.startsWith(p + "/"));

/**
 * Resolve an import specifier from `fromPath` to the form INVENTORY uses: a
 * studio-src-relative path for a relative specifier, or the specifier itself.
 */
export function resolveSpecifier(fromPath: string, specifier: string): string {
  return specifier.startsWith(".")
    ? posix.normalize(posix.join(posix.dirname(fromPath), specifier))
    : specifier;
}

const sameModule = (resolved: string, module: string): boolean =>
  resolved === module || stripExt(resolved) === stripExt(module);

// ---------------------------------------------------------------------------
// Rule (a): product imports must be inventory entries
// ---------------------------------------------------------------------------

export function checkProductImports(
  file: SourceFile,
  inventory: readonly InventoryEntry[],
  replayModules: readonly string[],
): Violation[] {
  if (isTestFile(file.path)) return [];
  // The per-case reset file reaches the stores' reset actions and nothing
  // else: it may export only the allow-listed function (checkResetFile), and
  // rule (c) already confines its writes to that function.
  if (file.path === STORE_RESET_ALLOW.file) return [];
  const out: Violation[] = [];
  for (const imp of parseImports(file.text)) {
    if (imp.typeOnly) continue;
    const resolved = resolveSpecifier(file.path, imp.specifier);
    // Other src/test modules: only the author's own files and the replay.
    if (imp.specifier.startsWith(".") && resolved.startsWith("test/") && !resolved.startsWith(HA_PREFIX)) {
      if (!replayModules.some((m) => sameModule(resolved, m))) {
        out.push({
          path: file.path,
          line: imp.line,
          rule: "FR-014(a) test import outside the replay modules",
          detail: `"${imp.specifier}" (${resolved}) is not in REPLAY_MODULES`,
        });
      }
      continue;
    }
    const isProduct = imp.specifier.startsWith(".")
      ? !resolved.startsWith("test/") && !resolved.startsWith("..")
      : isProductPackage(imp.specifier);
    if (!isProduct) continue;
    if (replayModules.some((m) => sameModule(resolved, m))) continue;
    for (const name of imp.names) {
      const listed = inventory.some((e) => e.fn === name && sameModule(resolved, e.module));
      if (!listed) {
        out.push({
          path: file.path,
          line: imp.line,
          rule: "FR-014(a) product import not in INVENTORY",
          detail: `\`${name}\` from "${imp.specifier}" (${resolved}); the author calls only what the UI calls`,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule (b): no mocks, spies or stubs anywhere
// ---------------------------------------------------------------------------

const MOCK_CALL = /\bvi\s*\.\s*(mock|doMock|spyOn|stubGlobal)\b/g;

export function checkNoMocks(file: SourceFile): Violation[] {
  const code = stripComments(file.text);
  return [...code.matchAll(MOCK_CALL)].map((m) => ({
    path: file.path,
    line: lineOf(code, m.index ?? 0),
    rule: "FR-014(b) mock/spy in author code",
    detail: `vi.${m[1]} (the author path mocks nothing)`,
  }));
}

// ---------------------------------------------------------------------------
// Rule (c): no direct store writes outside the allow-listed reset
// ---------------------------------------------------------------------------

const SET_STATE = /\bsetState\s*\(/g;
// getState() followed by a member/index chain and an assignment operator
// (`=`, `+=`, `||=`, ...) but not a comparison (`==`, `=>`).
const GET_STATE_ASSIGN =
  /\bgetState\s*\(\s*\)\s*(?:\??\.[\w$]+|\[[^\]]*\])+\s*(?:[-+*/%&|^?]{0,2}<{0,2}>{0,3}=)(?![=>])/g;

/**
 * Offset range of the body of the named function (`function name` or
 * `const name =`), from its first `{` to the matching `}`; null if absent.
 */
export function functionRange(code: string, fn: string): [number, number] | null {
  const decl = new RegExp(`(?:function\\s+${fn}\\b|(?:const|let)\\s+${fn}\\s*[:=])`).exec(code);
  if (!decl) return null;
  const open = code.indexOf("{", decl.index + decl[0].length);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return [open, i];
  }
  return null;
}

export function checkStoreWrites(
  file: SourceFile,
  allow: { file: string; fn: string },
): Violation[] {
  if (isTestFile(file.path)) return [];
  const code = stripComments(file.text);
  const range = file.path === allow.file ? functionRange(code, allow.fn) : null;
  const out: Violation[] = [];
  for (const [re, what] of [
    [SET_STATE, "setState("],
    [GET_STATE_ASSIGN, "assignment through getState()"],
  ] as const) {
    for (const m of code.matchAll(re)) {
      const at = m.index ?? 0;
      if (range && at >= range[0] && at <= range[1]) continue;
      out.push({
        path: file.path,
        line: lineOf(code, at),
        rule: "FR-014(c) direct store write",
        detail: `${what} outside ${allow.file}:${allow.fn}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule (d): the inventory is two-sided
// ---------------------------------------------------------------------------

const importsValue = (file: SourceFile, entry: InventoryEntry): boolean =>
  parseImports(file.text).some(
    (imp) =>
      !imp.typeOnly &&
      imp.names.includes(entry.fn) &&
      sameModule(resolveSpecifier(file.path, imp.specifier), entry.module),
  );

export function checkInventory(
  inventory: readonly InventoryEntry[],
  haFiles: readonly SourceFile[],
  readCaller: (path: string) => SourceFile | undefined,
): Violation[] {
  const out: Violation[] = [];
  const drivers = haFiles.filter((f) => !isTestFile(f.path));
  for (const entry of inventory) {
    const label = `${entry.fn} from ${entry.module}`;
    if (entry.callers.length === 0) {
      // A composite no production file names (a hook memoizes its pieces) is
      // admitted only with a test proving it equal to that hook.
      const proof = entry.provenBy === undefined ? undefined : readCaller(entry.provenBy);
      if (proof === undefined || !importsValue(proof, entry)) {
        out.push({
          path: "test/headlessAuthor/driftGuard.ts",
          line: 1,
          rule: "FR-014(d) inventory entry has no production caller",
          detail: entry.provenBy === undefined ? label : `${label}: provenBy ${entry.provenBy} missing or does not import it`,
        });
      }
    }
    for (const callerPath of entry.callers) {
      const caller = readCaller(callerPath);
      if (!caller) {
        out.push({ path: callerPath, line: 1, rule: "FR-014(d) production caller missing", detail: `${label}: caller file not found` });
      } else if (!importsValue(caller, entry)) {
        out.push({ path: callerPath, line: 1, rule: "FR-014(d) production caller does not import the entry", detail: label });
      }
    }
    if (!drivers.some((f) => importsValue(f, entry))) {
      out.push({ path: "test/headlessAuthor/driftGuard.ts", line: 1, rule: "FR-014(d) no author file imports the entry", detail: label });
    }
  }
  return out;
}

/** The reset file exports exactly the allow-listed function. */
export function checkResetFile(file: SourceFile, allow: { file: string; fn: string }): Violation[] {
  if (file.path !== allow.file) return [];
  const code = stripComments(file.text);
  const exported = [...code.matchAll(/\bexport\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/g)].map((m) => m[1]);
  return exported.length === 1 && exported[0] === allow.fn
    ? []
    : [{
        path: file.path,
        line: 1,
        rule: "FR-014(c) reset file exports more than the reset",
        detail: `exports [${exported.join(", ")}], expected [${allow.fn}]`,
      }];
}

// ---------------------------------------------------------------------------
// FR-016: product code does not know the author exists
// ---------------------------------------------------------------------------

export function checkProductIgnorance(file: SourceFile): Violation[] {
  const out: Violation[] = [];
  const hit = file.text.indexOf("KS_AUTHOR");
  if (hit >= 0) {
    out.push({ path: file.path, line: lineOf(file.text, hit), rule: "FR-016 product file reads a KS_AUTHOR flag", detail: "KS_AUTHOR" });
  }
  for (const imp of parseImports(file.text)) {
    if (imp.specifier.includes("headlessAuthor")) {
      out.push({ path: file.path, line: imp.line, rule: "FR-016 product file imports the headless author", detail: imp.specifier });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Real-tree loading
// ---------------------------------------------------------------------------

function walk(dir: string, accept: (abs: string) => boolean, skipDir: (abs: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "node_modules" && !skipDir(abs)) out.push(...walk(abs, accept, skipDir));
    } else if (accept(abs)) {
      out.push(abs);
    }
  }
  return out;
}

const readSource = (abs: string, base: string): SourceFile => ({
  path: relative(base, abs).split("\\").join("/"),
  text: readFileSync(abs, "utf8"),
});

const format = (v: Violation[]): string[] =>
  v.map((x) => `${x.path}:${x.line} [${x.rule}] ${x.detail}`);

// ---------------------------------------------------------------------------
// Self-tests: each rule fires on a synthetic source (spec 107 SC-010)
// ---------------------------------------------------------------------------

// Synthetic sources are assembled from fragments so this file's own text never
// contains a forbidden call or import statement for the real-tree scan to find.
const IMPORT = "imp" + "ort";
const MOCK = "vi" + ".mock";
const SET = "use" + "Store.set" + "State";
const imp = (names: string, from: string, type = ""): string => `${IMPORT} ${type}{ ${names} } from "${from}";\n`;

const ENTRY: InventoryEntry = {
  fn: "proposeWindowsLayout",
  module: "lib/windowsLayouts.ts",
  callers: ["steps/WindowsLayoutStep.tsx"],
};

describe("boundary scanner self-tests", () => {
  it("rule (a): flags a product import that is not inventoried", () => {
    const file = { path: `${HA_PREFIX}stepDrivers/x.ts`, text: imp("proposeWindowsLayout", "../../../lib/windowsLayouts.ts") };
    const v = checkProductImports(file, [], REPLAY_MODULES);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ line: 1, rule: expect.stringContaining("FR-014(a)") });
    expect(v[0]?.path).toBe(file.path);
  });

  it("rule (a): flags engine and contracts imports, including subpaths", () => {
    const text = imp("scaffold", "@keyboard-studio/engine") + imp("X", "@keyboard-studio/contracts/data");
    const v = checkProductImports({ path: `${HA_PREFIX}a.ts`, text }, [], REPLAY_MODULES);
    expect(v.map((x) => x.line)).toEqual([1, 2]);
  });

  it("rule (a): allows inventoried, type-only, replay, author, vitest and node imports", () => {
    const ok = [
      imp("proposeWindowsLayout", "../../../lib/windowsLayouts"),
      imp("Pattern", "@keyboard-studio/contracts", "type "),
      `${IMPORT} { type Pattern, type Foo } from "@keyboard-studio/contracts";\n`,
      `export type { Pattern } from "@keyboard-studio/contracts";\n`,
      imp("decisionPointFixture", "../../decisionPointFixture.ts"),
      imp("INVENTORY", "../driftGuard.ts"),
      imp("it", "vitest"),
      imp("readFileSync", "node:fs"),
    ].join("");
    const v = checkProductImports({ path: `${HA_PREFIX}stepDrivers/x.ts`, text: ok }, [ENTRY], REPLAY_MODULES);
    expect(v).toEqual([]);
  });

  it("rule (a): an inventoried name from the wrong module still fails", () => {
    const file = { path: `${HA_PREFIX}x.ts`, text: imp("proposeWindowsLayout", "../../lib/other.ts") };
    expect(checkProductImports(file, [ENTRY], REPLAY_MODULES)).toHaveLength(1);
  });

  it("rule (a): ignores prose in comments", () => {
    const text = `// ${IMPORT} { scaffold } from "@keyboard-studio/engine";\n`;
    expect(checkProductImports({ path: `${HA_PREFIX}x.ts`, text }, [], REPLAY_MODULES)).toEqual([]);
  });

  it("rule (b): flags mock, doMock, spyOn and stubGlobal calls, in test files too", () => {
    const text = ["mock", "doMock", "spyOn", "stubGlobal"].map((m) => `vi.${m}("x");\n`).join("");
    const v = checkNoMocks({ path: `${HA_PREFIX}x.test.ts`, text });
    expect(v.map((x) => x.line)).toEqual([1, 2, 3, 4]);
    expect(v[0]?.rule).toContain("FR-014(b)");
    expect(checkNoMocks({ path: `${HA_PREFIX}x.ts`, text: `// ${MOCK}("x")\n` })).toEqual([]);
  });

  it("rule (c): flags setState and an assignment through getState()", () => {
    const text = `${SET}({ a: 1 });\nuseStore.getState().decisions.x = 2;\nconst y = useStore.getState().x === 1;\n`;
    const v = checkStoreWrites({ path: `${HA_PREFIX}x.ts`, text }, STORE_RESET_ALLOW);
    expect(v.map((x) => x.line)).toEqual([1, 2]);
    expect(v[0]?.rule).toContain("FR-014(c)");
  });

  it("rule (c): allows writes only inside the named reset function in its file", () => {
    const body = `function ${STORE_RESET_ALLOW.fn}() {\n  if (x) { ${SET}({}); }\n  s.getState().a = 1;\n}\n`;
    const inFile = { path: STORE_RESET_ALLOW.file, text: body };
    expect(checkStoreWrites(inFile, STORE_RESET_ALLOW)).toEqual([]);
    const after = { path: STORE_RESET_ALLOW.file, text: body + `function other() { ${SET}({}); }\n` };
    expect(checkStoreWrites(after, STORE_RESET_ALLOW).map((x) => x.line)).toEqual([5]);
    expect(checkStoreWrites({ path: `${HA_PREFIX}other.ts`, text: body }, STORE_RESET_ALLOW)).toHaveLength(2);
  });

  it("rule (d): flags an entry its production caller or every author file omits", () => {
    const driver = { path: `${HA_PREFIX}stepDrivers/x.ts`, text: imp("proposeWindowsLayout", "../../../lib/windowsLayouts.ts") };
    const caller = { path: ENTRY.callers[0] as string, text: imp("proposeWindowsLayout", "../lib/windowsLayouts.ts") };
    const read = (p: string): SourceFile | undefined => (p === caller.path ? caller : undefined);
    expect(checkInventory([ENTRY], [driver], read)).toEqual([]);

    const pasted = { path: driver.path, text: "function proposeWindowsLayout() {}\n" };
    expect(checkInventory([ENTRY], [pasted], read).map((x) => x.rule)).toEqual([
      expect.stringContaining("no author file imports"),
    ]);
    const bareCaller = { path: caller.path, text: "const x = 1;\n" };
    expect(checkInventory([ENTRY], [driver], () => bareCaller).map((x) => x.rule)).toEqual([
      expect.stringContaining("production caller does not import"),
    ]);
    expect(checkInventory([ENTRY], [driver], () => undefined)[0]?.rule).toContain("caller missing");
  });

  it("FR-016: flags a KS_AUTHOR read and an import of the author in product code", () => {
    const v = checkProductIgnorance({
      path: "lib/x.ts",
      text: `${imp("run", "../test/headlessAuthor/runAuthorCase.ts")}const f = process.env.KS_AUTHOR_MODE;\n`,
    });
    expect(v.map((x) => x.line).sort()).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// The real tree
// ---------------------------------------------------------------------------

describe("headless author boundary (FR-013, FR-014)", () => {
  const haDir = join(STUDIO_SRC, "test", "headlessAuthor");
  const haFiles = walk(haDir, (a) => /\.[tj]sx?$/.test(a), () => false).map((a) => readSource(a, STUDIO_SRC));

  it("scans the author files", () => {
    expect(haFiles.length).toBeGreaterThan(0);
    expect(haFiles.every((f) => f.path.startsWith(HA_PREFIX))).toBe(true);
  });

  it("imports only inventoried product functions (rule a)", () => {
    const v = haFiles.flatMap((f) => checkProductImports(f, INVENTORY, REPLAY_MODULES));
    expect(format(v)).toEqual([]);
  });

  it("mocks and spies nothing (rule b)", () => {
    expect(format(haFiles.flatMap(checkNoMocks))).toEqual([]);
  });

  it("writes no store outside the allow-listed reset (rule c)", () => {
    expect(format(haFiles.flatMap((f) => checkStoreWrites(f, STORE_RESET_ALLOW)))).toEqual([]);
    expect(format(haFiles.flatMap((f) => checkResetFile(f, STORE_RESET_ALLOW)))).toEqual([]);
  });

  it("keeps the inventory two-sided (rule d)", () => {
    const read = (p: string): SourceFile | undefined => {
      const abs = join(STUDIO_SRC, p);
      return existsSync(abs) ? readSource(abs, STUDIO_SRC) : undefined;
    };
    expect(format(checkInventory(INVENTORY, haFiles, read))).toEqual([]);
  });
});

describe("product code does not know the author exists (FR-016)", () => {
  it("no product file reads KS_AUTHOR or imports headlessAuthor", () => {
    const pkgDirs = readdirSync(PACKAGES)
      .map((n) => join(PACKAGES, n, "src"))
      .filter((d) => existsSync(d) && statSync(d).isDirectory());
    const v: Violation[] = [];
    for (const src of pkgDirs) {
      const files = walk(
        src,
        (a) => /\.tsx?$/.test(a) && !/\.test\.tsx?$/.test(a),
        (d) => relative(src, d).split("\\").join("/") === "test",
      );
      for (const abs of files) v.push(...checkProductIgnorance(readSource(abs, PACKAGES)));
    }
    expect(format(v)).toEqual([]);
  });
});

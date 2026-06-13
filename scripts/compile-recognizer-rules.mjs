#!/usr/bin/env node
/**
 * Compiles content/recognizer-rules/*.yaml into TypeScript rule modules.
 *
 * Output:
 *   packages/engine/src/recognizer/rules/generated/<id>.ts   (one per YAML file)
 *   packages/engine/src/recognizer/rules/generated/index.ts  (barrel)
 *
 * Exits with code 1 if any YAML file is missing required top-level fields.
 * Skips (with a warning) any file whose strategyId is outside [S-01, S-02, S-08].
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// yaml is a dep of packages/engine; resolve it from there so this script works
// whether or not the root node_modules has been hoisted.
const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'engine', 'package.json'),
);
const { parse: parseYaml } = require('yaml');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RULES_DIR = join(ROOT, 'content', 'recognizer-rules');
const OUT_DIR = join(ROOT, 'packages', 'engine', 'src', 'recognizer', 'rules', 'generated');

const SUPPORTED_STRATEGIES = new Set(['S-01', 'S-02', 'S-08']);
const REQUIRED_FIELDS = ['id', 'strategyId', 'predicate', 'lifts_to'];

mkdirSync(OUT_DIR, { recursive: true });

// Collect .yaml files
const yamlFiles = readdirSync(RULES_DIR)
  .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  .sort();

if (yamlFiles.length === 0) {
  console.log('[OK] No recognizer-rule YAML files found — nothing to compile.');
  process.exit(0);
}

const generated = [];

for (const filename of yamlFiles) {
  const filePath = join(RULES_DIR, filename);
  const source = readFileSync(filePath, 'utf8');

  let parsed;
  try {
    parsed = parseYaml(source);
  } catch (err) {
    console.error(`[ERROR] ${filename}: YAML parse error — ${err.message}`);
    process.exit(1);
  }

  if (parsed === null || typeof parsed !== 'object') {
    console.error(`[ERROR] ${filename}: empty or non-object YAML`);
    process.exit(1);
  }

  // Validate required top-level fields
  for (const field of REQUIRED_FIELDS) {
    if (parsed[field] === undefined || parsed[field] === null) {
      console.error(`[ERROR] ${filename}: missing required field "${field}"`);
      process.exit(1);
    }
  }

  const { id: rawId, strategyId } = parsed;
  // Normalize to kebab-case so generated rule ids match hand-written convention
  const id = rawId.replace(/_/g, '-');

  // Gate check: only emit for supported strategies
  if (!SUPPORTED_STRATEGIES.has(strategyId)) {
    console.warn(`[WARN] ${filename}: strategyId "${strategyId}" is not in [S-01, S-02, S-08] — skipping`);
    continue;
  }

  // Emit generated TypeScript file
  const outFile = join(OUT_DIR, `${rawId}.ts`);
  const ruleDef = JSON.stringify(parsed, null, 2);

  const ts = `// generated — do not edit; source: content/recognizer-rules/${filename}
import type { RecognizerRule } from "../../types.js";
import { interpretPredicate, interpretLift } from "../../interpreter.js";
import type { RecognizerRuleYaml } from "../../yaml-schema.js";

const RULE_DEF = ${ruleDef} satisfies RecognizerRuleYaml;

export const rule: RecognizerRule = {
  id: "${id}",
  strategyId: "${strategyId}",
  match: (ir) => interpretPredicate(RULE_DEF, ir),
  lift: (m) => interpretLift(RULE_DEF, m),
};
`;

  // Only write when content differs to avoid spurious git diffs
  let existing = '';
  try { existing = readFileSync(outFile, 'utf8'); } catch { /* file does not exist yet */ }
  if (existing === ts) {
    console.log(`[OK] Unchanged ${outFile}`);
  } else {
    writeFileSync(outFile, ts, 'utf8');
    console.log(`[OK] Generated ${outFile}`);
  }
  generated.push({ id, rawId, filename });
}

// Emit barrel
const barrelLines = [
  '// generated — do not edit',
  ...generated.map(({ rawId }) => {
    // rawId (snake_case) -> camelCase export alias: "simple_swap" -> "simpleSwapRule"
    const camel = rawId.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return `export { rule as ${camel}Rule } from "./${rawId}.js";`;
  }),
];

const barrelPath = join(OUT_DIR, 'index.ts');
const barrelContent = barrelLines.join('\n') + '\n';
let existingBarrel = '';
try { existingBarrel = readFileSync(barrelPath, 'utf8'); } catch { /* file does not exist yet */ }
if (existingBarrel === barrelContent) {
  console.log(`[OK] Unchanged ${barrelPath}`);
} else {
  writeFileSync(barrelPath, barrelContent, 'utf8');
  console.log(`[OK] Barrel: ${barrelPath}`);
}

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

  const { id, strategyId } = parsed;

  // Gate check: only emit for supported strategies
  if (!SUPPORTED_STRATEGIES.has(strategyId)) {
    console.warn(`[WARN] ${filename}: strategyId "${strategyId}" is not in [S-01, S-02, S-08] — skipping`);
    continue;
  }

  // Emit generated TypeScript file
  const outFile = join(OUT_DIR, `${id}.ts`);
  const ruleDef = JSON.stringify(parsed, null, 2);

  const ts = `// generated — do not edit; source: content/recognizer-rules/${filename}
import type { RecognizerRule } from "../../types.js";
import { interpretPredicate, interpretLift } from "../../interpreter.js";
import type { RecognizerRuleYaml } from "../../yaml-schema.js";

const RULE_DEF = ${ruleDef} as RecognizerRuleYaml;

export const rule: RecognizerRule = {
  id: "${id}",
  strategyId: "${strategyId}",
  match: (ir) => interpretPredicate(RULE_DEF, ir),
  lift: (m) => interpretLift(RULE_DEF, m),
};
`;

  writeFileSync(outFile, ts, 'utf8');
  console.log(`[OK] Generated ${outFile}`);
  generated.push({ id, filename });
}

// Emit barrel
const barrelLines = [
  '// generated — do not edit',
  ...generated.map(({ id }) => {
    // id -> camelCase: e.g. "simple_swap" -> "simpleSwap", "deadkey_single_tap" -> "deadkeySingleTap"
    const camel = id.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return `export { rule as ${camel}Rule } from "./${id}.js";`;
  }),
];

const barrelPath = join(OUT_DIR, 'index.ts');
writeFileSync(barrelPath, barrelLines.join('\n') + '\n', 'utf8');
console.log(`[OK] Barrel: ${barrelPath}`);

#!/usr/bin/env -S npx tsx
// kbgen -- logic-driven keyboard character placement engine (milestone 1: Latin-extended).
//
// Produces an explicit PLACEMENT MAPPING (physical + touch: which key, which method) from
// objective Unicode/CLDR signals, and proves the result is lossless. It does NOT build or
// compile -- a downstream process consumes the mapping for that. Source-file generation is
// available behind --emit-source for inspection, but is still never compiled here.
//
// Usage:
//   # derive everything from a CLDR locale:
//   npx tsx utilities/kbgen/cli.ts --id hausa --name "Hausa" --locale ha --out ./out/hausa
//
//   # or specify the inventory explicitly:
//   npx tsx utilities/kbgen/cli.ts --id demo --chars "ɓƁɗƊƙƘ" --used "abcd...z" --out ./out/demo
//
// Options:
//   --id <slug>        keyboard id (filenames). Required.
//   --name <str>       display name. Defaults to --id.
//   --locale <bcp47>   CLDR locale; derives used letters (-> free keys) and, if --chars is
//                      omitted, the special inventory from the locale's exemplar characters.
//   --chars <str>      explicit inventory of special output characters (overrides locale).
//   --chars-file <p>   read --chars from a UTF-8 file.
//   --used <str>       explicit base letters the orthography uses (overrides locale).
//   --base <id>        base layout (default "us").
//   --out <dir>        output directory (default ./<id>). Mapping is written under source/.
//   --free-swap        relocate occupied-anchor specials onto free keys (convenience route).
//   --emit-source      ALSO write .kmn/.keyman-touch-layout/.kvks (not compiled).
//   --corpus <path>    a .keyman-touch-layout to diff against (diagnostic only).
//   --dry-run          print the mapping, write nothing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLayout } from './layout.ts';
import { availability } from './analyze.ts';
import { plan, checkComplete } from './place.ts';
import { build, format } from './map.ts';
import { loadExemplars } from './sources/cldr.ts';
import { emitKmn, emitTouch, emitKvks } from './emit.ts';
import { extractCorpus, diff } from './corpus-diff.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CliOptions {
  base: string;
  font: string;
  id?: string;
  name?: string;
  locale?: string;
  chars?: string;
  'chars-file'?: string;
  used?: string;
  'used-file'?: string;
  out?: string;
  freeSwap?: boolean;
  emitSource?: boolean;
  dryRun?: boolean;
  corpus?: string;
  copyright?: string;
  version?: string;
  [key: string]: unknown;
}

function parseArgs(argv: string[]): CliOptions {
  const o: CliOptions = { base: 'us', font: 'Tahoma' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--free-swap') {
      o.freeSwap = true;
    } else if (a === '--emit-source') {
      o.emitSource = true;
    } else if (a === '--dry-run') {
      o.dryRun = true;
    } else if (a.startsWith('--')) {
      o[a.slice(2)] = argv[++i];
    }
  }
  return o;
}
const fail = (m: string): never => { console.error('error: ' + m); process.exit(1); };

interface SourceVersions {
  unicodeVersion?: string;
  cldrVersion?: string;
}

function sourceVersions(): SourceVersions {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'SOURCES.json'), 'utf8')) as SourceVersions; }
  catch { return {}; }
}

function main() {
  const o = parseArgs(process.argv);
  if (!o.id) fail('--id is required');
  o.name = o.name || o.id;

  const layout = getLayout(o.base);

  // Resolve inventory + used letters: explicit flags win; otherwise derive from CLDR.
  let chars: string[] | null = null;
  let used: string[] | null = null;

  if (o.locale) {
    const exemplars = loadExemplars(o.locale);
    if (!exemplars) return fail(`no CLDR exemplar data for locale "${o.locale}" -- fetch it (npx tsx fetch-data.ts ${o.locale}) or pass --chars/--used`);
    used = [...exemplars.used];
    chars = exemplars.specials;
  }

  if (o.chars) chars = [...o.chars];
  if (o['chars-file']) chars = [...fs.readFileSync(o['chars-file'], 'utf8').replace(/\s+/g, '')];
  if (o.used) used = [...o.used.replace(/\s+/g, '')];
  if (o['used-file']) used = [...fs.readFileSync(o['used-file'], 'utf8').replace(/\s+/g, '')];

  if (!chars || !chars.length) fail('need a special-character inventory: pass --locale, --chars, or --chars-file');
  if (!used) used = [..."abcdefghijklmnopqrstuvwxyz"]; // all occupied -> everything on RALT (safe)

  const free = availability(layout, used);
  const planResult = plan(chars!, layout, free, { freeSwap: !!o.freeSwap });
  // Completeness gates on the hard invariant (no base letter lost) plus the specials we
  // actually placed. Unplaced specials are reported separately as manual decisions.
  const placedChars = planResult.placements.map((p) => p.ch);
  const completeness = checkComplete(planResult, layout, placedChars);

  const src = sourceVersions();
  const map = build(planResult, layout, {
    id: o.id!, name: o.name!, completeness, freeKeys: [...free],
    source: { locale: o.locale || null, unicodeVersion: src.unicodeVersion || null, cldrVersion: src.cldrVersion || null },
  });

  console.log(format(map));

  if (o.corpus) {
    console.log(`\nCorpus diff vs ${o.corpus} (diagnostic, non-authoritative):`);
    const corpus = extractCorpus(o.corpus, layout);
    for (const r of diff(planResult.placements, corpus)) {
      const mark = r.agree === null ? '?' : (r.agree ? '=' : '≠');
      console.log(`   ${mark} ${r.ch}  engine=${r.engineKey}/${r.engineVia}  corpus=${r.corpusKey}${r.corpusMech ? '/' + r.corpusMech : ''}`);
    }
  }

  if (o.dryRun) { console.log('\n(dry run -- nothing written)\n'); return; }

  const srcDir = path.join(path.resolve(o.out || o.id!), 'source');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, `${o.id}.placement-map.json`), JSON.stringify(map, null, 2) + '\n');
  let wrote = [`${o.id}.placement-map.json`];

  if (o.emitSource) {
    const meta = { id: o.id!, name: o.name!, font: o.font, copyright: o.copyright, version: o.version };
    fs.writeFileSync(path.join(srcDir, `${o.id}.kmn`), emitKmn(planResult, layout, meta));
    fs.writeFileSync(path.join(srcDir, `${o.id}.keyman-touch-layout`), emitTouch(planResult, layout, meta));
    fs.writeFileSync(path.join(srcDir, `${o.id}.kvks`), emitKvks(planResult, layout, meta));
    wrote.push(`${o.id}.kmn`, `${o.id}.keyman-touch-layout`, `${o.id}.kvks`);
  }
  console.log(`\nWrote ${wrote.join(', ')} to ${srcDir}\n`);
}

main();

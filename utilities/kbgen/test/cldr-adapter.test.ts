// The sources/cldr.ts adapter over the engine's pinned CLDR+SLDR exemplar index,
// plus the two CLI paths that depend on it. These exist because kbgen's former
// local parseUnicodeSet copy carried real defects (\uXXXX read as literal ASCII,
// set subtraction mangled) that nothing here exercised.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExemplars, exemplarIndexVersion } from '../sources/cldr.ts';

const kbgenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runCli(args: string[]) {
  const r = spawnSync('npx', ['tsx', 'cli.ts', ...args], {
    cwd: kbgenDir,
    encoding: 'utf8',
    shell: true,
    timeout: 120_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('sources/cldr.ts adapter', () => {
  it('resolves Hausa through the engine index with uppercase pairs derived', async () => {
    const r = await loadExemplars('ha');
    expect(r).not.toBeNull();
    // Hausa hooked letters, lowercase attested by the source ...
    expect(r!.specials).toEqual(expect.arrayContaining(['ɓ', 'ɗ', 'ƙ', 'ƴ']));
    // ... uppercase pairs added by the engine's consumer-side derivation, not by kbgen.
    expect(r!.specials).toEqual(expect.arrayContaining(['Ɓ', 'Ɗ', 'Ƙ', 'Ƴ']));
    // Base letters the orthography uses feed the free-key computation.
    expect([...r!.used]).toEqual(expect.arrayContaining(['a', 'b', 'k']));
    // Specials are NFC, never raw escape text from the UnicodeSet.
    for (const ch of r!.specials) expect(ch).not.toMatch(/^[u0-9A-Fa-f\{}]$/);
  });

  it('returns null for a tag the index does not cover', async () => {
    expect(await loadExemplars('xx-XX')).toBeNull();
  });

  it('surfaces the index pins for placement-map provenance', async () => {
    const v = await exemplarIndexVersion();
    expect(v.cldr).toMatch(/^\d+\.\d+(\.\d+)?$/);
    expect(v.sldrCommit).toMatch(/^[0-9a-f]{7,40}$/);
  });
});

// Each case spawns `npx tsx cli.ts`, which loads the engine index; allow well past
// the 5 s default.
const CLI_TIMEOUT_MS = 120_000;

describe('cli.ts locale paths', () => {
  it('fails with the error convention for an uncovered --locale', () => {
    const r = runCli(['--id', 't', '--locale', 'xx-XX', '--dry-run']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^error: no exemplar data for locale "xx-XX"/m);
    expect(r.stderr).not.toMatch(/at .*\.ts:\d+/); // no raw stack trace
  }, CLI_TIMEOUT_MS);

  it('records index provenance on a --locale run', () => {
    const r = runCli(['--id', 'hausa', '--locale', 'ha', '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/source: locale=ha\s+unicode=\S+\s+cldr=\d+\.\d+\S*\s+sldr=[0-9a-f]{7,}/);
  }, CLI_TIMEOUT_MS);

  it('still succeeds for a --chars-only run that never touches CLDR', () => {
    const r = runCli(['--id', 'demo', '--chars', 'ɓƁ', '--used', 'abc', '--dry-run']);
    expect(r.status).toBe(0);
  }, CLI_TIMEOUT_MS);
});

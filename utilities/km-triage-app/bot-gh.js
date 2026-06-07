#!/usr/bin/env node
// bot-gh.js — gh wrapper that authenticates as km-triage[bot].
//
// Mints a fresh installation token (via mint-token.js) and exec's `gh` with
// GH_TOKEN set, so every call gets a fresh ~1-hour token without any
// cross-Bash-invocation state. Cross-platform: works identically in bash,
// PowerShell, and any Node-aware shell.
//
// Usage (drop-in replacement for `gh` whenever the call should be attributed
// to km-triage[bot] — reviews, PR comments, label adds on PRs):
//
//   node utilities/km-triage-app/bot-gh.js pr review <NUM> --approve --body-file <path>
//   node utilities/km-triage-app/bot-gh.js pr comment <NUM> --body-file <path>
//   node utilities/km-triage-app/bot-gh.js api repos/.../issues/<NUM>/labels -X POST -f "labels[]=<label>"
//
// Exit code mirrors the underlying gh call (or the mint script if mint fails).

const { spawnSync } = require('child_process');
const path = require('path');

const mintPath = path.join(__dirname, 'mint-token.js');
const minted = spawnSync(process.execPath, [mintPath], { encoding: 'utf8' });
if (minted.status !== 0) {
  process.stderr.write(minted.stderr || '[bot-gh] mint-token.js failed with no stderr\n');
  process.exit(minted.status || 1);
}
const token = (minted.stdout || '').trim();
if (!token) {
  process.stderr.write('[bot-gh] mint-token.js returned empty stdout\n');
  process.exit(1);
}

const ghArgs = process.argv.slice(2);
const result = spawnSync('gh', ghArgs, {
  env: { ...process.env, GH_TOKEN: token },
  stdio: 'inherit',
  shell: process.platform === 'win32', // resolve gh.exe / gh.cmd on Windows PATH
});

if (result.error) {
  process.stderr.write(`[bot-gh] failed to spawn gh: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);

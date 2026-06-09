#!/usr/bin/env node
'use strict';

/**
 * spec-trace — detects drift between spec.md sections and the
 * acknowledged hashes stored in docs/spec-trace.json.
 *
 * Subcommands:
 *   seed                      initialise / refresh hashes (run once, then commit)
 *   check [--dry-run]         detect drift; create GitHub Issues when GITHUB_TOKEN set
 *   report                    print coverage + unacknowledged drift summary
 *   acknowledge <section-id>  accept a reviewed section, update its hash
 *
 * Never exits non-zero — drift is a warning, not a build failure.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SPEC_FILE = path.join(REPO_ROOT, 'spec.md');
const TRACE_FILE = path.join(REPO_ROOT, 'docs', 'spec-trace.json');
const REPO = process.env.SPEC_TRACE_REPO || 'MattGyverLee/keyboard-studio';

// ---------------------------------------------------------------------------
// Spec parsing
// ---------------------------------------------------------------------------

function parseSpecSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(/^## (\d+[a-z]?)\. (.+)$/);
    if (m) {
      if (current) sections.push(current);
      current = { id: '§' + m[1], title: m[1] + '. ' + m[2], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.map(s => ({ id: s.id, title: s.title, content: s.lines.join('\n') }));
}

function hashSection(content) {
  return 'sha256:' + crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Trace file I/O
// ---------------------------------------------------------------------------

function loadTrace() {
  if (!fs.existsSync(TRACE_FILE)) return null;
  return JSON.parse(fs.readFileSync(TRACE_FILE, 'utf8'));
}

function saveTrace(trace) {
  trace.lastUpdated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(TRACE_FILE, JSON.stringify(trace, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------

function seed() {
  const content = fs.readFileSync(SPEC_FILE, 'utf8');
  const sections = parseSpecSections(content);
  const existing = loadTrace() || {};

  const trace = {
    specVersion: '1.0',
    lastUpdated: new Date().toISOString().slice(0, 10),
    specFile: 'spec.md',
    sections: existing.sections || {}
  };

  let added = 0;
  for (const s of sections) {
    const currentHash = hashSection(s.content);
    if (!trace.sections[s.id]) {
      trace.sections[s.id] = {
        title: s.title,
        hash: currentHash,
        status: 'unreviewed',
        implements: [],
        decisions: [],
        notes: ''
      };
      added++;
    } else {
      trace.sections[s.id].hash = currentHash;
      trace.sections[s.id].title = s.title;
    }
  }

  saveTrace(trace);
  console.log('[OK] Seeded docs/spec-trace.json: ' + sections.length + ' sections (' + added + ' new)');
  console.log('[INFO] Edit docs/spec-trace.json to set status/implements/decisions per section');
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

async function check() {
  const trace = loadTrace();
  if (!trace) {
    console.log('[WARN] docs/spec-trace.json not found. Run: node utilities/spec-trace seed');
    return;
  }

  const content = fs.readFileSync(SPEC_FILE, 'utf8');
  const sections = parseSpecSections(content);
  const drifted = [];

  for (const s of sections) {
    const stored = trace.sections[s.id];
    const currentHash = hashSection(s.content);
    if (!stored) {
      drifted.push({ id: s.id, title: s.title, reason: 'new-section', currentHash });
    } else if (stored.hash !== currentHash) {
      drifted.push({ id: s.id, title: s.title, reason: 'content-changed', previousHash: stored.hash, currentHash });
    }
  }

  if (drifted.length === 0) {
    console.log('[OK] No spec drift detected (' + sections.length + ' sections clean)');
    return;
  }

  console.log('[WARN] ' + drifted.length + ' spec section(s) changed since last acknowledgement:');
  for (const d of drifted) {
    console.log('  ' + d.id + ' - ' + d.title + ' [' + d.reason + ']');
  }
  console.log('[INFO] Run: node utilities/spec-trace report');
  console.log('[INFO] Acknowledge: node utilities/spec-trace acknowledge <section-id>');

  const token = process.env.GITHUB_TOKEN;
  const dryRun = process.argv.includes('--dry-run');

  if (token && !dryRun) {
    await createIssues(drifted, token);
  } else {
    console.log('[INFO] GITHUB_TOKEN not set (or --dry-run) -- skipping issue creation');
  }
}

// ---------------------------------------------------------------------------
// acknowledge
// ---------------------------------------------------------------------------

function acknowledge(sectionId) {
  if (!sectionId) {
    console.log('[ERROR] Usage: node utilities/spec-trace acknowledge <section-id>');
    console.log('[INFO] Section IDs: §1, §2, §3, §4, §5, §5a, §6 ... §19');
    process.exit(1);
  }

  const trace = loadTrace();
  if (!trace) { console.log('[ERROR] docs/spec-trace.json not found'); process.exit(1); }

  const content = fs.readFileSync(SPEC_FILE, 'utf8');
  const sections = parseSpecSections(content);
  const section = sections.find(s => s.id === sectionId);

  if (!section) {
    console.log('[ERROR] Section not found in spec.md: ' + sectionId);
    console.log('[INFO] Valid IDs: ' + sections.map(s => s.id).join(', '));
    process.exit(1);
  }

  if (!trace.sections[sectionId]) {
    trace.sections[sectionId] = {
      title: section.title,
      hash: '',
      status: 'unreviewed',
      implements: [],
      decisions: [],
      notes: ''
    };
  }

  trace.sections[sectionId].hash = hashSection(section.content);
  saveTrace(trace);
  console.log('[OK] Acknowledged ' + sectionId + ' -- hash updated');
  console.log('[INFO] Commit docs/spec-trace.json and close the corresponding GitHub Issue');
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

function report() {
  const trace = loadTrace();
  if (!trace) { console.log('[WARN] docs/spec-trace.json not found'); return; }

  const content = fs.readFileSync(SPEC_FILE, 'utf8');
  const sections = parseSpecSections(content);
  const drifted = [];

  for (const s of sections) {
    const stored = trace.sections[s.id];
    if (!stored || stored.hash !== hashSection(s.content)) {
      drifted.push({ id: s.id, title: s.title, stored: !!stored });
    }
  }

  const byStatus = {};
  for (const data of Object.values(trace.sections)) {
    byStatus[data.status] = (byStatus[data.status] || 0) + 1;
  }

  console.log('Spec trace report -- ' + new Date().toISOString().slice(0, 10));
  console.log('');
  console.log('Implementation coverage:');
  const order = ['implemented', 'partial', 'unimplemented', 'unreviewed', 'reference', 'out-of-scope'];
  for (const status of order) {
    if (byStatus[status]) console.log('  ' + status + ': ' + byStatus[status]);
  }

  if (drifted.length > 0) {
    console.log('');
    console.log('Sections with unacknowledged changes (' + drifted.length + '):');
    for (const d of drifted) {
      console.log('  ' + d.id + ' - ' + d.title + (d.stored ? '' : ' [NEW]'));
    }
    console.log('');
    console.log('Acknowledge: node utilities/spec-trace acknowledge <section-id>');
  } else {
    console.log('');
    console.log('[OK] All sections acknowledged');
  }
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function apiRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function ghHeaders(token) {
  return {
    'Authorization': 'token ' + token,
    'User-Agent': 'spec-trace/0.1',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function ensureLabel(owner, repo, token) {
  const name = 'spec-drift';
  const res = await apiRequest({
    hostname: 'api.github.com',
    path: '/repos/' + owner + '/' + repo + '/labels/' + name,
    method: 'GET',
    headers: ghHeaders(token)
  });
  if (res.status === 404) {
    await apiRequest({
      hostname: 'api.github.com',
      path: '/repos/' + owner + '/' + repo + '/labels',
      method: 'POST',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' }
    }, { name, description: 'spec.md section changed -- code review needed', color: 'd4c5ff' });
    console.log('[OK] Created label: spec-drift');
  }
}

async function listOpenDriftIssues(owner, repo, token) {
  const res = await apiRequest({
    hostname: 'api.github.com',
    path: '/repos/' + owner + '/' + repo + '/issues?labels=spec-drift&state=open&per_page=100',
    method: 'GET',
    headers: ghHeaders(token)
  });
  return Array.isArray(res.body) ? res.body : [];
}

async function createIssues(drifted, token) {
  const [owner, repo] = REPO.split('/');
  await ensureLabel(owner, repo, token);
  const existing = await listOpenDriftIssues(owner, repo, token);

  for (const d of drifted) {
    const dup = existing.find(i => i.title.includes(d.id));
    if (dup) {
      console.log('[INFO] Issue already open for ' + d.id + ': #' + dup.number);
      continue;
    }

    const title = 'spec drift: ' + d.id + ' -- ' + d.title;
    const body = [
      '**Section:** `' + d.id + '` ' + d.title,
      '**Detected:** ' + new Date().toISOString().slice(0, 10),
      '**Change type:** ' + d.reason,
      '',
      'The `spec.md` content for this section changed since the last trace acknowledgement.',
      'Review whether any implementing code needs to be updated, then:',
      '',
      '1. Run `node utilities/spec-trace acknowledge ' + d.id + '`',
      '2. Commit the updated `docs/spec-trace.json`',
      '3. Close this issue',
      '',
      '_Auto-created by the spec-trace CI check._'
    ].join('\n');

    const res = await apiRequest({
      hostname: 'api.github.com',
      path: '/repos/' + owner + '/' + repo + '/issues',
      method: 'POST',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' }
    }, { title, body, labels: ['spec-drift'] });

    if (res.body && res.body.number) {
      console.log('[OK] Created issue #' + res.body.number + ': ' + res.body.html_url);
    } else {
      console.log('[WARN] Failed to create issue for ' + d.id + ': ' + JSON.stringify(res.body).slice(0, 120));
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const [,, cmd, ...args] = process.argv;
switch (cmd) {
  case 'seed':        seed(); break;
  case 'check':       check().catch(e => console.error('[ERROR]', e.message)); break;
  case 'acknowledge': acknowledge(args[0]); break;
  case 'report':      report(); break;
  default:
    console.log('spec-trace -- spec.md drift detector');
    console.log('');
    console.log('Usage:');
    console.log('  node utilities/spec-trace seed                        # initialise / refresh hashes');
    console.log('  node utilities/spec-trace check [--dry-run]           # detect drift, create issues');
    console.log('  node utilities/spec-trace report                      # coverage + drift summary');
    console.log('  node utilities/spec-trace acknowledge <section-id>    # accept reviewed section');
}

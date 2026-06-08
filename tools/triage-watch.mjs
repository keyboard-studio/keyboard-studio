#!/usr/bin/env node
// triage-watch.mjs - live terminal dashboard for /km-triage progress.
//
// Reads .tech-lead-inbox/progress.jsonl (the JSONL stream emitted by the
// triage agent via utilities/km-triage-app/progress-emit.js) and renders a
// per-PR status board that refreshes as the file grows.
//
// Defaults to the most recent sweep_id (latest sweep-start event); pass
// --sweep <id> to replay a specific past sweep, or --list to enumerate sweeps.
//
// Cross-platform: pure Node 18+, no deps. ANSI escapes work on Windows
// Terminal, PowerShell 7, cmd.exe (Win 10+ with VT mode), and every Linux/
// macOS terminal.
//
// Usage:
//   node tools/triage-watch.mjs                 # live, latest sweep
//   node tools/triage-watch.mjs --sweep <id>    # specific sweep (replay)
//   node tools/triage-watch.mjs --list          # list recent sweeps
//   node tools/triage-watch.mjs --once          # render once and exit
//   node tools/triage-watch.mjs --raw           # stream raw events (debug)

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const PROGRESS_LOG = path.join('.tech-lead-inbox', 'progress.jsonl');
const POLL_MS = 500;
const EVENT_TAIL_LINES = 12;

// ---------- args ----------

function parseArgs() {
  const args = { _: [] };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = process.argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; }
      else { args[key] = true; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

// ---------- ANSI ----------

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  clearScreen: '\x1b[2J\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
};

function c(color, s) {
  return process.stdout.isTTY ? `${ANSI[color]}${s}${ANSI.reset}` : String(s);
}

function tty(seq) {
  return process.stdout.isTTY ? seq : '';
}

function pad(s, n, align = 'left') {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  const fill = ' '.repeat(n - s.length);
  return align === 'right' ? fill + s : s + fill;
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtClock(iso) {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  return d.toISOString().slice(11, 19);
}

// ---------- event ingest ----------

function readAllEvents() {
  if (!fs.existsSync(PROGRESS_LOG)) return [];
  const raw = fs.readFileSync(PROGRESS_LOG, 'utf8');
  return raw.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function listSweeps(events) {
  const map = new Map();
  for (const ev of events) {
    if (!ev.sweep_id) continue;
    if (!map.has(ev.sweep_id)) {
      map.set(ev.sweep_id, { sweep_id: ev.sweep_id, started_at: ev.ts, ended_at: null, count: 0 });
    }
    const s = map.get(ev.sweep_id);
    s.count++;
    if (ev.phase === 'sweep-end') s.ended_at = ev.ts;
    if (ev.phase === 'sweep-start') s.started_at = ev.ts;
  }
  return [...map.values()].sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
}

function latestSweepId(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].sweep_id) return events[i].sweep_id;
  }
  return null;
}

// ---------- state fold ----------

function buildState(events, sweepId) {
  const filtered = events.filter((e) => e.sweep_id === sweepId);
  const state = {
    sweep_id: sweepId,
    started_at: null,
    ended_at: null,
    total_prs: null,
    sweep_end_counts: null,
    prs: new Map(),
    events: filtered,
  };
  for (const ev of filtered) {
    switch (ev.phase) {
      case 'sweep-start':
        state.started_at = ev.ts;
        if (ev.total_prs != null) state.total_prs = ev.total_prs;
        break;
      case 'sweep-end':
        state.ended_at = ev.ts;
        state.sweep_end_counts = {
          approve_park: ev.approve_park ?? 0,
          auto_fix_only: ev.auto_fix_only ?? 0,
          mention_only: ev.mention_only ?? 0,
          fix_and_mention: ev.fix_and_mention ?? 0,
          escalate: ev.escalate ?? 0,
          skipped: ev.skipped ?? 0,
          auto_fix_failed: ev.auto_fix_failed ?? 0,
        };
        break;
      default: {
        if (ev.pr == null) break;
        const key = String(ev.pr);
        if (!state.prs.has(key)) {
          state.prs.set(key, {
            pr: ev.pr, title: '', crew: '', phase: '', specialists: [],
            verdicts: [], action: '', skip_reason: '', last_event_ts: ev.ts,
          });
        }
        const p = state.prs.get(key);
        p.last_event_ts = ev.ts;
        if (ev.phase === 'pr-skip') {
          p.phase = 'skip';
          p.skip_reason = ev.reason || '';
        } else if (ev.phase === 'pr-start') {
          p.phase = 'start';
          if (ev.title) p.title = ev.title;
          if (ev.crew) p.crew = ev.crew;
        } else if (ev.phase === 'dispatch') {
          p.phase = 'dispatch';
          if (ev.specialists) p.specialists = ev.specialists;
        } else if (ev.phase === 'verdict') {
          p.phase = 'verdict';
          p.verdicts.push({
            specialist: ev.specialist || '?',
            status: ev.status || '?',
            summary: ev.summary || '',
          });
        } else if (ev.phase === 'action') {
          p.phase = 'action';
          p.action = ev.action || '';
        } else if (ev.phase === 'auto-fix') {
          p.phase = 'auto-fix';
        } else if (ev.phase === 'mention') {
          p.phase = 'mention';
        } else if (ev.phase === 'check-published') {
          p.phase = 'check-published';
        } else if (ev.phase === 'pr-end') {
          p.phase = 'done';
          if (ev.action_taken) p.action = ev.action_taken;
        }
        break;
      }
    }
  }
  return state;
}

// ---------- render ----------

function phaseLabel(p) {
  switch (p.phase) {
    case 'skip': return c('dim', `skip: ${p.skip_reason}`);
    case 'start': return c('cyan', 'start');
    case 'dispatch': return c('cyan', 'dispatch');
    case 'verdict': return c('yellow', `verdict ${p.verdicts.length}/${p.specialists.length || '?'}`);
    case 'action': return c('cyan', 'action');
    case 'auto-fix': return c('magenta', 'auto-fix');
    case 'mention': return c('magenta', 'mention');
    case 'check-published': return c('cyan', 'check');
    case 'done': return c('green', 'done');
    default: return p.phase || '-';
  }
}

function actionLabel(p) {
  if (!p.action) return '-';
  if (p.action === 'APPROVE-AND-PARK' || p.action === 'approve_park') return c('green', p.action);
  if (p.action === 'AUTO_FIX_ONLY' || p.action === 'auto_fix_only') return c('cyan', p.action);
  if (p.action === 'MENTION_ONLY' || p.action === 'mention_only') return c('yellow', p.action);
  if (p.action === 'FIX_AND_MENTION' || p.action === 'fix_and_mention') return c('yellow', p.action);
  if (p.action === 'ESCALATE' || p.action === 'escalate') return c('red', p.action);
  return p.action;
}

function statusBadge(state) {
  if (state.ended_at) return c('green', 'DONE');
  if (state.events.length === 0) return c('dim', 'WAITING');
  const last = new Date(state.events[state.events.length - 1].ts);
  const stale = Date.now() - last.getTime() > 5 * 60 * 1000;
  return stale ? c('yellow', 'STALE') : c('cyan', 'RUNNING');
}

function renderDashboard(state) {
  const out = [];
  const started = state.started_at ? new Date(state.started_at) : null;
  const ended = state.ended_at ? new Date(state.ended_at) : null;
  const elapsed = started ? fmtDuration((ended ? ended.getTime() : Date.now()) - started.getTime()) : '-';

  out.push(c('bold', '='.repeat(78)));
  out.push(c('bold', `km-triage sweep: ${state.sweep_id || '(none)'}`));
  out.push(`started: ${fmtClock(state.started_at)}   elapsed: ${elapsed}   status: ${statusBadge(state)}`);
  if (state.total_prs != null) out.push(c('dim', `discovered ${state.total_prs} open PR(s)`));
  out.push(c('bold', '='.repeat(78)));

  if (state.prs.size === 0) {
    out.push(c('dim', '  (no PR activity yet)'));
  } else {
    out.push(`  ${c('bold', pad('PR', 7))}${c('bold', pad('Phase', 26))}${c('bold', pad('Crew', 10))}${c('bold', 'Latest action / verdict')}`);
    const prs = [...state.prs.values()].sort((a, b) => a.pr - b.pr);
    for (const p of prs) {
      const title = p.title ? c('dim', ` ${p.title.slice(0, 40)}`) : '';
      const verdictSummary = p.verdicts.length > 0
        ? `${p.verdicts[p.verdicts.length - 1].specialist}=${p.verdicts[p.verdicts.length - 1].status}`
        : '';
      const rightCol = p.action ? actionLabel(p) : (verdictSummary ? c('dim', verdictSummary) : '-');
      out.push(`  ${pad('#' + p.pr, 7)}${pad(phaseLabel(p), 26)}${pad(p.crew || '-', 10)}${rightCol}${title}`);
    }
  }

  if (state.sweep_end_counts) {
    const c0 = state.sweep_end_counts;
    out.push(c('bold', '-'.repeat(78)));
    out.push(`  approve_park=${c('green', c0.approve_park)}  auto_fix=${c('cyan', c0.auto_fix_only)}  mention=${c('yellow', c0.mention_only)}  fix+mention=${c('yellow', c0.fix_and_mention)}  escalate=${c('red', c0.escalate)}  skipped=${c('dim', c0.skipped)}`);
  }

  out.push(c('bold', '-'.repeat(78)));
  out.push(c('bold', `recent events (last ${EVENT_TAIL_LINES}):`));
  const tail = state.events.slice(-EVENT_TAIL_LINES);
  if (tail.length === 0) {
    out.push(c('dim', '  (none)'));
  } else {
    for (const ev of tail) {
      const stamp = c('dim', fmtClock(ev.ts));
      const pr = ev.pr != null ? c('cyan', `#${ev.pr}`) : c('dim', '   ');
      const ph = c('yellow', pad(ev.phase || '?', 18));
      const rest = renderEventDetail(ev);
      out.push(`  ${stamp}  ${pad(pr, 6)}${ph}${rest}`);
    }
  }
  out.push(c('bold', '='.repeat(78)));
  out.push(c('dim', `watching ${PROGRESS_LOG}  -  ctrl+c to exit`));
  return out.join('\n') + '\n';
}

function renderEventDetail(ev) {
  switch (ev.phase) {
    case 'verdict': return `${ev.specialist || '?'} ${ev.status || '?'}${ev.summary ? c('dim', ' "' + ev.summary.slice(0, 60) + '"') : ''}`;
    case 'dispatch': return `firing ${Array.isArray(ev.specialists) ? ev.specialists.join(', ') : '?'}`;
    case 'pr-start': return ev.title ? c('dim', ev.title.slice(0, 60)) : '';
    case 'pr-skip': return c('dim', ev.reason || '?');
    case 'action': return actionLabel({ action: ev.action });
    case 'pr-end': return actionLabel({ action: ev.action_taken });
    case 'auto-fix': return `applied=${ev.applied ?? '?'} sha=${(ev.commit_sha || '').slice(0, 7)}`;
    case 'mention': return c('dim', ev.comment_url || '');
    case 'check-published': return `conclusion=${ev.conclusion || '?'}`;
    case 'sweep-start': return `total_prs=${ev.total_prs ?? '?'}`;
    case 'sweep-end': return c('dim', 'sweep complete');
    default: return '';
  }
}

// ---------- modes ----------

function modeList() {
  const sweeps = listSweeps(readAllEvents());
  if (sweeps.length === 0) {
    process.stdout.write('No sweeps recorded in ' + PROGRESS_LOG + '\n');
    return;
  }
  process.stdout.write(c('bold', pad('sweep_id', 32)) + c('bold', pad('started', 22)) + c('bold', pad('ended', 22)) + c('bold', 'events') + '\n');
  for (const s of sweeps) {
    process.stdout.write(pad(s.sweep_id, 32) + pad(s.started_at || '-', 22) + pad(s.ended_at || '(running)', 22) + String(s.count) + '\n');
  }
}

function modeRaw() {
  const rl = readline.createInterface({ input: fs.createReadStream(PROGRESS_LOG, { encoding: 'utf8' }) });
  rl.on('line', (line) => process.stdout.write(line + '\n'));
  rl.on('close', () => watchRaw());
}

function watchRaw() {
  let size = fs.existsSync(PROGRESS_LOG) ? fs.statSync(PROGRESS_LOG).size : 0;
  setInterval(() => {
    if (!fs.existsSync(PROGRESS_LOG)) return;
    const cur = fs.statSync(PROGRESS_LOG).size;
    if (cur > size) {
      const stream = fs.createReadStream(PROGRESS_LOG, { start: size, end: cur, encoding: 'utf8' });
      stream.on('data', (chunk) => process.stdout.write(chunk));
      size = cur;
    }
  }, POLL_MS);
}

function modeRender(args) {
  const events = readAllEvents();
  const sweepId = args.sweep || latestSweepId(events);
  if (!sweepId) {
    process.stdout.write(`No events found in ${PROGRESS_LOG} yet.\n`);
    if (args.once) return;
  }
  const state = buildState(events, sweepId);
  process.stdout.write(tty(ANSI.clearScreen));
  process.stdout.write(renderDashboard(state));

  if (args.once) return;

  let lastSize = fs.existsSync(PROGRESS_LOG) ? fs.statSync(PROGRESS_LOG).size : 0;
  process.stdout.write(tty(ANSI.hideCursor));
  process.on('SIGINT', () => { process.stdout.write(tty(ANSI.showCursor) + '\n'); process.exit(0); });

  setInterval(() => {
    const exists = fs.existsSync(PROGRESS_LOG);
    if (!exists) return;
    const cur = fs.statSync(PROGRESS_LOG).size;
    const tick = Date.now();
    if (cur !== lastSize || tick % 5000 < POLL_MS) {
      lastSize = cur;
      const fresh = readAllEvents();
      const sid = args.sweep || latestSweepId(fresh);
      const next = buildState(fresh, sid);
      process.stdout.write(tty(ANSI.clearScreen));
      process.stdout.write(renderDashboard(next));
    }
  }, POLL_MS);
}

// ---------- main ----------

const args = parseArgs();
if (args.list) {
  modeList();
} else if (args.raw) {
  modeRaw();
} else {
  modeRender(args);
}

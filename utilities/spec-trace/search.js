#!/usr/bin/env node
'use strict';

/**
 * spec-trace search -- BM25 retrieval over the markdown spec corpus.
 *
 * Why this exists: the corpus under specs/ + docs/ is ~5.4 MB across ~434
 * files. An agent that needs one requirement currently reads a whole spec.md
 * (~3k tokens) to find it. A budgeted search returns the handful of heading
 * chunks that actually match (~300 tokens), with a file:line anchor precise
 * enough that the fallback is a targeted Read(offset, limit) rather than a
 * whole-file read. That anchor is the point -- a search the agent has to
 * follow with a full Read has cost tokens, not saved them.
 *
 * Why there is no index file: a cold scan + tokenize of the whole corpus is
 * ~250 ms, which is inside the noise of a tool call. Scanning at query time
 * removes the native SQLite dependency, the staleness bug class, and the
 * "is the index populated?" failure mode, and it means results always reflect
 * the working tree including uncommitted edits.
 *
 * This module is deliberately pure: no filesystem walking policy, no
 * spec-trace unit-id knowledge, no CLI. index.js owns the corpus roots and the
 * drift-status annotation and passes them in. That keeps the dependency
 * direction one-way (index.js -> search.js) and this file directly unit
 * testable.
 */

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 5;
const DEFAULT_BUDGET = 2048;
// Below this the header alone cannot fit, so the byte cap would be
// unenforceable. We refuse rather than silently overrun it -- the whole point
// of a context-saving tool is that its advertised cap is real.
const MIN_BUDGET = 256;
const SNIPPET_WIDTH = 220;

const K1 = 1.2;
const B = 0.75;
const HEADING_BOOST = 0.4;

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'for', 'on', 'it',
  'that', 'this', 'with', 'as', 'be', 'by', 'are', 'not', 'from', 'at', 'if',
  'we', 'its', 'so', 'but', 'can', 'do', 'has', 'have', 'was', 'were', 'will'
]);

// Deliberately not a Porter stemmer: plural/gerund folding recovers most of
// the recall in a spec corpus for a fraction of the code and stays legible
// when a query does not match what a reader expected.
//
// The trailing-e rule is what makes the verb forms agree: without it "remove"
// folds to itself while "removing" folds to "remov", and a search for one
// misses every occurrence of the other. Both query and document go through
// this same function, so an over-eager fold costs precision, never symmetry.
// Derivational pairs ("validate"/"validation") are out of scope by design.
const foldCache = new Map();
function fold(word) {
  const hit = foldCache.get(word);
  if (hit !== undefined) return hit;
  // Identifiers are never stemmed: "spec-trace" and "kmp.json" are exactly the
  // strings a reader searches for, and folding them costs precision for no
  // recall (nobody writes the plural of a filename).
  if (/[.-]/.test(word)) {
    foldCache.set(word, word);
    return word;
  }
  let w = word;
  if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/[^s]s$/.test(w) && w.length > 3) w = w.slice(0, -1); // not "class"
  if (/^.{4,}(ing|ed)$/.test(w)) w = w.replace(/(ing|ed)$/, '');
  if (/^.{5,}e$/.test(w)) w = w.slice(0, -1);
  foldCache.set(word, w);
  return w;
}

function tokens(text) {
  const out = [];
  const raw = text.toLowerCase().match(/[a-z0-9][a-z0-9_.-]*/g);
  if (!raw) return out;
  for (const w of raw) {
    if (w.length < 2 || STOP.has(w)) continue;
    out.push(fold(w));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chunking
//
// Split on ATX headings so every hit has a citable anchor (path + line) and a
// breadcrumb the agent can read without opening the file. Fenced code blocks
// are skipped when looking for headings -- a `# comment` inside a shell fence
// is not a section boundary.
// ---------------------------------------------------------------------------

function normalizeContent(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function chunkFile(relPath, raw) {
  const lines = normalizeContent(raw).split('\n');
  const chunks = [];
  const crumbs = [];
  let inFence = false;
  let cur = { path: relPath, line: 1, crumb: '', lines: [] };

  // A heading with no body of its own -- a parent like "## Phase 8" that only
  // introduces subsections -- is dropped. It can still match on its own words
  // and would then spend a hit slot on an empty snippet.
  const flush = () => {
    const isHeading = cur.lines.length > 0 && /^#{1,4}\s/.test(cur.lines[0]);
    const body = isHeading ? cur.lines.slice(1) : cur.lines;
    if (body.some((l) => l.trim())) chunks.push(cur);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

    const h = inFence ? null : line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (h) {
      flush();
      const depth = h[1].length;
      crumbs.length = Math.min(crumbs.length, depth - 1);
      crumbs[depth - 1] = h[2].trim();
      cur = {
        path: relPath,
        line: i + 1,
        crumb: crumbs.filter(Boolean).join(' > '),
        lines: [line]
      };
    } else {
      cur.lines.push(line);
    }
  }
  flush();
  return chunks;
}

// Attach the per-chunk statistics BM25 needs. Done once per corpus build.
function prepareChunk(chunk) {
  const text = chunk.lines.join('\n');
  const terms = tokens(text);
  const tf = new Map();
  for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
  return {
    path: chunk.path,
    line: chunk.line,
    crumb: chunk.crumb,
    text: text.replace(/\s+/g, ' ').trim(),
    tf,
    len: terms.length,
    crumbTerms: new Set(tokens(chunk.crumb))
  };
}

/**
 * Build a searchable corpus from `[{ path, content }]` records.
 * The caller decides which files are in scope; this just indexes them.
 */
function buildCorpus(files) {
  const chunks = [];
  for (const f of files) {
    for (const c of chunkFile(f.path, f.content)) chunks.push(prepareChunk(c));
  }
  const df = new Map();
  let totalLen = 0;
  for (const c of chunks) {
    totalLen += c.len;
    for (const t of c.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  return {
    chunks,
    df,
    N: chunks.length,
    avgdl: chunks.length ? totalLen / chunks.length : 0
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreChunk(chunk, qterms, corpus) {
  const { df, N, avgdl } = corpus;
  let s = 0;
  for (const q of qterms) {
    const f = chunk.tf.get(q);
    if (!f) continue;
    const n = df.get(q) || 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    s += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (chunk.len / avgdl)));
  }
  if (s === 0) return 0;
  // A term in the heading path is strong signal in a spec corpus: it means the
  // section is *about* the term rather than merely mentioning it.
  const inCrumb = qterms.filter((q) => chunk.crumbTerms.has(q)).length;
  return s * (1 + HEADING_BOOST * inCrumb);
}

/**
 * Pick the densest window of query terms rather than truncating from the top,
 * so the snippet carries the sentence that actually matched.
 */
function snippet(chunk, qterms, width = SNIPPET_WIDTH) {
  const words = chunk.text.split(' ');
  const qset = new Set(qterms);
  const span = Math.max(8, Math.round(width / 7));
  let run = 0;
  let best = -1;
  let bestAt = 0;

  for (let i = 0; i < words.length; i++) {
    if (qset.has(fold(words[i].toLowerCase().replace(/[^a-z0-9_.-]/g, '')))) run++;
    if (i >= span) {
      const gone = words[i - span].toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      if (qset.has(fold(gone))) run--;
    }
    if (run > best) {
      best = run;
      bestAt = Math.max(0, i - span + 1);
    }
  }

  const body = words.slice(bestAt, bestAt + span).join(' ');
  const clipped = body.length > width ? body.slice(0, width).replace(/\s\S*$/, '') : body;
  const lead = bestAt > 0 ? '...' : '';
  const tail = bestAt + span < words.length || clipped.length < body.length ? '...' : '';
  return lead + clipped + tail;
}

/**
 * Rank the corpus against a query. Returns hits already sorted and truncated
 * to `limit`, but NOT yet budget-capped -- byte enforcement belongs to the
 * render layer, where the bytes actually exist.
 */
function search(corpus, query, opts = {}) {
  const limit = opts.limit || DEFAULT_LIMIT;
  const scope = opts.scope || null;
  const qterms = [...new Set(tokens(query))];

  const scored = [];
  for (const chunk of corpus.chunks) {
    if (scope && !chunk.path.startsWith(scope)) continue;
    const score = scoreChunk(chunk, qterms, corpus);
    if (score > 0) scored.push({ chunk, score });
  }

  // Deterministic ordering: score desc, then path, then line. Two runs over an
  // unchanged tree must produce byte-identical output.
  scored.sort((a, b) =>
    b.score - a.score ||
    a.chunk.path.localeCompare(b.chunk.path) ||
    a.chunk.line - b.chunk.line);

  const hits = scored.slice(0, limit).map(({ chunk, score }) => ({
    path: chunk.path,
    line: chunk.line,
    crumb: chunk.crumb,
    score: Math.round(score * 100) / 100,
    snippet: snippet(chunk, qterms)
  }));

  return { query, qterms, hits, matched: scored.length, scanned: corpus.N };
}

// ---------------------------------------------------------------------------
// Rendering -- with a byte cap that is actually enforced
//
// context-mode's PreCompact hook advertises "<2KB" while its snapshot builder
// accepts maxBytes and ignores it, so it can inject ~196 KB at the worst
// possible moment. A tool whose only purpose is saving context must not have
// an advisory cap. Both renderers below drop trailing hits until the assembled
// output fits, and report what they dropped.
// ---------------------------------------------------------------------------

function composeText(result, shown, annotate) {
  const lines = [];
  for (let i = 0; i < shown; i++) {
    const h = result.hits[i];
    const status = annotate ? annotate(h) : null;
    lines.push('');
    lines.push(
      '  ' + (i + 1) + '. ' + h.path + ':' + h.line +
      (status ? '  [' + status + ']' : '') +
      '  score ' + h.score.toFixed(2));
    if (h.crumb) lines.push('     ' + h.crumb);
    lines.push('     ' + h.snippet);
  }
  return lines.join('\n');
}

function withHeader(body, result, shown, budget, bytesOfBody) {
  const dropped = result.hits.length - shown;
  const head =
    '[INFO] ' + shown + ' hit' + (shown === 1 ? '' : 's') +
    ' for "' + result.query + '"' +
    (dropped > 0 ? ' (' + dropped + ' dropped for budget)' : '') +
    ' -- ' + bytesOfBody + ' of ' + budget + ' bytes, ' +
    result.matched + ' chunk(s) matched of ' + result.scanned;
  return head + body + (body ? '\n' : '');
}

// The header states its own byte count, so the count is part of what it
// measures. Iterate to a fixed point rather than guessing: re-compose with the
// last measurement until the stated number equals the emitted length. It
// settles in at most a few passes, since the only thing that moves is the
// width of the number itself. A stated size that is off by even two bytes
// would make the whole cap unauditable, which is the point of the exercise.
function fixHeader(body, result, shown, budget) {
  let claim = Buffer.byteLength(withHeader(body, result, shown, budget, 0), 'utf8');
  let text = '';
  for (let i = 0; i < 8; i++) {
    text = withHeader(body, result, shown, budget, claim);
    const actual = Buffer.byteLength(text, 'utf8');
    if (actual === claim) break;
    claim = actual;
  }
  return { text, bytes: Buffer.byteLength(text, 'utf8') };
}

function renderText(result, opts = {}) {
  const budget = opts.budget || DEFAULT_BUDGET;
  let shown = result.hits.length;

  for (;;) {
    const body = composeText(result, shown, opts.annotate);
    const { text, bytes } = fixHeader(body, result, shown, budget);
    if (bytes <= budget || shown === 0) {
      return { text, bytes, shown, dropped: result.hits.length - shown };
    }
    shown--;
  }
}

function renderJson(result, opts = {}) {
  const budget = opts.budget || DEFAULT_BUDGET;
  let shown = result.hits.length;

  for (;;) {
    const payload = {
      query: result.query,
      matched: result.matched,
      scanned: result.scanned,
      shown,
      dropped: result.hits.length - shown,
      hits: result.hits.slice(0, shown).map((h) => {
        const status = opts.annotate ? opts.annotate(h) : null;
        return status ? { ...h, status } : h;
      })
    };
    const text = JSON.stringify(payload, null, 2);
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes <= budget || shown === 0) {
      return { text, bytes, shown, dropped: result.hits.length - shown };
    }
    shown--;
  }
}

module.exports = {
  DEFAULT_LIMIT,
  DEFAULT_BUDGET,
  MIN_BUDGET,
  SNIPPET_WIDTH,
  fold,
  tokens,
  chunkFile,
  buildCorpus,
  scoreChunk,
  snippet,
  search,
  renderText,
  renderJson
};

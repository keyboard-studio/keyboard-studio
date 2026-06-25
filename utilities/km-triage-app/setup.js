#!/usr/bin/env node
// km-triage GitHub App — one-time setup.
//
// Creates a personal-account GitHub App via GitHub's manifest flow, then saves
// the App ID + private key + (cached) installation ID to a per-user config dir
// outside the repo. After this finishes, `mint-token.js` can produce short-lived
// installation tokens that authenticate as `km-triage[bot]`.
//
// Usage (one time, on the machine that will run scheduled km-triage sweeps):
//   node utilities/km-triage-app/setup.js
//
// Environment overrides:
//   KM_TRIAGE_APP_NAME   — App name (default "km-triage"; must be globally
//                          unique on github.com — try a variant like
//                          "km-triage-mgl" if the default is taken)
//   KM_TRIAGE_SETUP_PORT — localhost port for the callback (default 4567)
//
// After this script finishes successfully it prints an install URL. Open it,
// install the App on keyboard-studio/keyboard-studio, then run mint-token.js to
// verify a token mints cleanly.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PORT = Number(process.env.KM_TRIAGE_SETUP_PORT || 4567);
const CALLBACK_PATH = '/callback';
const APP_NAME = process.env.KM_TRIAGE_APP_NAME || 'km-triage';
const REDIRECT_URL = `http://localhost:${PORT}${CALLBACK_PATH}`;

const CONFIG_DIR = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'km-triage')
  : path.join(os.homedir(), '.config', 'km-triage');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const KEY_FILE = path.join(CONFIG_DIR, 'private-key.pem');

const manifest = {
  name: APP_NAME,
  url: 'https://github.com/keyboard-studio/keyboard-studio',
  description: 'Scheduled PR-triage agent for keyboard-studio. Reviews PRs, posts mechanical fixes, and labels lead-ready items. Authored by km-triage so its reviews count toward branch-protection requirements without conflicting with author self-approval rules.',
  // GitHub requires hook_attributes.url even when active=false. Use a placeholder
  // — no webhook deliveries will fire because active is false.
  hook_attributes: { url: 'https://example.com/km-triage-no-webhook', active: false },
  redirect_url: REDIRECT_URL,
  public: false,
  default_permissions: {
    pull_requests: 'write',
    issues: 'write',
    contents: 'read',
    metadata: 'read',
    checks: 'read',
  },
  default_events: [],
};

const state = crypto.randomBytes(16).toString('hex');

function pageShell(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>km-triage setup</title>` +
    `<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 24px;line-height:1.5;}` +
    `button{font-size:18px;padding:12px 24px;cursor:pointer;}code{background:#f4f4f4;padding:2px 6px;border-radius:3px;}</style>` +
    `</head><body>${body}</body></html>`;
}

function homePage() {
  // Inject the manifest into the input via JS rather than as an HTML attribute.
  // This is the pattern used by Probot's create-probot-app and sidesteps every
  // HTML-attribute parsing edge case that broke the encoded-attribute approach.
  const manifestJson = JSON.stringify(manifest);
  const manifestJsLiteral = JSON.stringify(manifestJson); // double-stringify: produces a JS string literal we can drop into a <script>
  return pageShell(`
    <h1>km-triage GitHub App setup</h1>
    <p>This will create a GitHub App named <code>${APP_NAME}</code> on your personal account.</p>
    <p>Click below to open GitHub's confirmation page. After you click <strong>Create GitHub App</strong> there, GitHub redirects back to <code>${REDIRECT_URL}</code> and this script saves the credentials.</p>
    <p>Make sure you're signed into GitHub as the account that owns <code>keyboard-studio/keyboard-studio</code> before clicking.</p>
    <form id="manifest-form" action="https://github.com/settings/apps/new?state=${state}" method="post">
      <input type="hidden" name="manifest" id="manifest-input">
      <button type="submit">Create GitHub App on github.com</button>
    </form>
    <p style="margin-top:48px;color:#888;font-size:13px;">Permissions requested: PRs read/write, Issues read/write, Contents read, Checks read, Metadata read. No webhooks.</p>
    <script>
      // Set the manifest value via JS (string assignment, no HTML escaping in play).
      document.getElementById('manifest-input').value = ${manifestJsLiteral};
    </script>
  `);
}

async function exchangeCodeForApp(code) {
  const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'km-triage-setup',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Conversions endpoint returned ${res.status}: ${text}`);
  return JSON.parse(text);
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      execSync(`start "" "${url}"`, { shell: 'cmd.exe' });
    } else if (process.platform === 'darwin') {
      execSync(`open "${url}"`);
    } else {
      execSync(`xdg-open "${url}"`);
    }
  } catch {
    console.log('[km-triage-setup] Could not auto-open browser. Open this URL manually:');
    console.log('  ', url);
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (u.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(homePage());
    return;
  }

  if (u.pathname === CALLBACK_PATH && req.method === 'GET') {
    const code = u.searchParams.get('code');
    const cbState = u.searchParams.get('state');
    if (!code || cbState !== state) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(pageShell('<h1>State mismatch or missing code</h1><p>Re-run the script.</p>'));
      return;
    }
    try {
      const app = await exchangeCodeForApp(code);
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(KEY_FILE, app.pem, { mode: 0o600 });
      const { pem, client_secret, webhook_secret, ...safeConfig } = app;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(safeConfig, null, 2), { mode: 0o600 });
      const installUrl = `${app.html_url}/installations/new`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(pageShell(`
        <h1>[OK] App created</h1>
        <p><strong>App ID:</strong> <code>${app.id}</code><br>
           <strong>Slug:</strong> <code>${app.slug}</code><br>
           <strong>Owner:</strong> <code>${app.owner.login}</code></p>
        <p>Credentials saved to <code>${CONFIG_DIR}</code>.</p>
        <h2>Next step: install the App on the repo</h2>
        <p><a href="${installUrl}" target="_blank"><button>Open install page</button></a></p>
        <p>Pick <strong>Only select repositories</strong> and choose <code>keyboard-studio/keyboard-studio</code>.</p>
        <p>After installing, close this tab and run <code>node utilities/km-triage-app/mint-token.js</code> from a terminal to confirm a token mints.</p>
      `));
      console.log('');
      console.log('[OK] App created.');
      console.log('     App ID:           ', app.id);
      console.log('     Slug:             ', app.slug);
      console.log('     Owner:            ', app.owner.login);
      console.log('     Config dir:       ', CONFIG_DIR);
      console.log('     Private key file: ', KEY_FILE);
      console.log('');
      console.log('Next: install the App on the repo.');
      console.log('  ', installUrl);
      console.log('');
      console.log('After installing, verify with:');
      console.log('   node utilities/km-triage-app/mint-token.js');
      setTimeout(() => { server.close(); process.exit(0); }, 1500);
    } catch (err) {
      console.error('[ERROR] App creation failed:', err.message);
      res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      res.end(pageShell(`<h1>Error</h1><pre>${err.message.replace(/</g, '&lt;')}</pre>`));
    }
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${PORT} is already in use. Set KM_TRIAGE_SETUP_PORT to a free port and retry.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log('[km-triage-setup] Listening at', url);
  console.log('[km-triage-setup] Opening browser. If it does not open, visit the URL above.');
  openBrowser(url);
});

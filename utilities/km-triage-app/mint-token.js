#!/usr/bin/env node
// km-triage GitHub App — installation-token mint.
//
// Reads the App credentials saved by setup.js, signs a short-lived JWT, exchanges
// it for a 1-hour installation access token on keyboard-studio/keyboard-studio, and
// prints the token (and only the token) to stdout. The km-triage command pipes
// this into $env:GH_TOKEN for any gh invocation that should be attributed to
// km-triage[bot] (reviews, comments, label adds, auto-fix pushes).
//
// Usage:
//   $env:GH_TOKEN = node utilities/km-triage-app/mint-token.js       # PowerShell
//   GH_TOKEN=$(node utilities/km-triage-app/mint-token.js) gh pr ... # bash
//
// Exit codes:
//   0  token printed to stdout
//   1  no credentials (run setup.js first)
//   2  App credentials present but installation lookup failed (App not installed
//      on the repo, or removed)
//   3  network / GitHub API error
//
// Environment overrides:
//   KM_TRIAGE_REPO — target repo, default "keyboard-studio/keyboard-studio"

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'km-triage')
  : path.join(os.homedir(), '.config', 'km-triage');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const KEY_FILE = path.join(CONFIG_DIR, 'private-key.pem');
const INSTALL_CACHE = path.join(CONFIG_DIR, 'installation.json');
const REPO = process.env.KM_TRIAGE_REPO || 'keyboard-studio/keyboard-studio';

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const message = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  const sig = b64url(signer.sign(privateKeyPem));
  return `${message}.${sig}`;
}

async function ghApi(apiPath, jwt, init = {}) {
  const res = await fetch(`https://api.github.com${apiPath}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${jwt}`,
      'User-Agent': 'km-triage-mint',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${init.method || 'GET'} ${apiPath} → ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

async function getInstallationId(jwt, appId) {
  if (fs.existsSync(INSTALL_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(INSTALL_CACHE, 'utf8'));
      if (cached.repo === REPO && cached.installation_id) return cached.installation_id;
    } catch (_) { /* cache miss or parse error -> fetch fresh */ }
  }
  const [owner, repo] = REPO.split('/');
  try {
    const inst = await ghApi(`/repos/${owner}/${repo}/installation`, jwt);
    const cache = { repo: REPO, installation_id: inst.id };
    fs.writeFileSync(INSTALL_CACHE, JSON.stringify(cache, null, 2), { mode: 0o600 });
    return inst.id;
  } catch (err) {
    if (err.status === 404) {
      const msg = `The App is not installed on ${REPO}. Open ${path.join(CONFIG_DIR, 'config.json')}, ` +
        `copy the App's html_url, append /installations/new, and install it on the repo. Then retry.`;
      const e = new Error(msg);
      e.code = 'NOT_INSTALLED';
      throw e;
    }
    // 401 "could not be decoded" is NOT an installation problem, though it
    // surfaces on the installation lookup because that is the first authed
    // call. GitHub resolves the App by the JWT's `iss`, fetches its public
    // keys, and reports a decode failure when the signature verifies against
    // none of them. So a locally well-formed JWT plus this error means the
    // stored private key no longer belongs to the App — the key was
    // regenerated or revoked on GitHub, or config.json and private-key.pem
    // came from different App generations. Re-running setup.js does NOT fix
    // it (that creates a second App); regenerate the key instead.
    if (err.status === 401 && /could not be decoded/i.test(err.message)) {
      const e = new Error(
        `The stored private key does not match App ${appId}. Regenerate it: ` +
        `open the App's settings (see html_url in ${CONFIG_FILE}) -> Private keys -> ` +
        `"Generate a private key", then replace ${KEY_FILE} with the downloaded .pem. ` +
        `Do not re-run setup.js — it would create a duplicate App.`,
      );
      e.code = 'KEY_MISMATCH';
      throw e;
    }
    throw err;
  }
}

(async () => {
  if (!fs.existsSync(CONFIG_FILE) || !fs.existsSync(KEY_FILE)) {
    console.error(`[mint-token] No credentials at ${CONFIG_DIR}. Run \`node utilities/km-triage-app/setup.js\` first.`);
    process.exit(1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    console.error('[mint-token] Could not parse config.json:', err.message);
    process.exit(1);
  }
  const privateKey = fs.readFileSync(KEY_FILE, 'utf8');
  let jwt;
  try {
    jwt = makeJwt(config.id, privateKey);
  } catch (err) {
    console.error('[mint-token] JWT signing failed:', err.message);
    process.exit(3);
  }

  let installationId;
  try {
    installationId = await getInstallationId(jwt, config.id);
  } catch (err) {
    if (err.code === 'NOT_INSTALLED' || err.code === 'KEY_MISMATCH') {
      console.error('[mint-token]', err.message);
      process.exit(2);
    }
    console.error('[mint-token] Installation lookup failed:', err.message);
    process.exit(3);
  }

  let token;
  try {
    token = await ghApi(`/app/installations/${installationId}/access_tokens`, jwt, { method: 'POST' });
  } catch (err) {
    console.error('[mint-token] Token mint failed:', err.message);
    process.exit(3);
  }

  process.stdout.write(token.token);
})();

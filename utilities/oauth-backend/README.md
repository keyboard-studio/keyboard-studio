# oauth-backend

Minimal OAuth token-exchange backend for the keyboard-studio GitHub fork+PR delivery path.

The studio SPA runs the GitHub OAuth web-app flow (PKCE, S256) but cannot hold the OAuth client secret in browser JavaScript. This service performs the server-side code-for-token exchange and returns the raw GitHub access token to the SPA, which stores it in `sessionStorage` (tab-scoped). No token is persisted server-side.

Lives in `utilities/oauth-backend/` — a standalone deployable service kept out of `packages/*` so it does not participate in `pnpm -r build/test/typecheck`.

## Endpoints

### `POST /oauth/google/exchange`

Exchange a Google authorization code (PKCE) for verified identity claims. Google is identity-only — no Google API access is needed after the exchange.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `code` | string | yes | One-time authorization code from Google's redirect |
| `code_verifier` | string | yes | PKCE code verifier (S256 flow) |
| `redirect_uri` | string (URL) | yes | Redirect URI used in the original auth request |

**Success response `200`:**

```json
{
  "sub": "12345678901234567890",
  "email": "user@example.com",
  "email_verified": true,
  "name": "Test User",
  "picture": "https://lh3.googleusercontent.com/..."
}
```

Neither the `id_token` nor the Google `access_token` is forwarded to the SPA.

**Error response `400`:**

```json
{ "error": "invalid_grant" }
```

Safe error codes: `invalid_grant`, `invalid_client`, `redirect_uri_mismatch`, `access_denied`, `invalid_request`, `invalid_id_token`, `google_error`. `502` is returned for Google upstream errors.

---

### `POST /oauth/exchange`

Exchange a GitHub authorization code for an access token.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `code` | string | yes | One-time authorization code from GitHub's redirect |
| `code_verifier` | string | no | PKCE code verifier (S256 flow) — passed through to GitHub |
| `redirect_uri` | string (URL) | no | Redirect URI used in the original auth request — passed through to GitHub |

**Success response `200`:**

```json
{
  "access_token": "gho_...",
  "token_type": "bearer",
  "scope": "public_repo"
}
```

**Error response `400`:**

```json
{ "error": "bad_verification_code" }
```

Safe error codes (never raw GitHub messages): `bad_verification_code`, `incorrect_client_credentials`, `redirect_uri_mismatch`, `access_denied`, `unsupported_grant_type`, `github_error`.

---

### `POST /oauth/refresh`

Refresh an expiring token using the `refresh_token` grant. Classic GitHub OAuth App tokens do not expire; this endpoint is implemented for GitHub Apps with token expiration enabled.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `refresh_token` | string | yes | Refresh token from a previous exchange |

**Success response `200`:** Same shape as `/oauth/exchange`.

---

### `GET /oauth/health`

Liveness probe. No authentication required. Used by container healthcheck.

**Response `200`:**

```json
{ "status": "ok" }
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_CLIENT_ID` | **yes** | — | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | **yes** | — | GitHub OAuth App client secret — never logged, never in responses |
| `GOOGLE_OAUTH_ENABLED` | no | `false` | Set to `true` to enable the Google identity flow (`/oauth/google/exchange`) |
| `GOOGLE_CLIENT_ID` | only if Google enabled | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | only if Google enabled | — | Google OAuth client secret — never logged, never in responses |
| `OAUTH_ALLOWED_ORIGINS` | no | _(none)_ | Comma-separated extra CORS origins e.g. `https://studio.example.com` |
| `PORT` | no | `8787` | TCP port to listen on |

`http://localhost:5173` (Vite default) is included in the CORS allowlist only when `NODE_ENV` is not `production`. In production, only the origins listed in `OAUTH_ALLOWED_ORIGINS` are accepted. Wildcard `*` is never used.

The service exits at startup with a fatal error if `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` are absent. Google sign-in is opt-in: leave `GOOGLE_OAUTH_ENABLED` unset for a GitHub-only deployment and the `/oauth/google/exchange` route is not registered. When `GOOGLE_OAUTH_ENABLED=true`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` become required and a missing value is fatal at startup.

## Running

**Development (run directly with tsx):**

```sh
cd utilities/oauth-backend
npm install
GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... npm start
```

**Typecheck / test (from the utility directory):**

```sh
cd utilities/oauth-backend
npm install
npm run typecheck
npm test
```

Note: this utility is not a pnpm workspace member, so use `npm` or `node` directly rather than `pnpm --filter`.

## Security notes

- The client secret is read from env at startup and passed only to the in-process handler config. It is never written to any log, error message, or HTTP response.
- The authorization code and the resulting access token are never logged.
- No token is stored server-side beyond the in-flight exchange HTTP request.
- CORS is configured with an explicit allowlist; credentials mode is enabled (`credentials: true`) so the browser can send cookies/auth headers to same-origin paths.
- The OAuth scope is requested by the SPA's authorize URL (e.g. `public_repo`), not enforced here. This backend only exchanges the authorization code and forwards the `scope` field that GitHub includes in the token response; the engine's `verifyToken` uses that forwarded `scope` to cross-check that the required permissions were actually granted.

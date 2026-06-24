/**
 * OAuth token-exchange backend — Fastify server entry point.
 *
 * Endpoints:
 *   POST /oauth/exchange         — GitHub authorization_code → access_token
 *   POST /oauth/refresh          — GitHub refresh_token → new access_token
 *   POST /oauth/google/exchange  — Google authorization_code → identity claims
 *   GET  /oauth/health           — liveness probe (no auth)
 *
 * Environment variables (see README.md for full reference):
 *   GITHUB_CLIENT_ID       required
 *   GITHUB_CLIENT_SECRET   required — never logged, never in responses
 *   GOOGLE_CLIENT_ID       required
 *   GOOGLE_CLIENT_SECRET   required — never logged, never in responses
 *   OAUTH_ALLOWED_ORIGINS  comma-separated list of allowed CORS origins
 *   PORT                   default 8787
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import type { ZodIssue } from "zod";
import {
  ExchangeBodySchema,
  RefreshBodySchema,
} from "./schemas.js";
import {
  exchange,
  refresh,
  type HandlerConfig,
  type OAuthFetchFn,
} from "./handlers.js";
import { GoogleExchangeBodySchema } from "./google-schemas.js";
import {
  googleExchange,
  type GoogleHandlerConfig,
} from "./google-handlers.js";

// ---------------------------------------------------------------------------
// Startup validation — fail fast if secrets are absent
// ---------------------------------------------------------------------------

function loadConfig(): {
  clientId: string;
  clientSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  allowedOrigins: string[];
  port: number;
} {
  const clientId = (process.env["GITHUB_CLIENT_ID"] ?? "").trim();
  const clientSecret = (process.env["GITHUB_CLIENT_SECRET"] ?? "").trim();

  if (!clientId || !clientSecret) {
    console.error(
      "[oauth-backend] FATAL: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set."
    );
    process.exit(1);
  }

  const googleClientId = (process.env["GOOGLE_CLIENT_ID"] ?? "").trim();
  const googleClientSecret = (process.env["GOOGLE_CLIENT_SECRET"] ?? "").trim();

  if (!googleClientId || !googleClientSecret) {
    console.error(
      "[oauth-backend] FATAL: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set."
    );
    process.exit(1);
  }

  const rawOrigins = process.env["OAUTH_ALLOWED_ORIGINS"] ?? "";
  const staticOrigins = rawOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // In non-production environments, include the Vite dev server origin so
  // local development works without setting OAUTH_ALLOWED_ORIGINS.
  // In production, only the explicitly configured origins are allowed.
  const devOrigins =
    process.env["NODE_ENV"] !== "production" ? ["http://localhost:5173"] : [];
  const allowedOrigins = Array.from(
    new Set([...devOrigins, ...staticOrigins])
  );

  const port = parseInt(process.env["PORT"] ?? "8787", 10);

  return { clientId, clientSecret, googleClientId, googleClientSecret, allowedOrigins, port };
}

// ---------------------------------------------------------------------------
// Zod validation detail serialiser — never echo submitted values
// ---------------------------------------------------------------------------

/**
 * Convert a Zod issue to a static, submission-value-free description string.
 * The field path is included so the caller knows which field failed, but the
 * submitted value is never included (zod messages like "Invalid URL" could
 * otherwise be augmented with the submitted value in future Zod versions,
 * violating the no-echo policy).
 */
function staticZodDetail(issue: ZodIssue): string {
  const field = issue.path.join(".") || "(root)";
  switch (issue.code) {
    case "too_small":
      return `${field}: must not be empty`;
    case "invalid_format":
      if (issue.format === "url") return `${field}: must be a valid URL`;
      return `${field}: invalid string format`;
    case "invalid_type":
      return `${field}: expected ${issue.expected}`;
    default:
      return `${field}: invalid value`;
  }
}

// ---------------------------------------------------------------------------
// Server factory (exported for testing)
// ---------------------------------------------------------------------------

export async function buildServer(opts: {
  clientId: string;
  clientSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  allowedOrigins: string[];
  /** Injected fetch implementation — defaults to globalThis.fetch */
  fetchFn?: OAuthFetchFn;
}): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: { level: "warn" } });

  // -------------------------------------------------------------------------
  // CORS — explicit allowlist, no wildcard with credentials
  // -------------------------------------------------------------------------
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow same-origin requests (no Origin header) e.g. container healthcheck
      if (origin === undefined || origin === "") {
        cb(null, true);
        return;
      }
      if (opts.allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        // Pass null (not an Error) so @fastify/cors returns a clean rejection
        // without an ACAO header — passing an Error here causes a 500.
        cb(null, false);
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  // -------------------------------------------------------------------------
  // Handler config — secret is scoped here, never returned to routes
  // -------------------------------------------------------------------------
  const nodeFetch: OAuthFetchFn =
    opts.fetchFn ??
    (async (url, init) => {
      const res = await (globalThis as unknown as { fetch: typeof fetch }).fetch(
        url,
        // Build the init object only with defined fields to satisfy
        // exactOptionalPropertyTypes — spread undefined keys are omitted.
        {
          ...(init?.method !== undefined ? { method: init.method } : {}),
          ...(init?.headers !== undefined ? { headers: init.headers as Record<string, string> } : {}),
          ...(init?.body !== undefined ? { body: init.body } : {}),
        }
      );
      return {
        ok: res.ok,
        status: res.status,
        json: () => res.json() as Promise<unknown>,
      };
    });

  const handlerConfig: HandlerConfig = {
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    fetch: nodeFetch,
  };

  const googleHandlerConfig: GoogleHandlerConfig = {
    googleClientId: opts.googleClientId,
    googleClientSecret: opts.googleClientSecret,
    fetch: nodeFetch,
  };

  // -------------------------------------------------------------------------
  // GET /oauth/health
  // -------------------------------------------------------------------------
  app.get("/oauth/health", async (_req, reply) => {
    return reply.status(200).send({ status: "ok" });
  });

  // -------------------------------------------------------------------------
  // POST /oauth/exchange
  // -------------------------------------------------------------------------
  app.post("/oauth/exchange", async (req, reply) => {
    const parsed = ExchangeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parsed.error.issues.map(staticZodDetail),
      });
    }

    const result = await exchange(parsed.data, handlerConfig);
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }
    return reply.status(200).send(result.data);
  });

  // -------------------------------------------------------------------------
  // POST /oauth/google/exchange
  // -------------------------------------------------------------------------
  app.post("/oauth/google/exchange", async (req, reply) => {
    const parsed = GoogleExchangeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parsed.error.issues.map(staticZodDetail),
      });
    }

    const result = await googleExchange(parsed.data, googleHandlerConfig);
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }
    return reply.status(200).send(result.data);
  });

  // -------------------------------------------------------------------------
  // POST /oauth/refresh
  // -------------------------------------------------------------------------
  app.post("/oauth/refresh", async (req, reply) => {
    const parsed = RefreshBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parsed.error.issues.map(staticZodDetail),
      });
    }

    const result = await refresh(parsed.data, handlerConfig);
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }
    return reply.status(200).send(result.data);
  });

  return app;
}

// ---------------------------------------------------------------------------
// Entrypoint — only runs when this module is the direct entry
// ---------------------------------------------------------------------------

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  new URL(import.meta.url).pathname === process.argv[1];

if (isMain) {
  const config = loadConfig();
  const app = await buildServer({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    googleClientId: config.googleClientId,
    googleClientSecret: config.googleClientSecret,
    allowedOrigins: config.allowedOrigins,
  });
  const address = await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`[oauth-backend] listening on ${address}`);
}

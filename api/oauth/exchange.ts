// POST /api/oauth/exchange — exchange a GitHub authorization code for a token.
// Reachable at /oauth/exchange via the vercel.json rewrite (same origin as the
// SPA, so VITE_OAUTH_BACKEND_URL stays empty).
import { runTokenHandler, exchangeCore, ExchangeBodySchema } from "./_shared.js";

export default function handler(req: Request): Promise<Response> {
  return runTokenHandler(req, ExchangeBodySchema, exchangeCore);
}

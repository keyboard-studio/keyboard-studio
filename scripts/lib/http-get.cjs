"use strict";

/**
 * Shared node:http(s) GET helper.
 *
 * Six call sites in this repo (four scripts/*.mjs fetchers, plus
 * utilities/spec-trace and utilities/crowdin-diagnose) each hand-rolled a
 * "GET a URL, buffer the response, fail loudly on a bad status" helper.
 * This module is the shared implementation for those six.
 *
 * A 7th similar-shaped helper -- utilities/kbgen/fetch-data.ts's get() --
 * was deliberately left unmigrated: it resolves on status instead of
 * rejecting, so callers can branch on a 404 without a try/catch. Folding it
 * in was out of scope for this pass.
 *
 * Two things this file will NOT do, on purpose:
 *
 * - It never accepts a `method` parameter. The HTTP method is the string
 *   literal 'GET' below, not a variable threaded through from a caller. A
 *   shared helper that took `method` (even with GET as a default) would
 *   demote "this call can only ever GET" from a structural guarantee to a
 *   convention an accidental edit could override -- which matters here
 *   because utilities/crowdin-diagnose relies on GET being unreachable-by-
 *   mistake to be safe to point at a real, uninspected production project.
 *   Only whitelisted options (headers, agent) are forwarded; nothing is
 *   spread from caller input into the request options.
 * - It never follows a redirect unless the caller opts in via
 *   `{ redirects: true }`. Default is off.
 */

const http = require("node:http");
const https = require("node:https");

const DEFAULT_MAX_REDIRECTS = 5;

/**
 * GET a URL and buffer the whole response body into a Buffer.
 * Rejects if the final response status is anything other than 200.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {boolean} [opts.redirects=false]     follow 3xx Location redirects
 * @param {number}  [opts.maxRedirects=5]      hops allowed when redirects is on
 * @param {Record<string,string>} [opts.headers]
 * @returns {Promise<Buffer>}
 */
function httpGet(url, opts = {}) {
  const { redirects = false, maxRedirects = DEFAULT_MAX_REDIRECTS, headers = {} } = opts;
  return getBuffer(url, headers, redirects, 0, maxRedirects);
}

function getBuffer(url, headers, followRedirects, hopCount, maxRedirects) {
  if (hopCount > maxRedirects) {
    return Promise.reject(new Error("Too many redirects"));
  }
  return new Promise((resolve, reject) => {
    const mod = new URL(url).protocol === "http:" ? http : https;
    const req = mod.request(url, { method: "GET", headers }, (resp) => {
      if (
        followRedirects &&
        resp.statusCode >= 300 &&
        resp.statusCode < 400 &&
        resp.headers.location
      ) {
        resolve(getBuffer(resp.headers.location, headers, followRedirects, hopCount + 1, maxRedirects));
        resp.resume();
        return;
      }
      if (resp.statusCode !== 200) {
        reject(new Error(`HTTP ${resp.statusCode} from ${url}`));
        resp.resume();
        return;
      }
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => resolve(Buffer.concat(chunks)));
      resp.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Lower-level GET primitive for callers that need to inspect the status
 * themselves rather than have this helper decide pass/fail (e.g. a caller
 * that treats 404 as a meaningful, non-error result). Buffers the response
 * as a utf-8 string. Never follows redirects. Only rejects on a transport-
 * level error (DNS, connection refused, etc.), never on the response status.
 *
 * Method is the same hardcoded 'GET' literal as httpGet above -- there is no
 * `method` field anywhere in `opts`, so nothing here can send anything else.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.headers]
 * @param {import('node:http').Agent | import('node:https').Agent} [opts.agent]
 * @returns {Promise<{ statusCode: number, statusMessage: string, body: string }>}
 */
function httpGetRaw(url, opts = {}) {
  const { headers = {}, agent } = opts;
  return new Promise((resolve, reject) => {
    const mod = new URL(url).protocol === "http:" ? http : https;
    const requestOptions = agent ? { method: "GET", headers, agent } : { method: "GET", headers };
    const req = mod.request(url, requestOptions, (resp) => {
      let body = "";
      resp.setEncoding("utf8");
      resp.on("data", (chunk) => (body += chunk));
      resp.on("end", () => {
        resolve({ statusCode: resp.statusCode, statusMessage: resp.statusMessage || "", body });
      });
      resp.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

module.exports = { httpGet, httpGetRaw };

import os from "os";
import fs from "fs";
import path from "path";
import { AnthropicBase } from "./base.js";
import type { LLMClientConfig } from "../types.js";

// Full Claude Code OAuth integration (without any API key) is deferred —
// this mode currently requires either an API key in ~/.claude/settings.json
// or ANTHROPIC_API_KEY.

function resolveKey(config: LLMClientConfig): string {
  // 1. Explicit key in config
  if (config.apiKey) {
    return config.apiKey;
  }

  // 2. Read ~/.claude/settings.json
  try {
    const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed["apiKey"] === "string" && parsed["apiKey"].length > 0) {
      return parsed["apiKey"];
    }
  } catch {
    // File may not exist or may not be valid JSON — fall through.
  }

  // 3. Environment variable
  const envKey = process.env["ANTHROPIC_API_KEY"];
  if (envKey) {
    return envKey;
  }

  throw new Error(
    "[keyboard-studio/llm] dev-subscription mode: no API key found. " +
      "Set ANTHROPIC_API_KEY or add an apiKey field to ~/.claude/settings.json, " +
      "or run `claude login` to configure the Claude CLI."
  );
}

/**
 * Dev-subscription backend: resolves the Anthropic API key from (in order)
 * config.apiKey, ~/.claude/settings.json `.apiKey`, or ANTHROPIC_API_KEY env var.
 */
export class ClaudeSubscriptionBackend extends AnthropicBase {
  constructor(config: LLMClientConfig) {
    if (typeof (globalThis as Record<string, unknown>)["window"] !== "undefined") {
      throw new Error(
        "[keyboard-studio/llm] dev-subscription mode is not available in browser environments. Use prod-api mode or provide config.apiKey."
      );
    }
    super(config, resolveKey(config));
  }
}

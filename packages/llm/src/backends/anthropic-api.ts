import { AnthropicBase } from "./base.js";
import type { LLMClientConfig } from "../types.js";

/**
 * Prod-API backend: resolves the Anthropic API key from config or the
 * ANTHROPIC_API_KEY environment variable.
 */
export class AnthropicApiBackend extends AnthropicBase {
  constructor(config: LLMClientConfig) {
    const key = config.apiKey ?? process.env["ANTHROPIC_API_KEY"];
    if (!key) {
      throw new Error(
        "[keyboard-studio/llm] prod-api mode requires ANTHROPIC_API_KEY env var or config.apiKey"
      );
    }
    super(config, key);
  }
}

import { AnthropicApiBackend } from "./backends/anthropic-api.js";
import { ClaudeSubscriptionBackend } from "./backends/claude-subscription.js";
import type { LLMClient, LLMClientConfig } from "./types.js";

export function createLLMClient(config: LLMClientConfig): LLMClient {
  switch (config.mode) {
    case "prod-api":
      return new AnthropicApiBackend(config);
    case "dev-subscription":
      return new ClaudeSubscriptionBackend(config);
    default: {
      const _: never = config.mode;
      throw new Error(`[keyboard-studio/llm] Unknown mode: ${_}`);
    }
  }
}

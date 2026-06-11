import Anthropic from "@anthropic-ai/sdk";
import type { LLMClient, LLMClientConfig, Message, CompleteOptions } from "../types.js";

export const DEFAULT_MODEL = "claude-opus-4-5";
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Base implementation of LLMClient backed by the Anthropic SDK.
 * Subclasses are responsible for resolving the API key and calling super().
 */
export abstract class AnthropicBase implements LLMClient {
  protected readonly client: Anthropic;
  protected readonly model: string;

  constructor(config: LLMClientConfig, apiKey: string) {
    this.client = new Anthropic({ apiKey });
    this.model = config.model ?? DEFAULT_MODEL;
  }

  async complete(prompt: string, opts?: CompleteOptions): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(opts?.system !== undefined ? { system: opts.system } : {}),
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0];
    if (!block || block.type !== "text") {
      throw new Error(
        `[keyboard-studio/llm] Unexpected response content: ${JSON.stringify(msg.content)}`
      );
    }
    return block.text;
  }

  async chat(messages: Message[], opts?: CompleteOptions): Promise<string> {
    const sdkMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(opts?.system !== undefined ? { system: opts.system } : {}),
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      messages: sdkMessages,
    });
    const block = msg.content[0];
    if (!block || block.type !== "text") {
      throw new Error(
        `[keyboard-studio/llm] Unexpected response content: ${JSON.stringify(msg.content)}`
      );
    }
    return block.text;
  }

  async *completeStream(prompt: string, opts?: CompleteOptions): AsyncIterable<string> {
    try {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(opts?.system !== undefined ? { system: opts.system } : {}),
        ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
        messages: [{ role: "user", content: prompt }],
        stream: true,
      });
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    } catch (err) {
      throw new Error(
        `[keyboard-studio/llm] Stream error: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }
}

import Anthropic from "@anthropic-ai/sdk";
import type { LLMClient, LLMClientConfig, Message, CompleteOptions } from "../types.js";

export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const DEFAULT_MAX_TOKENS = 4096;

/** Shared SDK request options derived from CompleteOptions. */
type SharedParams = {
  model: string;
  max_tokens: number;
  system?: string;
  temperature?: number;
};

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

  /** Build the shared SDK call parameters from CompleteOptions. */
  private _sharedParams(opts?: CompleteOptions): SharedParams {
    const params: SharedParams = {
      model: this.model,
      max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    if (opts?.system !== undefined) params.system = opts.system;
    if (opts?.temperature !== undefined) params.temperature = opts.temperature;
    return params;
  }

  /** Extract the text from a non-streaming SDK response, throwing on unexpected shapes. */
  private _extractText(msg: Anthropic.Message): string {
    const block = msg.content[0];
    if (!block || block.type !== "text") {
      throw new Error(
        `[keyboard-studio/llm] Unexpected response content: ${JSON.stringify(msg.content)}`
      );
    }
    return block.text;
  }

  async complete(prompt: string, opts?: CompleteOptions): Promise<string> {
    const msg = await this.client.messages.create({
      ...this._sharedParams(opts),
      messages: [{ role: "user", content: prompt }],
    });
    return this._extractText(msg);
  }

  async chat(messages: Message[], opts?: CompleteOptions): Promise<string> {
    const sdkMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const msg = await this.client.messages.create({
      ...this._sharedParams(opts),
      messages: sdkMessages,
    });
    return this._extractText(msg);
  }

  async *completeStream(prompt: string, opts?: CompleteOptions): AsyncIterable<string> {
    try {
      const stream = await this.client.messages.create({
        ...this._sharedParams(opts),
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

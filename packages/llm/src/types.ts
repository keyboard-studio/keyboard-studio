export type LLMMode = "dev-subscription" | "prod-api";

export interface LLMClientConfig {
  mode: LLMMode;
  model?: string;
  apiKey?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMClient {
  complete(prompt: string, options?: CompleteOptions): Promise<string>;
  chat(messages: Message[], options?: CompleteOptions): Promise<string>;
  completeStream(prompt: string, options?: CompleteOptions): AsyncIterable<string>;
}

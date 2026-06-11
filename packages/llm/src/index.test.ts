import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLLMClient } from "./client.js";
import { DEFAULT_MODEL } from "./backends/base.js";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class AuthenticationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "AuthenticationError";
    }
  }
  class RateLimitError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "RateLimitError";
    }
  }
  class APIError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "APIError";
    }
  }

  const Anthropic = vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } };
  });
  (Anthropic as unknown as Record<string, unknown>).AuthenticationError = AuthenticationError;
  (Anthropic as unknown as Record<string, unknown>).RateLimitError = RateLimitError;
  (Anthropic as unknown as Record<string, unknown>).APIError = APIError;

  return { default: Anthropic };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTextResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

async function* makeStreamEvents(texts: string[]) {
  for (const text of texts) {
    yield {
      type: "content_block_delta",
      delta: { type: "text_delta", text },
    };
  }
  // Also emit an irrelevant event to confirm it is skipped
  yield { type: "message_stop" };
}

async function* makeStreamWithMidError(firstChunk: string, errorMsg: string) {
  yield {
    type: "content_block_delta",
    delta: { type: "text_delta", text: firstChunk },
  };
  throw new Error(errorMsg);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createLLMClient", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockCreate.mockReset();
  });

  // 1. prod-api throws without any key
  it("prod-api throws when no API key is present", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() =>
      createLLMClient({ mode: "prod-api" })
    ).toThrow("ANTHROPIC_API_KEY");
  });

  // 2. prod-api complete() returns text from SDK response
  it("prod-api complete() returns the text from the SDK response", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    mockCreate.mockResolvedValueOnce(makeTextResponse("hello"));

    const client = createLLMClient({ mode: "prod-api" });
    const result = await client.complete("say hello");
    expect(result).toBe("hello");
  });

  // 3. dev-subscription uses ANTHROPIC_API_KEY env var when no config key or settings file
  it("dev-subscription resolves API key from ANTHROPIC_API_KEY env var", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-env-key");
    mockCreate.mockResolvedValueOnce(makeTextResponse("env-response"));

    const client = createLLMClient({ mode: "dev-subscription" });
    const result = await client.complete("ping");
    expect(result).toBe("env-response");
  });

  // 4. chat() passes the messages array through to the SDK
  it("chat() passes the messages array to the SDK", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    mockCreate.mockResolvedValueOnce(makeTextResponse("ack"));

    const client = createLLMClient({ mode: "prod-api" });
    const messages = [
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi there" },
      { role: "user" as const, content: "How are you?" },
    ];
    const result = await client.chat(messages);
    expect(result).toBe("ack");

    const callArg = mockCreate.mock.calls[0][0] as { messages: unknown[] };
    expect(callArg.messages).toHaveLength(3);
    expect(callArg.messages[0]).toEqual({ role: "user", content: "Hello" });
    expect(callArg.messages[2]).toEqual({ role: "user", content: "How are you?" });
  });

  // 5. completeStream() yields text from content_block_delta events
  it("completeStream() yields text from streaming events", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    mockCreate.mockResolvedValueOnce(makeStreamEvents(["Hello", ", ", "world!"]));

    const client = createLLMClient({ mode: "prod-api" });
    const chunks: string[] = [];
    for await (const chunk of client.completeStream("stream this")) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["Hello", ", ", "world!"]);
  });

  // 6. AuthenticationError propagates from complete() — not swallowed
  it("complete() propagates AuthenticationError without swallowing it", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    // Retrieve the mock AuthenticationError class from the mock module
    const Anthropic = (await import("@anthropic-ai/sdk")).default as unknown as {
      AuthenticationError: new (msg: string) => Error;
    };
    const authErr = new Anthropic.AuthenticationError("bad key");
    mockCreate.mockRejectedValueOnce(authErr);

    const client = createLLMClient({ mode: "prod-api" });
    await expect(client.complete("test")).rejects.toThrow("bad key");
  });

  // 7. Empty content array causes complete() to throw a named error
  it("complete() throws with 'Unexpected response content' when content array is empty", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    mockCreate.mockResolvedValueOnce({ content: [] });

    const client = createLLMClient({ mode: "prod-api" });
    await expect(client.complete("test")).rejects.toThrow("Unexpected response content");
  });

  // 8. Mid-stream error propagates (after yielding the first chunk)
  it("completeStream() propagates mid-stream errors after yielding initial chunks", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    mockCreate.mockResolvedValueOnce(makeStreamWithMidError("first chunk", "network failure"));

    const client = createLLMClient({ mode: "prod-api" });
    const chunks: string[] = [];
    await expect(async () => {
      for await (const chunk of client.completeStream("test")) {
        chunks.push(chunk);
      }
    }).rejects.toThrow("Stream error");

    // The first chunk must have been yielded before the error
    expect(chunks).toEqual(["first chunk"]);
  });

  // 9. Omitting config.model resolves to DEFAULT_MODEL (cost guard — refs #290)
  it("omitting config.model uses DEFAULT_MODEL", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    mockCreate.mockResolvedValueOnce(makeTextResponse("ok"));

    const client = createLLMClient({ mode: "prod-api" });
    await client.complete("ping");

    const callArg = mockCreate.mock.calls[0][0] as { model: string };
    expect(callArg.model).toBe(DEFAULT_MODEL);
  });
});

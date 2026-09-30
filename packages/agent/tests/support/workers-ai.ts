/**
 * Workers AI's stream for GLM-5.3 Flash calling one tool, as the AI binding
 * returned it: nulls where OpenAI leaves fields out, token counts on each
 * chunk, and the totals in a last event of their own.
 */
export const toolCallStream = [
  `{"choices":[{"delta":{"content":"","reasoning_content":null,"role":"assistant"},"finish_reason":null,"index":0,"logprobs":null}],"created":1790788667,"id":"chat_1","model":"@cf/zai-org/glm-5.3-flash","object":"chat.completion.chunk","usage":{"prompt_tokens":172,"completion_tokens":0,"total_tokens":172,"prompt_tokens_details":{"cached_tokens":0}}}`,
  `{"choices":[{"delta":{"content":null,"reasoning_content":null,"role":null,"tool_calls":[{"function":{"arguments":"","name":"set_heading"},"id":"call_1","index":0,"type":"function"}]},"finish_reason":null,"index":0,"logprobs":null}],"created":1790788667,"id":"chat_1","model":"@cf/zai-org/glm-5.3-flash","object":"chat.completion.chunk","usage":{"prompt_tokens":0,"completion_tokens":9,"total_tokens":9}}`,
  `{"choices":[{"delta":{"content":null,"reasoning_content":null,"role":null,"tool_calls":[{"function":{"arguments":"{\\"block\\": \\"b_hero","name":null},"id":null,"index":0,"type":"function"}]},"finish_reason":null,"index":0,"logprobs":null}],"created":1790788667,"id":"chat_1","model":"@cf/zai-org/glm-5.3-flash","object":"chat.completion.chunk","usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}}`,
  `{"choices":[{"delta":{"content":null,"reasoning_content":null,"role":null,"tool_calls":[{"function":{"arguments":"\\", \\"heading\\": \\"Hello there\\"}","name":null},"id":null,"index":0,"type":"function"}]},"finish_reason":null,"index":0,"logprobs":null}],"created":1790788667,"id":"chat_1","model":"@cf/zai-org/glm-5.3-flash","object":"chat.completion.chunk","usage":{"prompt_tokens":0,"completion_tokens":8,"total_tokens":8}}`,
  `{"choices":[{"delta":{"reasoning_content":null},"finish_reason":"tool_calls","index":0,"logprobs":null}],"created":1790788667,"id":"chat_1","model":"@cf/zai-org/glm-5.3-flash","object":"chat.completion.chunk","usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}}`,
  `{"choices":[],"created":1790788667,"id":"chat_1","model":"@cf/zai-org/glm-5.3-flash","object":"chat.completion.chunk","usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}}`,
  `{"response":"","usage":{"prompt_tokens":172,"completion_tokens":19,"total_tokens":191,"prompt_tokens_details":{"cached_tokens":64}}}`,
  "[DONE]",
];

/** Server-sent events as a response body, split at awkward places as a network would. */
export const eventStream = (events: ReadonlyArray<string>) => {
  const text = events.map((event) => `data: ${event}\n\n`).join("");
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += 37) controller.enqueue(bytes.slice(at, at + 37));
      controller.close();
    },
  });
};

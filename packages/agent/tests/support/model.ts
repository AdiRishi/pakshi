import { Effect, Layer, Stream } from "effect";
import { AiError, LanguageModel, type Response } from "effect/unstable/ai";

/** A reply the scripted model streams: text, tool calls, or a failure. */
export type Reply =
  | { readonly text: string }
  | { readonly calls: ReadonlyArray<{ readonly name: string; readonly params: object }> }
  | { readonly fail: AiError.AiErrorReason };

const usage = {
  inputTokens: { uncached: 10, total: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: undefined, reasoning: undefined },
};

const partsOf = (reply: Reply, step: number): Array<Response.StreamPartEncoded> => {
  if ("text" in reply)
    return [
      { type: "text-start", id: `text${step}` },
      { type: "text-delta", id: `text${step}`, delta: reply.text },
      { type: "text-end", id: `text${step}` },
      { type: "finish", reason: "stop", usage, response: undefined },
    ];
  if ("calls" in reply)
    return [
      ...reply.calls.flatMap((call, index): Array<Response.StreamPartEncoded> => [
        { type: "tool-params-start", id: `call${step}_${index}`, name: call.name },
        { type: "tool-call", id: `call${step}_${index}`, name: call.name, params: call.params },
      ]),
      { type: "finish", reason: "tool-calls", usage, response: undefined },
    ];
  return [];
};

/**
 * A model that replies from a script, one reply per call, and records what
 * it was asked. When the script runs out, it answers "Done."
 */
export const scriptedModel = (script: ReadonlyArray<Reply>) => {
  const calls: Array<LanguageModel.ProviderOptions> = [];
  const layer = Layer.effect(LanguageModel.LanguageModel)(
    LanguageModel.make({
      generateText: () => Effect.succeed([]),
      streamText: (options) => {
        calls.push(options);
        const reply = script[calls.length - 1] ?? { text: "Done." };
        if ("fail" in reply)
          return Stream.fail(
            AiError.make({ module: "Test", method: "streamText", reason: reply.fail }),
          );
        return Stream.fromIterable(partsOf(reply, calls.length));
      },
    }),
  );
  return { calls, layer };
};

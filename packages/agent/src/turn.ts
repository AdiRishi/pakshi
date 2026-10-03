import type { TurnStatus } from "@repo/contracts/agent";
import {
  chat,
  type ChatMiddleware,
  maxIterations,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";
import { type Context, Option, Schema } from "effect";

import { Refused, serverTools } from "./handlers.ts";
import { type LanguageModel, modelOptions } from "./model.ts";
import { waitingTools } from "./tools.ts";
import type { TurnServices } from "./workspace.ts";

/*
 * One turn of a conversation: the model streams text and tool calls, the
 * tools run, and their results go back to the model, until it answers
 * without a tool call, waits for the person, or runs out of steps. The
 * person follows it all in the chat as it happens.
 */

/** The most model calls a turn makes. Building a site takes one per section. */
const maxSteps = 60;

/** Refused tool calls in a row after which the agent stops trying: the first attempt and two repairs. */
const attempts = 3;

const giveUp =
  "Your last three tool calls were refused. Don't try again. Tell me in plain language what went wrong and what I could do about it.";

/**
 * A model call AI Gateway refused, as it does once the product's spend limit
 * is reached: with HTTP status 429, and its own error code 2003 when it
 * gives one.
 */
const readRefusal = Schema.decodeUnknownOption(
  Schema.Struct({ code: Schema.Literals(["429", "2003"]) }),
);

export interface TurnOptions {
  readonly model: LanguageModel;
  /** The conversation so far, ending with the person's message. */
  readonly messages: ReadonlyArray<ModelMessage>;
  readonly system: string;
  /** What the model reads with the person's message, such as the outline, the page they have open and who is typing where. */
  readonly context: string;
  readonly services: Context.Context<TurnServices>;
  readonly threadId: string;
  readonly runId: string;
  readonly abortController: AbortController;
  /** Keeps the conversation as it stands, after each model call's tools and when the turn ends, so a turn cut off later keeps what it got through. */
  readonly save: (messages: ReadonlyArray<ModelMessage>) => Promise<void>;
}

export interface RunningTurn {
  readonly events: AsyncIterable<StreamChunk>;
  /** How the turn ended, once its events have. A turn the person stops ends as stopped. */
  readonly status: () => TurnStatus;
}

/**
 * Runs one turn: the agent's policy over `chat`'s loop. After three refused
 * calls in a row it explains instead of trying again; after a tool that
 * waits for the person, the turn ends; a tool that fails for any other
 * reason ends it as failed.
 */
export const runTurn = (options: TurnOptions): RunningTurn => {
  let status: TurnStatus = "done";
  let refused = 0;
  let waiting = false;
  const policy: ChatMiddleware<Context.Context<TurnServices>> = {
    name: "pakshi-turn",
    onConfig(ctx, config) {
      if (ctx.phase !== "beforeModel") return;
      // What the model reads, never what the conversation keeps: the context
      // just before the person's newest message, and the nudge to give up.
      const messages = config.providerMessages ?? config.messages;
      const last = messages.findLastIndex((message) => message.role === "user");
      const withContext = messages.toSpliced(last, 0, { role: "user", content: options.context });
      if (refused < attempts) return { providerMessages: withContext };
      return {
        providerMessages: [...withContext, { role: "user", content: giveUp }],
        tools: [],
      };
    },
    onIteration: (ctx) => options.save(ctx.messages),
    onAfterToolCall(ctx, { toolName, ok, error }) {
      if (!ok && !(error instanceof Refused)) {
        console.error("A tool of the agent's failed", toolName, error);
        status = "failed";
        ctx.abort("A tool failed");
        return;
      }
      if (!ok) console.info("The agent's tool call was refused", toolName, error);
      refused = ok ? 0 : refused + 1;
      if (ok && waitingTools.has(toolName)) waiting = true;
    },
    onShouldContinue: () => !waiting,
    onFinish: (ctx) => options.save(ctx.messages),
    async onAbort(ctx) {
      if (status === "done") status = "stopped";
      await options.save(ctx.messages);
    },
    async onError(ctx, { error }) {
      console.warn("A model call failed, so the turn ended", error);
      status = Option.isSome(readRefusal(error)) ? "unavailable" : "failed";
      await options.save(ctx.messages);
    },
  };
  const events = chat({
    adapter: options.model,
    messages: [...options.messages],
    systemPrompts: [options.system],
    tools: serverTools,
    context: options.services,
    modelOptions,
    agentLoopStrategy: maxIterations(maxSteps),
    toolExecution: "sequential",
    threadId: options.threadId,
    runId: options.runId,
    abortController: options.abortController,
    middleware: [policy],
  });
  return { events, status: () => status };
};

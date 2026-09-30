import type { TurnStatus } from "@repo/contracts/agent";
import { Effect, Ref, Stream } from "effect";
import { type AiError, type Chat, Prompt } from "effect/unstable/ai";

import { agentHandlers } from "./handlers.ts";
import { AgentTools, editingTools, waitingTools } from "./tools.ts";
import { Turn } from "./workspace.ts";

/*
 * One turn of a conversation: the model streams text and tool calls, the
 * tools run, and their results go back to the model, until it answers
 * without a tool call, waits for the person, or runs out of steps. The
 * person follows it all in the chat as it happens.
 */

/** The most model calls a turn makes. Building a site takes one per section. */
const maxSteps = 60;

/** Refused changes in a row after which the agent stops trying: the first attempt and two repairs. */
const attempts = 3;

const giveUp = Prompt.make([
  {
    role: "user",
    content:
      "Your last changes were refused three times in a row. Don't try again. Tell me in plain language what went wrong and what I could do about it.",
  },
]);

/** What the chat shows while a tool runs, and if it fails. */
const toolWords = new Map<string, readonly [running: string, failed: string]>([
  ["get_site_outline", ["Looking over the site", "Couldn't read the site"]],
  ["get_page", ["Reading the page", "Couldn't read the page"]],
  ["get_block_contract", ["Checking a block", "Couldn't check the block"]],
  ["get_recipe", ["Reading a recipe", "Couldn't read the recipe"]],
  ["read_source", ["Reading a document", "Couldn't read the document"]],
  ["apply_ops", ["Changing the page", "Couldn't make that change"]],
  ["insert_section", ["Adding a section", "Couldn't add the section"]],
  ["create_page", ["Creating a page", "Couldn't create the page"]],
  ["get_preview_link", ["Getting the preview link", "Couldn't get the preview link"]],
  ["fetch_url", ["Reading a web page", "Couldn't read the web page"]],
  ["ask_user", ["Asking you", "Couldn't ask"]],
  ["propose_plan", ["Planning the site", "Couldn't show the plan"]],
  ["prepare_submission", ["Checking the draft", "Couldn't check the draft"]],
  ["request_block", ["Requesting a block", "Couldn't request the block"]],
]);

const words = (tool: string) => toolWords.get(tool) ?? ["Working", "Something went wrong"];

/** How a model failure ends a turn. AI Gateway refuses requests once the product's spend limit is reached. */
const endedBy = (error: AiError.AiError): TurnStatus =>
  error.reason._tag === "RateLimitError" ? "unavailable" : "failed";

/**
 * Runs one turn of a conversation, from the person's message, with the
 * conversation's history in `chat` and its current system prompt, and says
 * how it ended. A turn the person stops is interrupted instead.
 */
export const runTurn = Effect.fn("Agent.runTurn")(
  function* (options: {
    readonly chat: Chat.Chat;
    readonly system: string;
    readonly message: string;
  }) {
    const turn = yield* Turn;
    const tools = yield* AgentTools;
    yield* Ref.update(options.chat.history, Prompt.setSystem(options.system));
    let prompt: Prompt.RawInput = options.message;
    let refused = 0;
    let givenUp = false;
    let texts = 0;
    for (let step = 0; step < maxSteps; step++) {
      let calls = 0;
      let waiting = false;
      const textIds = new Map<string, string>();
      yield* options.chat
        .streamText({
          prompt,
          toolkit: tools,
          toolChoice: givenUp ? "none" : "auto",
          concurrency: 1,
        })
        .pipe(
          Stream.runForEach((part) => {
            switch (part.type) {
              case "text-start": {
                texts += 1;
                const id = `${turn.id}_text${texts}`;
                textIds.set(part.id, id);
                return turn.show({ _tag: "Text", id, text: "" });
              }
              case "text-delta": {
                const id = textIds.get(part.id);
                return id === undefined ? Effect.void : turn.write(id, part.delta);
              }
              case "tool-params-start":
                return turn.show({
                  _tag: "Activity",
                  id: part.id,
                  label: words(part.name)[0],
                  status: "running",
                  changed: false,
                  at: null,
                });
              case "tool-result": {
                calls += 1;
                if (waitingTools.has(part.name) && !part.isFailure) waiting = true;
                if (editingTools.has(part.name)) refused = part.isFailure ? refused + 1 : 0;
                return part.isFailure
                  ? turn.show({
                      _tag: "Activity",
                      id: part.id,
                      label: words(part.name)[1],
                      status: "failed",
                      changed: false,
                      at: null,
                    })
                  : Effect.void;
              }
              default:
                return Effect.void;
            }
          }),
        );
      if (waiting || calls === 0) break;
      if (refused >= attempts && !givenUp) {
        givenUp = true;
        prompt = giveUp;
      } else prompt = Prompt.empty;
    }
    return "done" as const;
  },
  Effect.catchTag("AiError", (error) => Effect.succeed(endedBy(error))),
  Effect.provide(agentHandlers),
);

import { loadBlocks } from "@repo/blocks";
import type { Selected, SitePlan } from "@repo/contracts/agent";
import { emptyVoiceGuide, type VoiceGuide } from "@repo/contracts/brand";
import type { Draft } from "@repo/contracts/draft";
import { PageId, SourceId } from "@repo/contracts/ids";
import { type ModelMessage, StreamProcessor, type UIMessage } from "@tanstack/ai";
import { Effect, Layer } from "effect";

import { languageModel, type Task } from "../../src/model.ts";
import { systemPrompt, turnContext } from "../../src/prompt.ts";
import { runTurn } from "../../src/turn.ts";
import { desk } from "../../tests/support/workspace.ts";

const person = { id: "user_eval", name: "Sam Okafor" };

/** What the evals reach AI Gateway with, from the environment. */
const setting = (name: string) => {
  const value = process.env[name];
  if (value === undefined || value === "")
    throw new Error(`Set ${name} to run the evals. See packages/agent/evals/README.md.`);
  return value;
};

/**
 * The model for a task over Workers AI's REST API, through the stage's AI
 * Gateway. The gateway logs the evals' calls tagged with the brand "eval",
 * so their cost is tracked apart from people's.
 */
export const evalModel = (task: Task, site = "site_harbour") =>
  languageModel(
    { accountId: setting("CLOUDFLARE_ACCOUNT_ID"), apiKey: setting("CLOUDFLARE_API_TOKEN") },
    setting("AI_GATEWAY_ID"),
    { brand: "eval", site, person: person.id },
    task,
  );

/** What the agent did and said in a conversation, in one line. */
const transcript = (chat: ReadonlyArray<UIMessage>) =>
  chat
    .flatMap((message) => message.parts)
    .flatMap((part) => {
      switch (part.type) {
        case "tool-call":
          return [`[${part.name}${part.state === "error" ? " refused" : ""}]`];
        case "text":
          return part.content.trim() === "" ? [] : [`"${part.content.trim()}"`];
        default:
          return [];
      }
    })
    .join(" ");

/**
 * One conversation with the real model against a draft in memory: each
 * message is a turn, as the chat panel sends them. Returns the draft as the
 * agent left it and the conversation as the chat showed it.
 */
export const converse = (options: {
  readonly draft: Draft;
  readonly messages: ReadonlyArray<string>;
  readonly brief?: SitePlan;
  /** The brand's voice guide, or none. */
  readonly voice?: VoiceGuide;
  readonly selected?: Selected;
  readonly links?: ReadonlyArray<string>;
  readonly sources?: ReadonlyArray<{ readonly name: string; readonly markdown: string }>;
  readonly pages?: Readonly<Record<string, string>>;
}) => {
  // The evals never stop a turn.
  const stop = new AbortController();
  return Effect.gen(function* () {
    const { state, layer } = yield* Effect.promise(() => desk(options.draft, options));
    const contracts = yield* Effect.promise(() => loadBlocks(options.draft.lockfile));
    const services = yield* Effect.scoped(Layer.build(layer));
    const model = evalModel("edit", options.draft.site);
    const processor = new StreamProcessor();
    let thread: ReadonlyArray<ModelMessage> = [];
    const statuses: Array<string> = [];
    for (const message of options.messages) {
      const page = options.selected?.page ?? PageId.make("pg_home");
      const turn = runTurn({
        model,
        messages: [...thread, { role: "user", content: message }],
        system: systemPrompt(contracts, options.voice ?? emptyVoiceGuide, options.brief ?? null),
        context: turnContext({
          draft: state.draft,
          contracts,
          person,
          page: state.draft.pages[page],
          selected: options.selected ?? null,
          typing: [],
          sources: Array.from(state.sources, ([id, source]) => ({
            id: SourceId.make(id),
            name: source.name,
            size: source.markdown.length,
          })),
        }),
        services,
        threadId: "thread_eval",
        runId: `run_eval${statuses.length}`,
        abortController: stop,
        save: async (messages) => {
          thread = messages;
        },
      });
      yield* Effect.promise(async () => {
        for await (const event of turn.events) processor.processChunk(event);
      });
      statuses.push(turn.status());
    }
    processor.finalizeStream();
    const chat = processor.getMessages();
    // Every conversation's transcript goes in the report, so a failed task shows what happened.
    process.stdout.write(
      `\n> ${options.messages.join(" / ")}\n  ${statuses.join(", ")}: ${transcript(chat)}\n`,
    );
    return { state, statuses, contracts, chat };
  });
};

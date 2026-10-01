import { loadBlocks } from "@repo/blocks";
import type { Part, Selected, SitePlan } from "@repo/contracts/agent";
import { emptyVoiceGuide, type VoiceGuide } from "@repo/contracts/brand";
import type { Draft } from "@repo/contracts/draft";
import { PageId, SourceId } from "@repo/contracts/ids";
import { Effect, Layer } from "effect";
import { Chat } from "effect/unstable/ai";

import { languageModel } from "../../src/model.ts";
import { systemPrompt, turnContext } from "../../src/prompt.ts";
import { runTurn } from "../../src/turn.ts";
import { desk } from "../../tests/support/workspace.ts";
import { restGateway } from "./gateway.ts";

const person = { id: "user_eval", name: "Sam Okafor" };

/** What the agent did and said in a conversation, in one line. */
const transcript = (parts: ReadonlyArray<Part>) =>
  parts
    .flatMap((part) => {
      switch (part._tag) {
        case "Activity":
          return [`[${part.label}]`];
        case "Text":
          return part.text.trim() === "" ? [] : [`"${part.text.trim()}"`];
        case "Question":
          return [`[asked: ${part.question}]`];
        default:
          return [`[${part._tag}]`];
      }
    })
    .join(" ");

/**
 * One conversation with the real model against a draft in memory: each
 * message is a turn, as the chat panel sends them. Returns the draft as the
 * agent left it and everything the chat showed.
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
}) =>
  Effect.gen(function* () {
    const { state, layer } = yield* Effect.promise(() => desk(options.draft, options));
    const contracts = yield* Effect.promise(() => loadBlocks(options.draft.lockfile));
    const model = languageModel(
      restGateway(),
      { brand: "eval", site: options.draft.site, person: person.id },
      "edit",
    );
    const chat = yield* Chat.empty;
    const statuses: Array<string> = [];
    for (const message of options.messages) {
      const page = options.selected?.page ?? PageId.make("pg_home");
      const context = turnContext({
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
      });
      statuses.push(
        yield* runTurn({
          chat,
          system: systemPrompt(contracts, options.voice ?? emptyVoiceGuide, options.brief ?? null),
          message: `${context}\n\n${message}`,
          afterStep: Effect.void,
        }).pipe(Effect.provide(Layer.merge(layer, model))),
      );
    }
    // Every conversation's transcript goes in the report, so a failed task shows what happened.
    process.stdout.write(
      `\n> ${options.messages.join(" / ")}\n  ${statuses.join(", ")}: ${transcript(state.parts)}\n`,
    );
    return { state, statuses, contracts };
  });

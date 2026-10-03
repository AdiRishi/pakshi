import type { Draft } from "@repo/contracts/draft";
import type { ModelMessage } from "@tanstack/ai";
import { Context, Effect, Layer } from "effect";

import { runTurn } from "../../src/turn.ts";
import type { Workspace } from "../../src/workspace.ts";
import { follow } from "./chat.ts";
import { harbourDraft } from "./draft.ts";
import { scriptedModel } from "./model.ts";
import { desk } from "./workspace.ts";

/**
 * Runs a turn against the Harbour draft, or another, with the model replying
 * from a script, and follows it as the chat panel does.
 */
export const turnWith = (
  script: Parameters<typeof scriptedModel>[0],
  message = "Make the page better.",
  options: Parameters<typeof desk>[1] & {
    readonly draft?: Draft;
    readonly workspace?: (layer: Layer.Layer<Workspace>) => Layer.Layer<Workspace>;
    readonly abortController?: AbortController;
    readonly system?: string;
  } = {},
) => {
  const stop = options.abortController ?? new AbortController();
  return Effect.gen(function* () {
    const { state, layer, contracts } = yield* Effect.promise(() =>
      desk(options.draft ?? harbourDraft, options),
    );
    const { model, requests } = scriptedModel(script);
    const workspace = options.workspace?.(layer) ?? Layer.empty;
    // The test's own services, its clock among them, with the turn's.
    const services = Context.merge(
      yield* Effect.context(),
      yield* Effect.scoped(Layer.build(Layer.provideMerge(workspace, layer))),
    );
    const saved: Array<ReadonlyArray<ModelMessage>> = [];
    const turn = runTurn({
      model,
      messages: [{ role: "user", content: message }],
      system: options.system ?? "You edit pages.",
      context: "<context>The draft is the Harbour Summer School's.</context>",
      services,
      threadId: "thread_test",
      runId: "run_test",
      abortController: stop,
      save: async (messages) => {
        saved.push(messages);
      },
    });
    const chat = yield* Effect.promise(() => follow(turn.events));
    return { status: turn.status(), state, contracts, requests, chat, saved };
  });
};

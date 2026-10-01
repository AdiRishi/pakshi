import { loadBlocks } from "@repo/blocks";
import type { Part, Selected } from "@repo/contracts/agent";
import type { Draft } from "@repo/contracts/draft";
import { BatchId, PageId, randomId, SourceId, TurnId } from "@repo/contracts/ids";
import type { Op } from "@repo/contracts/ops";
import { commitBatch, type Writes } from "@repo/domain/commit";
import { freeze } from "@repo/domain/freeze";
import { Effect, Layer, Option } from "effect";

import {
  BlockRequests,
  Sources,
  Turn,
  type TypingIn,
  Web,
  Workspace,
} from "../../src/workspace.ts";

/**
 * A draft held in memory, which the agent's tools change through the real
 * document module, as SiteDoc does. Tests read and change it as they go.
 */
export interface Desk {
  draft: Draft;
  writes: Writes;
  readonly typing: ReadonlyArray<TypingIn>;
  /** Every batch the agent committed, in order. */
  readonly commits: Array<ReadonlyArray<Op>>;
  /** The chat's parts as the person sees them. */
  readonly parts: Array<Part>;
  readonly sources: Map<string, { readonly name: string; readonly markdown: string }>;
  readonly pages: Map<string, string>;
  readonly requests: Array<string>;
}

const person = { id: "user_sam", name: "Sam Okafor" };

/** The services a turn runs with, over a draft in memory. */
export const desk = async (
  draft: Draft,
  options: {
    readonly links?: ReadonlyArray<string>;
    readonly selected?: Selected;
    readonly typing?: ReadonlyArray<TypingIn>;
    readonly sources?: ReadonlyArray<{ readonly name: string; readonly markdown: string }>;
    /** Web pages by address, as Markdown. */
    readonly pages?: Readonly<Record<string, string>>;
  } = {},
) => {
  const contracts = await loadBlocks(draft.lockfile);
  const state: Desk = {
    draft,
    writes: new Map(),
    typing: options.typing ?? [],
    commits: [],
    parts: [],
    sources: new Map(
      (options.sources ?? []).map((source, index) => [`src_${index + 1}`, source] as const),
    ),
    pages: new Map(Object.entries(options.pages ?? {})),
    requests: [],
  };
  const turn = TurnId.make("turn_test");
  const layer = Layer.mergeAll(
    Layer.succeed(Workspace)({
      draft: Effect.sync(() => state.draft),
      contracts: Effect.succeed(contracts),
      commit: (ops) =>
        Effect.sync(() => {
          const batch = { id: BatchId.make(randomId("bat")), ops };
          const result = commitBatch(
            state.draft,
            state.writes,
            `agent:${turn}`,
            batch,
            contracts,
            "complete",
          );
          if (!result.ok) return { status: "rejected", errors: result.errors } as const;
          state.draft = result.draft;
          state.writes = result.writes;
          state.commits.push(ops);
          return { status: "committed" } as const;
        }),
      typing: Effect.sync(() => state.typing),
      check: Effect.sync(() => {
        const frozen = freeze(state.draft, contracts, { pages: [], gone: [] });
        return { issues: frozen.ok ? [] : frozen.issues, behind: false };
      }),
      previewLink: (path) => `https://studio.pakshi.test/preview/site_harbour/dr_harbour${path}`,
    }),
    Layer.succeed(Sources)({
      list: Effect.sync(() =>
        Array.from(state.sources, ([id, source]) => ({
          id: SourceId.make(id),
          name: source.name,
          size: source.markdown.length,
        })),
      ),
      read: (id) => Effect.sync(() => Option.fromNullishOr(state.sources.get(id)?.markdown)),
    }),
    Layer.succeed(Web)({
      read: (url) =>
        Effect.sync(() => {
          const page = state.pages.get(url.href);
          return page === undefined
            ? { ok: false, reason: "The page couldn't be reached." }
            : { ok: true, markdown: page };
        }),
    }),
    Layer.succeed(BlockRequests)({
      file: ({ need }) => Effect.sync(() => void state.requests.push(need)),
    }),
    Layer.succeed(Turn)({
      id: turn,
      person,
      page: PageId.make("pg_home"),
      selected: options.selected ?? null,
      links: new Set(options.links ?? []),
      show: (part) =>
        Effect.sync(() => {
          const index = state.parts.findIndex((found) => found.id === part.id);
          if (index === -1) state.parts.push(part);
          else state.parts[index] = part;
        }),
      write: (id, delta) =>
        Effect.sync(() => {
          const index = state.parts.findIndex((found) => found.id === id);
          const part = state.parts[index];
          if (part?._tag === "Text") state.parts[index] = { ...part, text: part.text + delta };
        }),
    }),
  );
  return { state, layer, contracts };
};

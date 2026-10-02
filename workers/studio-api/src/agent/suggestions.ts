import { languageModel, suggestAltText, suggestMerge } from "@repo/agent";
import { loadBlocks } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId, BrandId, MediaId, SiteId } from "@repo/contracts/ids";
import type { Conflict } from "@repo/contracts/merge";
import { pageName } from "@repo/contracts/page";
import { objectKeys } from "@repo/contracts/snapshot";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Option, Schema } from "effect";

import { sendThroughGateway } from "./gateway.ts";

const isString = Schema.is(Schema.String);

/** Who a suggestion is for, which AI Gateway records with its cost. */
interface Asker {
  readonly site: { readonly id: SiteId; readonly brand: BrandId };
  readonly person: string;
}

const tagsOf = (asker: Asker) => ({
  brand: asker.site.brand,
  site: asker.site.id,
  person: asker.person,
});

/** A suggestion the model couldn't make is no suggestion: the person decides as they would anyway. */
const orNothing = <A, E, R>(effect: Effect.Effect<Option.Option<A>, E, R>) =>
  effect.pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning("A suggestion couldn't be made", error), Option.none<A>()),
    ),
    Effect.map(Option.getOrNull),
  );

/** A merged value for a text conflict in a draft's update, at the versions of the draft's blocks. */
export const mergeSuggestion = (
  env: StudioApiEnv,
  asker: Asker,
  draft: Draft,
  conflict: Conflict,
) =>
  Effect.gen(function* () {
    if (conflict._tag !== "Changed" || conflict.block === null || conflict.name === undefined)
      return Option.none();
    const holder =
      conflict.place.target === "site" ? draft.parts : draft.pages[conflict.place.target];
    const block = holder?.blocks[conflict.block.id];
    if (block === undefined) return Option.none();
    const contracts = yield* Effect.promise(() => loadBlocks(draft.lockfile));
    const field = contracts.get(block.type)?.fields[conflict.name];
    if (field?.kind !== "text" && field?.kind !== "richText") return Option.none();
    return yield* suggestMerge(field, conflict).pipe(
      Effect.provide(languageModel(sendThroughGateway(env), tagsOf(asker), "merge")),
    );
  }).pipe(orNothing);

/** Where a block is in a draft, in words: its title, its page and its heading, if it has one. */
const placement = (draft: Draft, contractTitle: (type: string) => string, block: BlockId) => {
  const pages = Object.values(draft.pages);
  const page = pages.find((found) => block in found.blocks);
  const instance = page?.blocks[block] ?? draft.parts.blocks[block];
  if (instance === undefined) return "a page of the site";
  const heading = instance.props["heading"];
  return [
    `a ${contractTitle(instance.type)} section`,
    page === undefined
      ? "in the site's header or footer"
      : `on the page "${pageName(page)}"`,
    isString(heading) && heading !== "" ? `headed "${heading}"` : "",
  ]
    .filter((part) => part !== "")
    .join(" ");
};

/** Alt text for a library image where a block of the draft places it. */
export const altTextSuggestion = (
  env: StudioApiEnv,
  asker: Asker,
  draft: Draft,
  media: MediaId,
  block: BlockId,
) =>
  Effect.gen(function* () {
    const object = yield* Effect.promise(() => env.CONTENT.get(objectKeys.media(media)));
    if (object === null) return Option.none();
    const data = new Uint8Array(yield* Effect.promise(() => object.arrayBuffer()));
    const contracts = yield* Effect.promise(() => loadBlocks(draft.lockfile));
    const where = placement(draft, (type) => contracts.get(type)?.title ?? type, block);
    return yield* suggestAltText(
      { data, mediaType: object.httpMetadata?.contentType ?? "image/jpeg" },
      where,
    ).pipe(Effect.provide(languageModel(sendThroughGateway(env), tagsOf(asker), "describe")));
  }).pipe(orNothing);

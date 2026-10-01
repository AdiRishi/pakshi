import { BlockType, SiteId } from "@repo/contracts/ids";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { type Effect, Schema } from "effect";

import { callStudio, type StudioClient } from "@/server/studio-rpc";

const studio = <A, E>(use: (client: StudioClient) => Effect.Effect<A, E>) =>
  callStudio({ binding: env.STUDIO_RPC, request: getRequest() }, use);

/** Every block in the library, with each version and how many sites have it live. */
export const getBlockCatalog = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.blockCatalog()),
);

/** The blocks a site's live release pins, and the upgrades it could adopt. */
export const getSiteBlocks = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId })))
  .handler(({ data }) => studio((client) => client.siteBlocks(data)));

/** A draft that moves the site to a block's newest version. */
export const adoptUpgrade = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, type: BlockType })))
  .handler(({ data }) => studio((client) => client.adoptUpgrade(data)));

/** Upgrade drafts for a block on every site an older version is live on. */
export const upgradeEverywhere = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ type: BlockType })))
  // Each site's SiteDoc makes its own draft, so this waits on all of them.
  .handler(({ data }) =>
    callStudio(
      { binding: env.STUDIO_RPC, request: getRequest(), timeout: "60 seconds" },
      (client) => client.upgradeEverywhere(data),
    ),
  );

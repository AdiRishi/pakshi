import { BlockRequestId, BlockType, SiteId } from "@repo/contracts/ids";
import { BlockExample, BlockNeed } from "@repo/contracts/studio";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { Schema } from "effect";

import { studio } from "@/server/studio";
import { callStudio } from "@/server/studio-rpc";

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

/** The block requests the person may see, and the sites they may ask for blocks on. */
export const getBlockRequests = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.blockRequests()),
);

export const requestBlock = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ site: Schema.NullOr(SiteId), need: BlockNeed, example: BlockExample }),
    ),
  )
  .handler(({ data }) => studio((client) => client.requestBlock(data)));

export const closeBlockRequest = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ request: BlockRequestId })))
  .handler(({ data }) => studio((client) => client.closeBlockRequest(data)));

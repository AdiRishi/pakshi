import { BlockRequestId, BlockType, SiteId } from "@repo/contracts/ids";
import { BlockExample, BlockNeed } from "@repo/contracts/studio";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { Schema } from "effect";

import { studio } from "@/server/studio";
import { callStudio } from "@/server/studio-rpc";

/** For the platform team: the blocks sites show at an older version, and the versions that can be removed. */
export const getBlockUpdates = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.blockUpdates()),
);

/** The person's sites whose live release shows a block. */
export const getBlockUsage = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ type: BlockType })))
  .handler(({ data }) => studio((client) => client.blockUsage(data)));

/** The blocks a site's live release pins, and the upgrades it could adopt. */
export const getSiteBlocks = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId })))
  .handler(({ data }) => studio((client) => client.siteBlocks(data)));

/** A draft that moves the site to a block's newest version. */
export const adoptUpgrade = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, type: BlockType })))
  .handler(({ data }) => studio((client) => client.adoptUpgrade(data)));

/** Upgrade drafts for a block on every site whose live release shows an older version. */
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

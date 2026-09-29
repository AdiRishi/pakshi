import { SiteId } from "@repo/contracts/ids";
import { Batch } from "@repo/contracts/ops";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { Schema } from "effect";

import { callStudio } from "@/server/studio-rpc";

const forSite = Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId }));

/** A site's pages and posts, as its draft has them. */
export const getSitePages = createServerFn({ method: "GET" })
  .validator(forSite)
  .handler(({ data }) =>
    callStudio({ binding: env.STUDIO_RPC, request: getRequest() }, (studio) =>
      studio.sitePages({ site: data.site }),
    ),
  );

/** A site's draft and the images it can place, for the editor. */
export const getEditorDraft = createServerFn({ method: "GET" })
  .validator(forSite)
  .handler(({ data }) =>
    callStudio({ binding: env.STUDIO_RPC, request: getRequest() }, (studio) =>
      studio.editorDraft({ site: data.site }),
    ),
  );

/** Sends a batch of edit operations to the site's draft. */
export const applyBatch = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, batch: Batch })))
  .handler(({ data }) =>
    callStudio({ binding: env.STUDIO_RPC, request: getRequest() }, (studio) =>
      studio.applyBatch({ site: data.site, batch: data.batch }),
    ),
  );

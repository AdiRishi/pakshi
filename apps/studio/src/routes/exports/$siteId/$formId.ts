import { FormId, SiteId } from "@repo/contracts/ids";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";

import { callStudio } from "@/server/studio-rpc";

/** Every entry of a form as a CSV download, for someone who may export the site's entries. */
export const Route = createFileRoute("/exports/$siteId/$formId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ids = Option.all({
          site: Schema.decodeOption(SiteId)(params.siteId),
          form: Schema.decodeOption(FormId)(params.formId),
        });
        if (Option.isNone(ids)) return new Response("Not found", { status: 404 });
        const { filename, csv } = await callStudio({ binding: env.STUDIO_RPC, request }, (studio) =>
          studio.exportEntries(ids.value),
        );
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});

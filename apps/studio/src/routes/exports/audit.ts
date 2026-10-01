import { AuditQuery } from "@repo/contracts/audit";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";

import { callStudio } from "@/server/studio-rpc";

const decodeQuery = Schema.decodeUnknownOption(Schema.fromJsonString(AuditQuery));

/** The audit log entries a query matches as a CSV download, for someone who may read them. */
export const Route = createFileRoute("/exports/audit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = decodeQuery(new URL(request.url).searchParams.get("query"));
        if (Option.isNone(query)) return new Response("Not found", { status: 404 });
        const { filename, csv } = await callStudio({ binding: env.STUDIO_RPC, request }, (studio) =>
          studio.exportAudit({ query: query.value }),
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

import { DraftId, SiteId } from "@repo/contracts/ids";
import { previewBasePath } from "@repo/contracts/studio";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";

import { requested } from "@/features/preview/address";
import { siteDocument, unavailableDocument } from "@/features/preview/render";
import { callStudio } from "@/server/studio-rpc";

const notShared = () =>
  unavailableDocument(
    "This preview isn't available",
    "The draft was published or closed, or it isn't shared with you. Ask whoever sent the link.",
  );

/**
 * A draft's preview, for anyone it's shared with, signed in or not: each
 * page of the draft at its latest saved state, and its images. studio-api
 * checks the draft's sharing on every request, so revoking access blocks
 * the next one.
 */
export const Route = createFileRoute("/preview/$siteId/$draftId/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const site = Schema.decodeOption(SiteId)(params.siteId);
        const draft = Schema.decodeOption(DraftId)(params.draftId);
        const asked = requested(params._splat ?? "");
        if (Option.isNone(site) || Option.isNone(draft) || asked === null) return notShared();
        // studio-api checks access to the image, with the cookie that travels with the request.
        if (asked.kind === "media") return env.STUDIO_API.fetch(request);
        const preview = await callStudio({ binding: env.STUDIO_RPC, request }, (studio) =>
          studio.previewPage({ site: site.value, draft: draft.value, path: asked.path }),
        );
        switch (preview._tag) {
          case "SignIn": {
            const url = new URL(request.url);
            const back = encodeURIComponent(`${url.pathname}${url.search}`);
            return Response.redirect(`${url.origin}/sign-in?redirect=${back}`, 302);
          }
          case "NotFound":
            return notShared();
          case "Page": {
            const base = `${previewBasePath}/${preview.site.id}/${preview.draft.id}`;
            return siteDocument(preview.view, {
              base,
              bar: {
                title: `Preview of the "${preview.draft.name}" draft, ${preview.site.name}`,
                notes: ["Shows the latest saved changes", "Forms don't send in previews"],
                action:
                  preview.access === "edit"
                    ? {
                        label: "Open in Pakshi",
                        href: `/sites/${preview.site.id}/drafts/${preview.draft.id}`,
                      }
                    : null,
              },
              changed: [],
            });
          }
        }
      },
    },
  },
});

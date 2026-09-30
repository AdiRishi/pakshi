import { SiteId, SubmissionId } from "@repo/contracts/ids";
import { reviewBasePath } from "@repo/contracts/studio";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";

import { requested } from "@/features/preview/address";
import { siteDocument, unavailableDocument } from "@/features/preview/render";
import { callStudio } from "@/server/studio-rpc";

const Version = Schema.Literals(["submitted", "live"]);

/**
 * A page of a submission, as approvers see it beside the review screen,
 * with the blocks it changes marked. `?version=live` shows the live site's
 * page instead, for comparing.
 */
export const Route = createFileRoute("/review/$siteId/$submissionId/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const site = Schema.decodeOption(SiteId)(params.siteId);
        const submission = Schema.decodeOption(SubmissionId)(params.submissionId);
        const asked = requested(params._splat ?? "");
        const version = Schema.decodeUnknownOption(Version)(
          new URL(request.url).searchParams.get("version") ?? "submitted",
        );
        if (
          Option.isNone(site) ||
          Option.isNone(submission) ||
          Option.isNone(version) ||
          asked === null
        )
          return unavailableDocument("Nothing to review here", "There's no page at this address.");
        if (asked.kind === "media") return env.STUDIO_API.fetch(request);
        const review = await callStudio({ binding: env.STUDIO_RPC, request }, (studio) =>
          studio.reviewPage({
            site: site.value,
            submission: submission.value,
            version: version.value,
            path: asked.path,
          }),
        );
        return siteDocument(review.view, {
          base: `${reviewBasePath}/${site.value}/${submission.value}`,
          bar: null,
          changed: review.changed,
        });
      },
    },
  },
});

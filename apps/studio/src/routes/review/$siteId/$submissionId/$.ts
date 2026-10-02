import { pageNumberOf } from "@repo/contracts/collections";
import { SiteId, SnapshotId, SubmissionId } from "@repo/contracts/ids";
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
 * page instead, for comparing. `?snapshot=` names the submission snapshot
 * the reviewer is deciding on, and a submission that has moved on since
 * shows nothing, so a decision is never made on a page that wasn't shown.
 */
export const Route = createFileRoute("/review/$siteId/$submissionId/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const site = Schema.decodeOption(SiteId)(params.siteId);
        const submission = Schema.decodeOption(SubmissionId)(params.submissionId);
        const asked = requested(params._splat ?? "");
        const url = new URL(request.url);
        const search = url.searchParams;
        const version = Schema.decodeUnknownOption(Version)(search.get("version") ?? "submitted");
        const snapshot = Schema.decodeUnknownOption(SnapshotId)(search.get("snapshot"));
        if (
          Option.isNone(site) ||
          Option.isNone(submission) ||
          Option.isNone(version) ||
          Option.isNone(snapshot) ||
          asked === null
        )
          return unavailableDocument({
            title: "Nothing to review here",
            description: "There's no page at this address.",
            status: 404,
            action: { label: "Go to Approvals", href: "/approvals" },
          });
        if (asked.kind === "media") return env.STUDIO_API.fetch(request);
        const review = await callStudio({ binding: env.STUDIO_RPC, request }, (studio) =>
          studio.reviewPage({
            site: site.value,
            submission: submission.value,
            snapshot: snapshot.value,
            version: version.value,
            path: asked.path,
          }),
        );
        if (review._tag === "Changed")
          return unavailableDocument({
            title: "This submission changed",
            description:
              "Another release went live and merged into it while you were looking. Review it again before you decide.",
            status: 409,
            action: {
              label: "Review it again",
              href: `/approvals/${site.value}/${submission.value}`,
            },
          });
        const base = `${reviewBasePath}/${site.value}/${submission.value}`;
        return siteDocument(review.view, {
          base,
          // Links keep to the version and snapshot being reviewed.
          address: (path) => `${base}${path}?${search.toString()}`,
          bar: null,
          changed: review.changed,
          number: pageNumberOf(url),
        });
      },
    },
  },
});

import type { PreviewBar } from "@repo/blocks";
import { pageNumberOf } from "@repo/contracts/collections";
import { type BlockId, DraftId, SiteId, SnapshotId, SubmissionId } from "@repo/contracts/ids";
import { previewBasePath, reviewBasePath, type SiteView } from "@repo/contracts/studio";
import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";
import type { ComponentProps } from "react";

import { callStudio } from "@/server/studio-rpc";

import { requested } from "./address";
import { unavailableDocument } from "./unavailable";

/** A page of a draft or a submission that Studio shows, as its route renders it. */
export interface ShownPreview {
  readonly view: SiteView;
  /** The preview's or review's own address, which its pages and images sit under. */
  readonly base: string;
  /** The version and snapshot a review shows, which its links keep; null in a draft's preview. */
  readonly review: {
    readonly version: "submitted" | "live";
    readonly snapshot: SnapshotId;
  } | null;
  readonly bar: ComponentProps<typeof PreviewBar> | null;
  /** Blocks to mark as changed, for a review. */
  readonly changed: ReadonlyArray<BlockId>;
  /** The page of a blog's posts to show, as `sites` reads it from the address. */
  readonly number: number;
}

/**
 * Previews and reviews are never cached, indexed or told where they were
 * opened from: each request checks access again, and a draft's address
 * shouldn't leave in a Referer header.
 */
export const kept = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, headers });
};

const Version = Schema.Literals(["submitted", "live"]);

const notShared = () =>
  unavailableDocument({
    title: "This preview isn't available",
    description:
      "The draft was published or closed, or it isn't shared with you. Ask whoever sent the link.",
    status: 404,
    action: { label: "Go to Studio", href: "/" },
  });

const nothingToReview = () =>
  unavailableDocument({
    title: "Nothing to review here",
    description: "There's no page at this address.",
    status: 404,
    action: { label: "Go to Approvals", href: "/approvals" },
  });

/**
 * A draft's preview, for anyone it's shared with, signed in or not: each
 * page of the draft at its latest saved state, and its images. studio-api
 * checks the draft's sharing on every request, so revoking access blocks
 * the next one.
 */
const preview = async (
  request: Request,
  [siteId = "", draftId = "", ...rest]: ReadonlyArray<string>,
  render: (shown: ShownPreview) => Promise<Response> | Response,
) => {
  const site = Schema.decodeOption(SiteId)(siteId);
  const draft = Schema.decodeOption(DraftId)(draftId);
  const asked = requested(rest.join("/"));
  if (Option.isNone(site) || Option.isNone(draft) || asked === null) return notShared();
  // studio-api checks access to the image, with the cookie that travels with the request.
  if (asked.kind === "media") return env.STUDIO_API.fetch(request);
  const answer = await callStudio({ binding: env.STUDIO_RPC, request }, (studio) =>
    studio.previewPage({ site: site.value, draft: draft.value, path: asked.path }),
  );
  switch (answer._tag) {
    case "SignIn": {
      const url = new URL(request.url);
      const back = encodeURIComponent(`${url.pathname}${url.search}`);
      return Response.redirect(`${url.origin}/sign-in?redirect=${back}`, 302);
    }
    case "NotFound":
      return notShared();
    case "Page":
      return render({
        view: answer.view,
        base: `${previewBasePath}/${answer.site.id}/${answer.draft.id}`,
        review: null,
        bar: {
          title: `Preview of the "${answer.draft.name}" draft, ${answer.site.name}`,
          notes: ["Shows the latest saved changes", "Forms don't send in previews"],
          action:
            answer.access === "edit"
              ? {
                  label: "Open in Pakshi",
                  href: `/sites/${answer.site.id}/drafts/${answer.draft.id}`,
                }
              : null,
        },
        changed: [],
        number: pageNumberOf(new URL(request.url)),
      });
  }
};

/**
 * A page of a submission, as approvers see it beside the review screen,
 * with the blocks it changes marked. `?version=live` shows the live site's
 * page instead, for comparing. `?snapshot=` names the submission snapshot
 * the reviewer is deciding on, and a submission that has moved on since
 * shows nothing, so a decision is never made on a page that wasn't shown.
 */
const review = async (
  request: Request,
  [siteId = "", submissionId = "", ...rest]: ReadonlyArray<string>,
  render: (shown: ShownPreview) => Promise<Response> | Response,
) => {
  const site = Schema.decodeOption(SiteId)(siteId);
  const submission = Schema.decodeOption(SubmissionId)(submissionId);
  const asked = requested(rest.join("/"));
  const url = new URL(request.url);
  const version = Schema.decodeUnknownOption(Version)(
    url.searchParams.get("version") ?? "submitted",
  );
  const snapshot = Schema.decodeUnknownOption(SnapshotId)(url.searchParams.get("snapshot"));
  if (
    Option.isNone(site) ||
    Option.isNone(submission) ||
    Option.isNone(version) ||
    Option.isNone(snapshot) ||
    asked === null
  )
    return nothingToReview();
  if (asked.kind === "media") return env.STUDIO_API.fetch(request);
  const answer = await callStudio({ binding: env.STUDIO_RPC, request }, (studio) =>
    studio.reviewPage({
      site: site.value,
      submission: submission.value,
      snapshot: snapshot.value,
      version: version.value,
      path: asked.path,
    }),
  );
  if (answer._tag === "Changed")
    return unavailableDocument({
      title: "This submission changed",
      description:
        "Another release went live and merged into it while you were looking. Review it again before you decide.",
      status: 409,
      action: { label: "Review it again", href: `/approvals/${site.value}/${submission.value}` },
    });
  return render({
    view: answer.view,
    base: `${reviewBasePath}/${site.value}/${submission.value}`,
    review: { version: version.value, snapshot: snapshot.value },
    bar: null,
    changed: answer.changed,
    number: pageNumberOf(url),
  });
};

/**
 * What Studio answers at a draft's preview or a submission's review, or null
 * at any other address. Pages render through `render`, and a page the view
 * doesn't have answers 404.
 */
export const servePreview = async (
  request: Request,
  render: (shown: ShownPreview) => Promise<Response> | Response,
) => {
  const [, area, ...rest] = new URL(request.url).pathname.split("/");
  const shown = async (page: ShownPreview) => {
    const rendered = await render(page);
    return page.view.page === null
      ? new Response(rendered.body, { status: 404, headers: rendered.headers })
      : rendered;
  };
  if (`/${area}` === previewBasePath) return kept(await preview(request, rest, shown));
  if (`/${area}` === reviewBasePath) return kept(await review(request, rest, shown));
  return null;
};

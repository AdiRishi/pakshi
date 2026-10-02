import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { siteParams } from "@/features/sites/site-route";
import { NoSubmissionsAccess, SubmissionsPage } from "@/features/submissions/submissions-page";
import { loadSubmissions, SubmissionsSearch } from "@/features/submissions/submissions-route";

export const Route = createFileRoute("/_authed/sites/$siteId/submissions/")({
  params: siteParams,
  validateSearch: Schema.toStandardSchemaV1(SubmissionsSearch),
  loader: ({ context, params }) => loadSubmissions(context.queryClient, params.siteId),
  component: function Submissions() {
    const { viewer } = Route.useRouteContext();
    const { siteId } = Route.useParams();
    const search = Route.useSearch();
    const { forbidden } = Route.useLoaderData();
    if (forbidden) return <NoSubmissionsAccess viewer={viewer} site={siteId} />;
    return (
      <SubmissionsPage
        viewer={viewer}
        site={siteId}
        place={{ form: search.form ?? null, search: search.q ?? null, entry: null }}
      />
    );
  },
});

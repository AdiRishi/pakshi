import { EntryId } from "@repo/contracts/ids";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { siteParams } from "@/features/sites/site-route";
import { NoSubmissionsAccess, SubmissionsPage } from "@/features/submissions/submissions-page";
import { loadSubmissions, SubmissionsSearch } from "@/features/submissions/submissions-route";

/** One entry, open beside its form's entries. New entry emails link here. */
export const Route = createFileRoute("/_authed/sites/$siteId/submissions/$entryId")({
  params: {
    parse: (params: { readonly siteId: string; readonly entryId: string }) => {
      const entry = Schema.decodeOption(EntryId)(params.entryId);
      if (Option.isNone(entry)) throw notFound();
      return { ...siteParams.parse(params), entryId: entry.value };
    },
    stringify: (params: { readonly siteId: string; readonly entryId: string }) => params,
  },
  validateSearch: Schema.toStandardSchemaV1(SubmissionsSearch),
  loader: ({ context, params }) => loadSubmissions(context.queryClient, params.siteId),
  component: function Entry() {
    const { viewer } = Route.useRouteContext();
    const { siteId, entryId } = Route.useParams();
    const search = Route.useSearch();
    const { forbidden } = Route.useLoaderData();
    if (forbidden !== null) return <NoSubmissionsAccess viewer={viewer} site={forbidden} />;
    return (
      <SubmissionsPage
        viewer={viewer}
        site={siteId}
        place={{ form: search.form ?? null, search: search.q ?? null, entry: entryId }}
      />
    );
  },
});

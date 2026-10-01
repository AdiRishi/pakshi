import { createFileRoute } from "@tanstack/react-router";

import { brandQuery } from "@/features/brands/queries";
import { BrandMembersPage } from "@/features/people/members-page";
import { scopeMembersQuery } from "@/features/people/queries";
import { brandParams, loadSite } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/brands/$brandId/members")({
  params: brandParams,
  loader: ({ context, params }) =>
    loadSite(() =>
      Promise.all([
        context.queryClient.query(scopeMembersQuery({ kind: "brand", id: params.brandId })),
        context.queryClient.query(brandQuery(params.brandId)),
      ]),
    ),
  head: () => ({ meta: [{ title: "Members · Pakshi" }] }),
  component: function BrandMembers() {
    return (
      <BrandMembersPage
        viewer={Route.useRouteContext().viewer}
        scope={{ kind: "brand", id: Route.useParams().brandId }}
      />
    );
  },
});

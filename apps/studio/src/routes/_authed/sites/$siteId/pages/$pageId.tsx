import { createFileRoute } from "@tanstack/react-router";

import { pageParams, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/pages/$pageId")({
  params: {
    parse: (params) => ({ ...siteParams.parse(params), ...pageParams.parse(params) }),
    stringify: (params) => ({ ...siteParams.stringify(params), ...pageParams.stringify(params) }),
  },
  ssr: false,
  component: function EditPage() {
    return <p>Editor</p>;
  },
});

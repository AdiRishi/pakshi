import type { Viewer } from "@repo/contracts/studio";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Link } from "@tanstack/react-router";
import { SearchXIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";

/** Shown for an address with nothing the person can open, such as a site they have no access to. */
export function NotFoundPage(props: { readonly viewer: Viewer }) {
  return (
    <AppShell viewer={props.viewer}>
      <Empty className="min-h-screen">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>
            There's nothing at this address that you can open. It may have moved, or you may need
            access from your team's Pakshi admin.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            Go to Home
          </Link>
        </EmptyContent>
      </Empty>
    </AppShell>
  );
}

import { restoreDays } from "@repo/contracts/studio";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/item";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { formatDay } from "@/lib/dates";

import { getDeletedSites, restoreSite } from "../sites/functions";

export const deletedSitesQuery = queryOptions({
  queryKey: ["deleted-sites"],
  queryFn: () => getDeletedSites(),
});

/** The day a deleted site can last be restored. */
const restoreBy = (deletedAt: string) =>
  formatDay(new Date(Date.parse(deletedAt) + restoreDays * 24 * 60 * 60 * 1000).toISOString());

/** Sites deleted in the last 30 days, which org admins can bring back. Others see nothing. */
export function RecentlyDeleted() {
  const queryClient = useQueryClient();
  const { data } = useQuery(deletedSitesQuery);
  const restore = useMutation({
    mutationFn: (site: Parameters<typeof restoreSite>[0]["data"]["site"]) =>
      restoreSite({ data: { site } }),
    onSuccess: async () => {
      toast.success("Site restored", {
        description: "It's back at its Pakshi address. Add its own domains again.",
      });
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  if (data === undefined || data.length === 0) return null;
  return (
    <section aria-labelledby="recently-deleted">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>
            <h2 id="recently-deleted" className="text-lg font-semibold">
              Recently deleted
            </h2>
          </CardTitle>
          <CardDescription>Sites are deleted for good {restoreDays} days after.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ItemGroup className="gap-0 divide-y">
            {data.map((site) => (
              <Item key={site.id} render={<li />} className="rounded-none px-6">
                <ItemContent>
                  <ItemTitle>{site.name}</ItemTitle>
                  <ItemDescription>
                    {site.brand}. Deleted{site.deletedBy === null ? "" : ` by ${site.deletedBy}`};
                    restore by {restoreBy(site.deletedAt)}.
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(site.id)}
                  >
                    Restore
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </CardContent>
      </Card>
    </section>
  );
}

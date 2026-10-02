import type { BrandId } from "@repo/contracts/ids";
import type { Viewer } from "@repo/contracts/studio";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@repo/ui/components/item";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";

import { BrandHeader } from "./brand-header";
import { Brands } from "./brands";
import { createBrand, deleteBrand } from "./functions";
import { brandQuery, brandsQuery } from "./queries";

/** Every brand the person works on, each in its own look, with its sites. */
export function BrandsPage(props: { readonly viewer: Viewer }) {
  const { data } = useSuspenseQuery(brandsQuery);
  return <Brands viewer={props.viewer} brands={data} create={createBrand} />;
}

/** Deletes a brand with no sites, after asking. */
function DeleteBrand(props: { readonly brand: { readonly id: BrandId; readonly name: string } }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteBrand({ data: { brand: props.brand.id } }),
    onSuccess: async () => {
      toast.success(`${props.brand.name} was deleted`);
      await queryClient.invalidateQueries();
      await navigate({ to: "/brands" });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        Delete brand
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {props.brand.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its theme, identity, voice guide and image library are deleted for good.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Delete brand
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The sites that use a brand's theme, identity and voice. */
export function BrandSitesPage(props: { readonly viewer: Viewer; readonly brand: BrandId }) {
  const { data } = useSuspenseQuery(brandQuery(props.brand));
  return (
    <AppShell viewer={props.viewer}>
      <BrandHeader brand={data.brand} sites={data.sites.length} section="sites" />
      <div className="flex flex-col gap-6 px-10 py-8">
        {data.can.delete &&
          (data.sites.length === 0 ? (
            <div className="flex max-w-3xl items-center gap-4 rounded-lg border p-4">
              <p className="grow text-sm text-muted-foreground">
                This brand has no sites. Delete it if it's no longer needed.
              </p>
              <DeleteBrand brand={data.brand} />
            </div>
          ) : (
            <p className="max-w-3xl text-sm text-muted-foreground">
              A brand can be deleted once it has no sites.
            </p>
          ))}
        <Card className="max-w-3xl gap-0 py-0">
          <CardContent className="px-0">
            <ItemGroup className="gap-0 divide-y">
              {data.sites.map((site) => (
                <Item key={site.id} render={<li />} className="rounded-none px-6">
                  <ItemContent>
                    <ItemTitle>{site.name}</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Link
                      to="/sites/$siteId"
                      params={{ siteId: site.id }}
                      aria-label={`Open ${site.name}`}
                      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                    >
                      <ChevronRightIcon />
                    </Link>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

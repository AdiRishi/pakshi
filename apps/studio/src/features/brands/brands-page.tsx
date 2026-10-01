import type { BrandId } from "@repo/contracts/ids";
import type { Viewer } from "@repo/contracts/studio";
import { presetTitles } from "@repo/tokens";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/components/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@repo/ui/components/item";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";

import { BrandHeader } from "./brand-header";
import { brandQuery, brandsQuery } from "./queries";

/** Every brand the person works on, with its look and sites. */
export function BrandsPage(props: { readonly viewer: Viewer }) {
  const { data: brands } = useSuspenseQuery(brandsQuery);
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Brands</h1>
        <p className="text-secondary-foreground">
          Each brand sets the theme, logo, voice guide and approval workflow for its sites.
        </p>
      </header>
      <div className="px-10 py-8">
        {brands.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No brands to show</EmptyTitle>
              <EmptyDescription>Brands you can work on appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {brands.map((brand) => (
              <li key={brand.id}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>
                      <h2>
                        <Link
                          to="/brands/$brandId"
                          params={{ brandId: brand.id }}
                          className="hover:underline"
                        >
                          {brand.name}
                        </Link>
                      </h2>
                    </CardTitle>
                    <CardDescription>{presetTitles[brand.preset]} preset</CardDescription>
                    <CardAction>
                      <span
                        title={`Brand color ${brand.brandColor}`}
                        className="block size-8 rounded-md border"
                        style={{ backgroundColor: brand.brandColor }}
                      />
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {brand.sites.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No sites yet</span>
                    ) : (
                      brand.sites.map((site) => (
                        <Badge key={site.id} variant="secondary">
                          {site.name}
                        </Badge>
                      ))
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

/** The sites that use a brand's theme, identity and voice. */
export function BrandSitesPage(props: { readonly viewer: Viewer; readonly brand: BrandId }) {
  const { data } = useSuspenseQuery(brandQuery(props.brand));
  return (
    <AppShell viewer={props.viewer}>
      <BrandHeader brand={data.brand} sites={data.sites.length} section="sites" />
      <div className="px-10 py-8">
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

import type { BrandSummary, Viewer } from "@repo/contracts/studio";
import { defaultTheme, resolveTheme } from "@repo/tokens";
import { Button } from "@repo/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/components/empty";
import { PlusIcon } from "lucide-react";
import { useId, useState } from "react";

import { AppShell } from "@/components/app-shell";

import { BrandCard } from "./brand-card";
import { BrandSpecimen } from "./brand-specimen";
import { type CreateBrand, NewBrandDialog } from "./new-brand-dialog";

const defaultLook = resolveTheme(defaultTheme).theme;

/** What someone who may make brands sees before there are any: a brand's card to come. */
function FirstBrand(props: { readonly onCreate: () => void }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="grid max-w-4xl items-center gap-x-12 gap-y-8 rounded-2xl border border-dashed p-8 md:grid-cols-[minmax(0,22rem)_1fr]"
    >
      <BrandSpecimen
        theme={defaultLook}
        logo={null}
        name={<p>Your brand</p>}
        className="aspect-video rounded-lg shadow-lg ring-1 ring-foreground/10"
      />
      <div className="flex flex-col items-start gap-3">
        <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
          Make your first brand
        </h2>
        <p className="text-secondary-foreground">
          A brand holds the colors, fonts, logo and voice its sites share. Start with a name and a
          color. Pakshi makes light and dark palettes from the color, and you can change the fonts,
          corners and more in Theme Studio.
        </p>
        <Button className="mt-2" onClick={props.onCreate}>
          <PlusIcon />
          New brand
        </Button>
      </div>
    </section>
  );
}

/**
 * The Brands page: every brand the person works on, each in its own look,
 * and, for someone who may, the way to make another.
 */
export function Brands(props: {
  readonly viewer: Viewer;
  readonly brands: ReadonlyArray<BrandSummary>;
  readonly create: CreateBrand;
}) {
  const { brands } = props;
  const [creating, setCreating] = useState(false);
  const { createBrand } = props.viewer.can;
  return (
    <AppShell viewer={props.viewer}>
      <NewBrandDialog open={creating} onOpenChange={setCreating} create={props.create} />
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Brands</h1>
          {createBrand && brands.length > 0 && (
            <Button className="ml-auto" onClick={() => setCreating(true)}>
              <PlusIcon />
              New brand
            </Button>
          )}
        </div>
        <p className="text-secondary-foreground">
          Each brand sets the theme, logo, voice guide and approval workflow for its sites.
        </p>
      </header>
      <div className="px-10 py-8">
        {brands.length > 0 ? (
          <ul className="grid gap-8 lg:grid-cols-2 2xl:grid-cols-3">
            {brands.map((brand) => (
              <li key={brand.id}>
                <BrandCard brand={brand} />
              </li>
            ))}
          </ul>
        ) : createBrand ? (
          <FirstBrand onCreate={() => setCreating(true)} />
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No brands to show</EmptyTitle>
              <EmptyDescription>Brands you can work on appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </AppShell>
  );
}

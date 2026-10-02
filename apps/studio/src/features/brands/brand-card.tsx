import type { BrandSummary } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
import { Card } from "@repo/ui/components/card";
import { Link } from "@tanstack/react-router";

import { brandMediaSrc } from "./brand-media";
import { BrandSpecimen } from "./brand-specimen";

/** The addresses of a brand's logos, or null while it has none, as its sites choose them. */
const logoOf = (brand: BrandSummary) =>
  brand.identity.logo === null
    ? null
    : {
        light: brandMediaSrc(brand.id, brand.identity.logo),
        onDark:
          brand.identity.logoOnDark === null
            ? null
            : brandMediaSrc(brand.id, brand.identity.logoOnDark),
      };

/** One brand on the Brands page, in its own look, with its voice and sites. The card opens it. */
export function BrandCard(props: { readonly brand: BrandSummary }) {
  const { brand } = props;
  return (
    <Card className="group/brand relative h-full gap-4 rounded-2xl p-2.5 ring-border transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-ring/40 has-focus-visible:ring-3 has-focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <BrandSpecimen
        theme={brand.theme}
        logo={logoOf(brand)}
        className="aspect-video rounded-lg ring-1 ring-foreground/10"
        name={
          <h2>
            <Link
              to="/brands/$brandId"
              params={{ brandId: brand.id }}
              className="decoration-2 underline-offset-4 group-hover/brand:underline after:absolute after:inset-0 focus-visible:outline-none"
            >
              {brand.name}
            </Link>
          </h2>
        }
      />
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 px-2 pb-1.5">
        {brand.tone.trim() !== "" && (
          <>
            <dt className="text-muted-foreground">Voice</dt>
            <dd className="line-clamp-2">{brand.tone}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Sites</dt>
        <dd className="flex flex-wrap gap-1.5">
          {brand.sites.length === 0 ? (
            <span className="text-muted-foreground">None yet</span>
          ) : (
            brand.sites.map((site) => (
              <Badge key={site.id} variant="secondary">
                {site.name}
              </Badge>
            ))
          )}
        </dd>
      </dl>
    </Card>
  );
}

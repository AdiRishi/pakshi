import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Text } from "../../components.tsx";
import { choice, list, media, optional, text } from "../../fields.ts";
import { Intro } from "../../kit/intro.tsx";
import { Scroller, scrollerItem } from "../../kit/scroller.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: optional(text({ title: "Heading", max: 90 })),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  images: list({
    title: "Images",
    item: {
      image: media({ title: "Image" }),
      caption: optional(text({ title: "Caption", max: 140 })),
    },
    max: 24,
  }),
  columns: choice({ title: "Columns", options: ["3", "2", "4"] }),
  crop: choice({ title: "Proportions", options: ["landscape", "square", "portrait"] }),
};

type Variant = "grid" | "mosaic" | "masonry" | "scroller";
type Gallery = BlockComponentProps<typeof props, Variant>["props"];
type Item = Gallery["images"][number];

const gridColumns = {
  "2": "sm:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "grid-cols-2 lg:grid-cols-4",
} as const satisfies Record<Gallery["columns"], string>;

const masonryColumns = {
  "2": "sm:columns-2",
  "3": "sm:columns-2 lg:columns-3",
  "4": "columns-2 lg:columns-4",
} as const satisfies Record<Gallery["columns"], string>;

const tileSizes = {
  "2": "(min-width: 40rem) 50vw, 100vw",
  "3": "(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw",
  "4": "(min-width: 64rem) 25vw, 50vw",
} as const satisfies Record<Gallery["columns"], string>;

const crops = {
  landscape: "aspect-3/2",
  square: "aspect-square",
  portrait: "aspect-4/5",
} as const satisfies Record<Gallery["crop"], string>;

const path = (item: Item, field: "image" | "caption") => ["images", item.id, field];

/** One image with its caption under it, small and quiet. */
const Figure = ({
  item,
  sizes,
  imageClass,
}: {
  readonly item: Item;
  readonly sizes: string;
  readonly imageClass: string;
}) => (
  <figure className="flex flex-col gap-3">
    <Media
      field={path(item, "image")}
      value={item.image}
      sizes={sizes}
      className={cx("w-full rounded-image object-cover", imageClass)}
    />
    {item.caption && (
      <figcaption>
        <Text
          field={path(item, "caption")}
          as="span"
          value={item.caption}
          className="text-small text-muted-foreground"
        />
      </figcaption>
    )}
  </figure>
);

/**
 * One tile of the mosaic, filling its cell, with its caption over the foot of
 * the image on a fade of the surface's color, so tiles keep the grid's lines.
 */
const Tile = ({
  item,
  sizes,
  className,
}: {
  readonly item: Item;
  readonly sizes: string;
  readonly className?: string;
}) => (
  <li className={className}>
    <figure className="rounded-image relative isolate size-full min-h-40 overflow-hidden">
      <Media
        field={path(item, "image")}
        value={item.image}
        sizes={sizes}
        className="absolute inset-0 -z-10 size-full object-cover"
      />
      {item.caption && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-background/90 via-background/60 to-transparent px-4 pt-10 pb-3">
          <Text
            field={path(item, "caption")}
            as="span"
            value={item.caption}
            className="text-small text-foreground"
          />
        </figcaption>
      )}
    </figure>
  </li>
);

const Images = ({ gallery, variant }: { readonly gallery: Gallery; readonly variant: Variant }) => {
  switch (variant) {
    case "grid":
      return (
        <ul className={cx("grid gap-x-4 gap-y-8", gridColumns[gallery.columns])}>
          {gallery.images.map((item) => (
            <li key={item.id}>
              <Figure
                item={item}
                sizes={tileSizes[gallery.columns]}
                imageClass={crops[gallery.crop]}
              />
            </li>
          ))}
        </ul>
      );
    case "mosaic":
      return (
        <ul className="grid grid-cols-2 gap-4 lg:auto-rows-fr lg:grid-cols-4">
          {gallery.images.map((item, index) => (
            <Tile
              key={item.id}
              item={item}
              sizes={
                index === 0 ? "(min-width: 64rem) 50vw, 100vw" : "(min-width: 64rem) 25vw, 50vw"
              }
              className={cx("aspect-4/3", index === 0 && "col-span-2 lg:row-span-2 lg:aspect-auto")}
            />
          ))}
        </ul>
      );
    case "masonry":
      return (
        <ul
          className={cx(
            "gap-4 [&>li]:mb-8 [&>li]:break-inside-avoid",
            masonryColumns[gallery.columns],
          )}
        >
          {gallery.images.map((item) => (
            <li key={item.id}>
              <Figure item={item} sizes={tileSizes[gallery.columns]} imageClass="h-auto" />
            </li>
          ))}
        </ul>
      );
    case "scroller":
      // On phones the row runs to the screen's edges; on wider screens it keeps to the page's width.
      return (
        <Scroller as="ul" className="-mx-gutter lg:mx-0 lg:scroll-pl-0 lg:px-0">
          {gallery.images.map((item) => (
            <li key={item.id} className={scrollerItem[gallery.columns]}>
              <Figure
                item={item}
                sizes={tileSizes[gallery.columns]}
                imageClass={crops[gallery.crop]}
              />
            </li>
          ))}
        </Scroller>
      );
  }
};

const GalleryBlock = ({ props: gallery, variant }: BlockComponentProps<typeof props, Variant>) => {
  const { heading } = gallery;
  return (
    <Section>
      <div className="page-width flex flex-col gap-14 md:gap-16">
        {heading && <Intro content={{ ...gallery, heading }} />}
        <Images gallery={gallery} variant={variant} />
      </div>
    </Section>
  );
};

export default defineBlock({
  type: "gallery",
  version: 2,
  title: "Gallery",
  placement: "section",
  props,
  variants: ["grid", "mosaic", "masonry", "scroller"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "A set of photos that together show a place, an event or work, each with an optional caption",
    avoid: [
      "a single photo, which belongs in an image section",
      "photos that each need a title and text, which belong in cards",
      "the mosaic with fewer than three photos",
    ],
  },
  placeholder,
  component: GalleryBlock,
});

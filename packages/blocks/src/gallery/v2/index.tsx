import { cx } from "class-variance-authority";
import { type ReactNode, useRef, useState } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Text, useEditing, useMotion } from "../../components.tsx";
import { choice, list, media, optional, text } from "../../fields.ts";
import { cn } from "../../kit/cn.ts";
import { Intro } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import {
  Carousel,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
  carouselSlide,
} from "../../kit/ui/carousel.tsx";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../../kit/ui/dialog.tsx";
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

/** Masonry keeps two columns on a phone, where one would be a long single file of photos. */
const masonryColumns = {
  "2": "columns-2",
  "3": "columns-2 lg:columns-3",
  "4": "columns-2 lg:columns-4",
} as const satisfies Record<Gallery["columns"], string>;

const tileSizes = {
  "2": "(min-width: 40rem) 50vw, 100vw",
  "3": "(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw",
  "4": "(min-width: 64rem) 25vw, 50vw",
} as const satisfies Record<Gallery["columns"], string>;

const masonrySizes = {
  "2": "50vw",
  "3": "(min-width: 64rem) 33vw, 50vw",
  "4": "(min-width: 64rem) 25vw, 50vw",
} as const satisfies Record<Gallery["columns"], string>;

const crops = {
  landscape: "aspect-3/2",
  square: "aspect-square",
  portrait: "aspect-4/5",
} as const satisfies Record<Gallery["crop"], string>;

/** How many photos the carousel shows at once, by screen size; a fraction lets the next one peek in. */
const perView = {
  "2": "[--per-view:1.2] sm:[--per-view:2]",
  "3": "[--per-view:1.25] sm:[--per-view:2] lg:[--per-view:3]",
  "4": "[--per-view:1.5] sm:[--per-view:3] lg:[--per-view:4]",
} as const satisfies Record<Gallery["columns"], string>;

const path = (item: Item, field: "image" | "caption") => ["images", item.id, field];

/**
 * A photo that opens the lightbox at itself, by click or keyboard, and comes
 * forward a little under the pointer. In the editor it's the photo alone, so
 * its field can be edited.
 */
const Opener = ({
  index,
  onOpen,
  className,
  children,
}: {
  readonly index: number;
  readonly onOpen: (index: number) => void;
  readonly className?: string;
  readonly children: ReactNode;
}) => {
  const editing = useEditing();
  const moving = useMotion();
  if (editing) return children;
  return (
    <DialogTrigger
      onClick={() => onOpen(index)}
      className={cn(
        "block cursor-zoom-in overflow-hidden rounded-image focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        moving &&
          "[&_img]:transition-transform [&_img]:duration-700 [&_img]:ease-out motion-safe:hover:[&_img]:scale-103",
        className,
      )}
    >
      {children}
      <span className="sr-only">View larger</span>
    </DialogTrigger>
  );
};

/** One image with its caption under it, small and quiet. */
const Figure = ({
  item,
  index,
  onOpen,
  sizes,
  imageClass,
}: {
  readonly item: Item;
  readonly index: number;
  readonly onOpen: ((index: number) => void) | undefined;
  readonly sizes: string;
  readonly imageClass: string;
}) => {
  const image = (
    <Media
      field={path(item, "image")}
      value={item.image}
      sizes={sizes}
      className={cx("w-full rounded-image object-cover", imageClass)}
    />
  );
  return (
    <figure className="flex flex-col gap-3">
      {onOpen === undefined ? (
        image
      ) : (
        <Opener index={index} onOpen={onOpen} className="w-full">
          {image}
        </Opener>
      )}
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
};

/**
 * One tile of the mosaic, filling its cell, with its caption over the foot of
 * the image on a fade of the surface's color, so tiles keep the grid's lines.
 * The caption lets clicks through to the photo under it.
 */
const Tile = ({
  item,
  index,
  onOpen,
  sizes,
  className,
}: {
  readonly item: Item;
  readonly index: number;
  readonly onOpen: (index: number) => void;
  readonly sizes: string;
  readonly className?: string;
}) => {
  const editing = useEditing();
  return (
    <li className={className}>
      <figure className="rounded-image relative isolate size-full min-h-40 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Opener
            index={index}
            onOpen={onOpen}
            className="size-full focus-visible:-outline-offset-4"
          >
            <Media
              field={path(item, "image")}
              value={item.image}
              sizes={sizes}
              className="size-full object-cover"
            />
          </Opener>
        </div>
        {item.caption && (
          <figcaption
            className={cx(
              "absolute inset-x-0 bottom-0 bg-linear-to-t from-background/90 via-background/60 to-transparent px-4 pt-10 pb-3",
              !editing && "pointer-events-none",
            )}
          >
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
};

const Images = ({
  gallery,
  variant,
  onOpen,
}: {
  readonly gallery: Gallery;
  readonly variant: Exclude<Variant, "scroller">;
  readonly onOpen: (index: number) => void;
}) => {
  switch (variant) {
    case "grid":
      return (
        <ul className={cx("grid gap-x-4 gap-y-8", gridColumns[gallery.columns])}>
          {gallery.images.map((item, index) => (
            <li key={item.id}>
              <Figure
                item={item}
                index={index}
                onOpen={onOpen}
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
              index={index}
              onOpen={onOpen}
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
            "gap-3 sm:gap-4 [&>li]:mb-6 [&>li]:break-inside-avoid sm:[&>li]:mb-8",
            masonryColumns[gallery.columns],
          )}
        >
          {gallery.images.map((item, index) => (
            <li key={item.id}>
              <Figure
                item={item}
                index={index}
                onOpen={onOpen}
                sizes={masonrySizes[gallery.columns]}
                imageClass="h-auto"
              />
            </li>
          ))}
        </ul>
      );
  }
};

/**
 * The photos large over the page, starting at the one that was opened, to
 * move through by the buttons, the arrow keys or a swipe. Focus starts on the
 * stage, so the arrow keys work at once.
 */
const Lightbox = ({ gallery, start }: { readonly gallery: Gallery; readonly start: number }) => {
  const stage = useRef<HTMLDivElement>(null);
  return (
    <DialogContent initialFocus={stage}>
      <DialogTitle className="sr-only">{gallery.heading ?? "Photos"}</DialogTitle>
      <Carousel label="Photos" opts={{ startIndex: start }}>
        <div ref={stage} tabIndex={-1} className="outline-none">
          <CarouselViewport>
            <ul className="flex gap-6">
              {gallery.images.map((item) => (
                <li key={item.id} className={cx(carouselSlide, "basis-full")}>
                  <figure className="flex h-(--lightbox-height) flex-col items-center justify-center gap-4 [--lightbox-height:75dvh]">
                    <Media
                      field={path(item, "image")}
                      value={item.image}
                      sizes="(min-width: 64rem) 64rem, 100vw"
                      className="rounded-image h-auto max-h-full min-h-0 w-auto max-w-full object-contain"
                    />
                    {item.caption && (
                      <figcaption className="text-center">
                        <Text
                          field={path(item, "caption")}
                          as="span"
                          value={item.caption}
                          className="text-small text-background"
                        />
                      </figcaption>
                    )}
                  </figure>
                </li>
              ))}
            </ul>
          </CarouselViewport>
          <CarouselPrevious
            label="Previous photo"
            className="absolute start-2 top-1/2 -translate-y-1/2 sm:start-6"
          />
          <CarouselNext
            label="Next photo"
            className="absolute end-2 top-1/2 -translate-y-1/2 sm:end-6"
          />
        </div>
      </Carousel>
    </DialogContent>
  );
};

/** The photos in a carousel, a few at a time, with buttons under them to move along. */
const Row = ({ gallery }: { readonly gallery: Gallery }) => (
  <Carousel label={gallery.heading ?? "Photos"} className="flex flex-col gap-6">
    <CarouselViewport>
      <ul
        className={cx(
          "flex gap-(--gap) [--gap:--spacing(4)] md:[--gap:--spacing(6)]",
          perView[gallery.columns],
        )}
      >
        {gallery.images.map((item, index) => (
          <li
            key={item.id}
            className={cx(
              carouselSlide,
              "basis-[calc((100%_-_(var(--per-view)_-_1)_*_var(--gap))_/_var(--per-view))]",
            )}
          >
            <Figure
              item={item}
              index={index}
              onOpen={undefined}
              sizes={tileSizes[gallery.columns]}
              imageClass={crops[gallery.crop]}
            />
          </li>
        ))}
      </ul>
    </CarouselViewport>
    <div className="flex justify-end gap-3 empty:hidden">
      <CarouselPrevious label="Previous photos" />
      <CarouselNext label="Next photos" />
    </div>
  </Carousel>
);

/**
 * A set of photos with an optional heading. Opening any photo shows it large
 * in a lightbox, except in the scrolling row, which is a carousel itself.
 */
const GalleryBlock = ({ props: gallery, variant }: BlockComponentProps<typeof props, Variant>) => {
  const { heading } = gallery;
  const editing = useEditing();
  const [start, setStart] = useState(0);
  return (
    <Section>
      <div className="page-width flex flex-col gap-14 md:gap-16">
        {heading && <Intro content={{ ...gallery, heading }} />}
        {variant === "scroller" ? (
          <Row gallery={gallery} />
        ) : editing ? (
          <Images gallery={gallery} variant={variant} onOpen={setStart} />
        ) : (
          <Dialog>
            <Images gallery={gallery} variant={variant} onOpen={setStart} />
            <Lightbox gallery={gallery} start={start} />
          </Dialog>
        )}
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

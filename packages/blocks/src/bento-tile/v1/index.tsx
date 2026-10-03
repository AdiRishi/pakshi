import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, Root, Text, useEditing, useMotion } from "../../components.tsx";
import { choice, cta, icon, media, optional, text } from "../../fields.ts";
import { buttonClass } from "../../kit/button.ts";
import { Icon } from "../../kit/icon.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the title", max: 40 })),
  title: text({ title: "Title", max: 70 }),
  body: optional(text({ title: "Text", max: 200, multiline: true })),
  icon: optional(icon({ title: "Icon" })),
  image: optional(media({ title: "Image" })),
  link: optional(cta({ title: "Link" })),
  size: choice({ title: "Size", options: ["small", "wide", "tall", "large"] }),
  media: choice({ title: "Image placement", options: ["bottom", "top", "cover"] }),
  tone: choice({
    title: "Color",
    options: ["default", "muted", "tint", "brand", "accent", "inverse"],
  }),
};

type Tile = BlockComponentProps<typeof props, "default">["props"];

/** How much of the bento's grid a tile takes, from two columns up. */
const spans = {
  small: "",
  wide: "md:col-span-2",
  tall: "md:row-span-2",
  large: "md:col-span-2 md:row-span-2",
} as const satisfies Record<Tile["size"], string>;

const sizes = {
  small: "(min-width: 64rem) 24rem, (min-width: 48rem) 50vw, 100vw",
  wide: "(min-width: 64rem) 48rem, 100vw",
  tall: "(min-width: 64rem) 24rem, (min-width: 48rem) 50vw, 100vw",
  large: "(min-width: 64rem) 48rem, 100vw",
} as const satisfies Record<Tile["size"], string>;

/*
 * As in Magic UI's bento grid, a tile whose words sit at its foot lifts them
 * on hover or focus to show its link underneath, on screens wide enough to
 * point with. The link opens up rather than moving into place, as a moved or
 * positioned link would keep its stretched area to itself rather than the
 * whole tile. Without the theme's motion, for visitors who ask for less, on
 * a narrower screen, or with the words at the top, the link always shows.
 */
const lifting = cx(
  "lg:motion-safe:mt-0 lg:motion-safe:max-h-0 lg:motion-safe:opacity-0",
  "lg:motion-safe:transition-[max-height,margin,opacity] lg:motion-safe:duration-300 lg:motion-safe:ease-out",
  "lg:motion-safe:group-focus-within:mt-2 lg:motion-safe:group-focus-within:max-h-8 lg:motion-safe:group-focus-within:opacity-100",
  "lg:motion-safe:group-hover:mt-2 lg:motion-safe:group-hover:max-h-8 lg:motion-safe:group-hover:opacity-100",
);

/** The tile's words: its icon, a short label, the title, a sentence and its link. */
const Words = ({
  tile,
  lifts,
  className,
}: {
  readonly tile: Tile;
  readonly lifts: boolean;
  readonly className?: string;
}) => {
  const editing = useEditing();
  return (
    <div className={cx("flex flex-col gap-2 p-6 md:p-8", className)}>
      {tile.icon && (
        <Icon
          name={tile.icon}
          className={cx(
            "mb-3 size-10 origin-left text-primary",
            tile.link &&
              "transition-transform duration-300 ease-out motion-safe:group-hover:scale-75",
          )}
        />
      )}
      {tile.kicker && (
        <Text field="kicker" as="p" value={tile.kicker} className="kicker mb-1 text-primary" />
      )}
      <Text
        field="title"
        as="h3"
        value={tile.title}
        className={cx("max-w-xl", tile.size === "large" ? "text-title" : "text-heading")}
      />
      {tile.body && (
        <Text
          field="body"
          as="p"
          value={tile.body}
          className="text-body max-w-lg whitespace-pre-line text-muted-foreground"
        />
      )}
      {tile.link && (
        <Cta
          field="link"
          value={tile.link}
          className={buttonClass({
            variant: "link",
            size: "sm",
            className: cx(
              // In the editor the link covers nothing, so every field can be reached.
              "mt-2 self-start",
              !editing && "before:absolute before:inset-0 before:z-10",
              lifts && lifting,
            ),
          })}
        />
      )}
    </div>
  );
};

/**
 * A tile of a bento grid, after Magic UI's bento card: a card in a color of
 * its own, with a title, a sentence and an icon or image. The image fills
 * the top and fades into the words below it; sits behind them, faded into
 * the card's color where they are; or runs off the card's bottom edge under
 * them. A tile with a link opens it from anywhere on the tile, and answers
 * the pointer.
 */
const BentoTile = ({ props: tile }: BlockComponentProps<typeof props, "default">) => {
  const moving = useMotion();
  const surface = tile.tone === "default" ? undefined : tile.tone;
  const image = tile.image;
  const linked = tile.link !== undefined;
  const lifts = linked && moving && (image === undefined || tile.media !== "bottom");
  return (
    <Root as="li" className={cx("flex", spans[tile.size])}>
      <div
        data-surface={surface}
        className={cx(
          "group card relative isolate flex min-h-52 w-full flex-col overflow-hidden md:min-h-72",
          image === undefined && "decor-dots",
        )}
      >
        {image === undefined ? (
          <Words tile={tile} lifts={lifts} className="mt-auto" />
        ) : tile.media === "top" ? (
          <>
            <div className="relative min-h-40 flex-1 overflow-hidden mask-b-from-50%">
              <Media
                field="image"
                value={image}
                sizes={sizes[tile.size]}
                className={cx(
                  "absolute inset-0 size-full object-cover",
                  linked &&
                    "transition-transform duration-700 ease-out motion-safe:group-hover:scale-103",
                )}
              />
            </div>
            <Words tile={tile} lifts={lifts} />
          </>
        ) : tile.media === "cover" ? (
          <>
            <Media
              field="image"
              value={image}
              sizes={sizes[tile.size]}
              className={cx(
                "absolute inset-0 -z-20 size-full object-cover",
                linked &&
                  "transition-transform duration-700 ease-out motion-safe:group-hover:scale-103",
              )}
            />
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-linear-to-t from-card via-card/80 via-35% to-card/0"
            />
            <Words tile={tile} lifts={lifts} className="mt-auto pt-24" />
          </>
        ) : (
          <>
            <Words tile={tile} lifts={false} />
            <div className="relative mt-auto min-h-48 flex-1 ps-6 md:ps-8">
              <div className="relative size-full">
                <Media
                  field="image"
                  value={image}
                  sizes={sizes[tile.size]}
                  className={cx(
                    "absolute inset-0 size-full translate-y-4 rounded-tl-lg border-s border-t border-foreground/10 object-cover object-left-top shadow-card",
                    linked &&
                      "transition-transform duration-500 ease-out motion-safe:group-hover:translate-y-2",
                  )}
                />
              </div>
            </div>
          </>
        )}
        {linked && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 transition-colors group-hover:bg-foreground/3"
          />
        )}
      </div>
    </Root>
  );
};

export default defineBlock({
  type: "bento-tile",
  version: 1,
  title: "Bento tile",
  placement: "item",
  props,
  variants: ["default"],
  agent: {
    purpose:
      "One tile of a bento grid: a short title and a sentence, with an icon or a picture, in a size and color that sets it apart from its neighbours",
    avoid: [
      "more than a sentence or two of text",
      "every tile the same size, which makes it a plain grid",
      "more than one or two large or strongly colored tiles in one grid",
    ],
  },
  placeholder,
  component: BentoTile,
});

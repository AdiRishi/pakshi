import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, Root, Text } from "../../components.tsx";
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

const IconChip = ({ tile, className }: { readonly tile: Tile; readonly className?: string }) =>
  tile.icon === undefined ? null : (
    <span
      className={cx(
        "inline-flex size-10 shrink-0 items-center justify-center self-start rounded-lg bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon name={tile.icon} className="size-5" />
    </span>
  );

/** The tile's words, under its icon unless the tile shows the icon on its own. */
const Words = ({
  tile,
  withIcon,
  className,
}: {
  readonly tile: Tile;
  readonly withIcon: boolean;
  readonly className?: string;
}) => (
  <div className={cx("flex flex-col gap-3 p-6 md:p-8", className)}>
    {withIcon && <IconChip tile={tile} className="mb-2" />}
    {tile.kicker && (
      <Text field="kicker" as="p" value={tile.kicker} className="kicker text-primary" />
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
          className: "mt-1 self-start before:absolute before:inset-0",
        })}
      />
    )}
  </div>
);

const sizes = {
  small: "(min-width: 64rem) 24rem, (min-width: 48rem) 50vw, 100vw",
  wide: "(min-width: 64rem) 48rem, 100vw",
  tall: "(min-width: 64rem) 24rem, (min-width: 48rem) 50vw, 100vw",
  large: "(min-width: 64rem) 48rem, 100vw",
} as const satisfies Record<Tile["size"], string>;

/**
 * A tile of a bento grid: a card in a color of its own, with a title, a
 * sentence and an icon or image. The image sits under the words, running off
 * the card's bottom edge; above them; or behind them, faded into the card's
 * color where the words sit.
 */
const BentoTile = ({ props: tile }: BlockComponentProps<typeof props, "default">) => {
  const surface = tile.tone === "default" ? undefined : tile.tone;
  const image = tile.image;
  return (
    <Root as="li" className={cx("flex", spans[tile.size])}>
      <div
        data-surface={surface}
        className="card relative isolate flex min-h-60 w-full flex-col overflow-hidden md:min-h-72"
      >
        {image === undefined ? (
          <>
            <IconChip tile={tile} className="mx-6 mt-6 md:mx-8 md:mt-8" />
            <Words tile={tile} withIcon={false} className="mt-auto" />
          </>
        ) : tile.media === "top" ? (
          <>
            <div className="relative min-h-48 flex-1">
              <Media
                field="image"
                value={image}
                sizes={sizes[tile.size]}
                className="absolute inset-0 size-full object-cover"
              />
            </div>
            <Words tile={tile} withIcon />
          </>
        ) : tile.media === "cover" ? (
          <>
            <Media
              field="image"
              value={image}
              sizes={sizes[tile.size]}
              className="absolute inset-0 -z-20 size-full object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-linear-to-t from-card via-card/75 to-card/0"
            />
            <Words tile={tile} withIcon className="mt-auto pt-24" />
          </>
        ) : (
          <>
            <Words tile={tile} withIcon />
            <div className="relative mt-auto min-h-48 flex-1 ps-6 md:ps-8">
              <div className="relative size-full">
                <Media
                  field="image"
                  value={image}
                  sizes={sizes[tile.size]}
                  className="absolute inset-0 size-full rounded-tl-lg border-s border-t border-foreground/10 object-cover object-left-top"
                />
              </div>
            </div>
          </>
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

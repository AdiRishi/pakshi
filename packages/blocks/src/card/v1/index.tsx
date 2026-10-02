import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Root, Text, useHref } from "../../components.tsx";
import { icon, link, media, optional, text } from "../../fields.ts";
import { Icon } from "../../kit/icon.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  image: optional(media({ title: "Image" })),
  icon: optional(icon({ title: "Icon" })),
  kicker: optional(text({ title: "Line above the title", max: 40 })),
  title: text({ title: "Title", max: 80 }),
  text: optional(text({ title: "Text", max: 200, multiline: true })),
  link: link({ title: "Link" }),
};

/*
 * A card sits in a cards section, which says how its cards are laid out
 * with `data-cards` on an element around them: in a grid with the image on
 * top, with the words over the image, in rows, or as tiles. Lists and tiles
 * show the icon when a card has both; the grid and the words over the image
 * show the image. The section names the image's proportions with
 * `data-crop`, and how rows are set apart with `data-rows`.
 */

const root = cx(
  "group relative flex flex-col gap-5",
  "in-data-[cards=list]:flex-row in-data-[cards=list]:items-center in-data-[cards=list]:gap-4",
  "in-data-[rows=lines]:border-t in-data-[rows=lines]:border-border in-data-[rows=lines]:py-5",
  "in-data-[rows=tiles]:card in-data-[rows=tiles]:p-4 in-data-[rows=tiles]:transition-colors in-data-[rows=tiles]:hover:bg-foreground/3",
  "in-data-[cards=tiles]:card in-data-[cards=tiles]:gap-6 in-data-[cards=tiles]:p-6 in-data-[cards=tiles]:transition-colors in-data-[cards=tiles]:hover:bg-foreground/3 md:in-data-[cards=tiles]:p-8",
);

/** The image's frame: the crop the section asks for, or a small square in a row. */
const frame = cx(
  "relative shrink-0 overflow-hidden rounded-image bg-foreground/5",
  "in-data-[crop=landscape]:aspect-3/2 in-data-[crop=square]:aspect-square in-data-[crop=portrait]:aspect-4/5",
  "in-data-[cards=list]:size-12 in-data-[cards=list]:rounded-md",
  "in-data-[cards=tiles]:rounded-md",
);

const badge = cx(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
  "in-data-[cards=list]:size-12 in-data-[cards=tiles]:size-12",
);

/** Over an image, the words sit on a fade of the surface's color at its foot. */
const overImage = cx(
  "in-data-[cards=overlay]:absolute in-data-[cards=overlay]:inset-x-0 in-data-[cards=overlay]:bottom-0",
  "in-data-[cards=overlay]:bg-linear-to-t in-data-[cards=overlay]:from-background/95 in-data-[cards=overlay]:via-background/75 in-data-[cards=overlay]:to-transparent",
  "in-data-[cards=overlay]:px-6 in-data-[cards=overlay]:pt-20 in-data-[cards=overlay]:pb-6",
);

/*
 * The title links to the card's page, and the link stretches over the whole
 * card, so anywhere on it opens the page; its focus ring is drawn around it.
 */
const stretchedLink = cx(
  "after:absolute after:inset-0 after:rounded-lg",
  "decoration-1 underline-offset-4 group-hover:underline",
  "focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring",
);

const Card = ({ props: card }: BlockComponentProps<typeof props, "default">) => {
  const href = useHref(card.link);
  const hasImage = card.image !== undefined;
  const hasIcon = card.icon !== undefined;
  return (
    <Root
      as="li"
      className={cx(
        root,
        !hasImage &&
          "in-data-[cards=overlay]:card in-data-[cards=overlay]:min-h-64 in-data-[cards=overlay]:justify-end in-data-[cards=overlay]:p-6",
      )}
    >
      {card.image && (
        <div
          className={cx(
            frame,
            hasIcon && "in-data-[cards=list]:hidden in-data-[cards=tiles]:hidden",
          )}
        >
          <Media
            field="image"
            value={card.image}
            sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-103"
          />
        </div>
      )}
      {card.icon && (
        <span
          className={cx(
            badge,
            hasImage && "in-data-[cards=grid]:hidden in-data-[cards=overlay]:hidden",
          )}
        >
          <Icon name={card.icon} className="size-5" />
        </span>
      )}
      <div
        className={cx(
          "flex flex-1 flex-col gap-2 in-data-[cards=list]:gap-1",
          hasImage && overImage,
        )}
      >
        {card.kicker && (
          <Text field="kicker" as="p" value={card.kicker} className="kicker text-primary" />
        )}
        <h3 className="text-heading in-data-[cards=list]:text-lead text-balance in-data-[cards=list]:font-medium">
          <a href={href} className={stretchedLink}>
            <Text field="title" as="span" value={card.title} />
          </a>
        </h3>
        {card.text && (
          <Text
            field="text"
            as="p"
            value={card.text}
            className="text-body in-data-[cards=list]:text-small whitespace-pre-line text-muted-foreground"
          />
        )}
      </div>
      <Icon
        name="chevron-right"
        className="hidden size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 in-data-[cards=list]:block in-data-[cards=tiles]:absolute in-data-[cards=tiles]:top-6 in-data-[cards=tiles]:right-6 in-data-[cards=tiles]:block md:in-data-[cards=tiles]:top-8 md:in-data-[cards=tiles]:right-8"
      />
    </Root>
  );
};

export default defineBlock({
  type: "card",
  version: 1,
  title: "Card",
  placement: "item",
  props,
  variants: ["default"],
  agent: {
    purpose:
      "One card in a cards section that leads to another page: a short title, a line of text and a picture or an icon",
    avoid: [
      "a card without a page to go to, which belongs in a feature grid",
      "more than a sentence of text",
    ],
  },
  placeholder,
  component: Card,
});

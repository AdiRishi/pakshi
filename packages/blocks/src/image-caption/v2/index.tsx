import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Text } from "../../components.tsx";
import { choice, media, optional, text } from "../../fields.ts";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  image: media({ title: "Image" }),
  caption: optional(text({ title: "Caption", max: 240, multiline: true })),
  credit: optional(text({ title: "Credit", max: 80 })),
  crop: choice({ title: "Proportions", options: ["original", "landscape", "square"] }),
};

type Variant = "text" | "wide" | "full";
type Figure = BlockComponentProps<typeof props, Variant>["props"];

const crops = {
  original: "h-auto",
  landscape: "aspect-3/2",
  square: "aspect-square",
} as const satisfies Record<Figure["crop"], string>;

const sizes = {
  text: "(min-width: 48rem) 42rem, 100vw",
  wide: "(min-width: 90rem) 88rem, 100vw",
  full: "100vw",
} as const satisfies Record<Variant, string>;

/** The caption and credit, small and quiet, the caption kept to a readable width. */
const Caption = ({
  figure,
  className,
}: {
  readonly figure: Figure;
  readonly className?: string;
}) =>
  !figure.caption && !figure.credit ? null : (
    <figcaption
      className={cx(
        "flex flex-col gap-1 text-small text-muted-foreground sm:flex-row sm:items-baseline sm:justify-between sm:gap-10",
        className,
      )}
    >
      {figure.caption && (
        <Text
          field="caption"
          as="span"
          value={figure.caption}
          className="max-w-xl whitespace-pre-line"
        />
      )}
      {figure.credit && (
        <Text field="credit" as="span" value={figure.credit} className="shrink-0" />
      )}
    </figcaption>
  );

const ImageCaption = ({ props: figure, variant }: BlockComponentProps<typeof props, Variant>) =>
  variant === "full" ? (
    <Section>
      <figure className="flex flex-col gap-4">
        <Media
          field="image"
          value={figure.image}
          sizes={sizes.full}
          className="max-h-svh w-full object-cover"
        />
        <Caption figure={figure} className="page-width" />
      </figure>
    </Section>
  ) : (
    <Section>
      <div className="page-width">
        <figure className={cx("flex flex-col gap-4", variant === "text" && "mx-auto max-w-2xl")}>
          <Media
            field="image"
            value={figure.image}
            sizes={sizes[variant]}
            className={cx("w-full rounded-image object-cover", crops[figure.crop])}
          />
          <Caption figure={figure} />
        </figure>
      </div>
    </Section>
  );

export default defineBlock({
  type: "image-caption",
  version: 2,
  title: "Image and caption",
  placement: "section",
  props,
  variants: ["text", "wide", "full"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "One photo worth a section of its own, between other sections or in the middle of long writing, with a line on what it shows and who took it",
    avoid: [
      "several photos, which belong in a gallery",
      "a photo that needs paragraphs of explanation, which belongs beside its text",
      "words on the photo",
    ],
  },
  placeholder,
  component: ImageCaption,
});

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Root, Text } from "../../components.tsx";
import { media, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  image: media({ title: "Image" }),
  caption: optional(text({ title: "Caption", max: 240, multiline: true })),
  credit: optional(text({ title: "Credit", max: 80 })),
};

const ImageCaption = ({
  props: figure,
  variant,
}: BlockComponentProps<typeof props, "wide" | "narrow">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <figure
      className={
        variant === "wide"
          ? "mx-auto flex max-w-6xl flex-col gap-4"
          : "mx-auto flex max-w-3xl flex-col gap-4"
      }
    >
      <Media
        field="image"
        value={figure.image}
        sizes={
          variant === "wide" ? "(min-width: 72rem) 72rem, 100vw" : "(min-width: 48rem) 48rem, 100vw"
        }
        className={
          variant === "wide"
            ? "rounded-image aspect-[16/9] w-full object-cover"
            : "rounded-image aspect-[4/3] w-full object-cover"
        }
      />
      {(figure.caption || figure.credit) && (
        <figcaption className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
          {figure.caption && (
            <Text
              field="caption"
              as="span"
              value={figure.caption}
              className="text-body whitespace-pre-line text-muted-foreground"
            />
          )}
          {figure.credit && (
            <Text
              field="credit"
              as="span"
              value={figure.credit}
              className="text-small text-muted-foreground"
            />
          )}
        </figcaption>
      )}
    </figure>
  </Root>
);

export default defineBlock({
  type: "image-caption",
  version: 1,
  title: "Image and caption",
  placement: "section",
  props,
  variants: ["wide", "narrow"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "One image worth a section of its own, with a line on what it shows and who took it",
    avoid: [
      "several images, which belong in a gallery",
      "an image that needs paragraphs of explanation, which belongs in a split",
    ],
  },
  placeholder,
  component: ImageCaption,
});

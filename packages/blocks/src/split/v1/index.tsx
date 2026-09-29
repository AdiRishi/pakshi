import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, RichText, Root, Text } from "../../components.tsx";
import { cta, media, optional, richText, text } from "../../fields.ts";

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  body: richText({ title: "Text", marks: ["bold", "italic", "link"], nodes: ["bulletList"] }),
  image: media({ title: "Image" }),
  cta: optional(cta({ title: "Button" })),
};

const Split = ({
  props: split,
  variant,
}: BlockComponentProps<typeof props, "image-right" | "image-left">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
      <div
        className={
          variant === "image-left"
            ? "flex flex-col items-start gap-6 md:order-2"
            : "flex flex-col items-start gap-6"
        }
      >
        <Text field="heading" as="h2" value={split.heading} className="text-title text-balance" />
        <RichText
          field="body"
          value={split.body}
          className="text-body text-muted-foreground [&_a]:text-primary [&_a]:underline [&_li+li]:mt-1 [&_p+*]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul+*]:mt-4"
        />
        {split.cta && (
          <Cta
            field="cta"
            value={split.cta}
            className="text-body mt-2 inline-flex items-center rounded-md bg-primary px-6 py-3 text-primary-foreground shadow-card transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        )}
      </div>
      <Media
        field="image"
        value={split.image}
        sizes="(min-width: 48rem) 50vw, 100vw"
        className="rounded-image aspect-[4/3] w-full object-cover"
      />
    </div>
  </Root>
);

export default defineBlock({
  type: "split",
  version: 1,
  title: "Split",
  placement: "section",
  props,
  variants: ["image-right", "image-left"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "A short explanation beside an image that shows it",
    avoid: ["several in a row with the image on the same side"],
  },
  component: Split,
});

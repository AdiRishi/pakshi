import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, RichText, Root, Text } from "../../components.tsx";
import { cta, media, optional, richText, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  body: optional(richText({ title: "Text", marks: ["bold", "italic", "link"] })),
  image: optional(media({ title: "Image" })),
  cta: optional(cta({ title: "Button" })),
};

const Hero = ({
  props: hero,
  variant,
}: BlockComponentProps<typeof props, "centered" | "split-image">) => {
  const copy = (
    <div
      className={
        variant === "centered"
          ? "mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
          : "flex flex-col items-start gap-6"
      }
    >
      <Text
        field="heading"
        as="h1"
        value={hero.heading}
        className="text-title md:text-display text-balance"
      />
      {hero.body && (
        <RichText
          field="body"
          value={hero.body}
          className="text-lead text-muted-foreground [&_a]:text-primary [&_a]:underline [&_p+p]:mt-4"
        />
      )}
      {hero.cta && (
        <Cta
          field="cta"
          value={hero.cta}
          className="text-body mt-2 inline-flex items-center rounded-md bg-primary px-6 py-3 text-primary-foreground shadow-card transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      )}
    </div>
  );
  return (
    <Root className="py-section bg-background px-6 text-foreground">
      {variant === "centered" ? (
        <div className="mx-auto flex max-w-5xl flex-col gap-12">
          {copy}
          {hero.image && (
            <Media
              field="image"
              value={hero.image}
              priority
              sizes="(min-width: 64rem) 64rem, 100vw"
              className="rounded-image aspect-[16/9] w-full object-cover"
            />
          )}
        </div>
      ) : (
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          {copy}
          {hero.image && (
            <Media
              field="image"
              value={hero.image}
              priority
              sizes="(min-width: 48rem) 50vw, 100vw"
              className="rounded-image aspect-[4/3] w-full object-cover"
            />
          )}
        </div>
      )}
    </Root>
  );
};

export default defineBlock({
  type: "hero",
  version: 1,
  title: "Hero",
  placement: "section",
  props,
  variants: ["centered", "split-image"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "Opening message of a page, with one primary action",
    avoid: ["more than one per page"],
  },
  placeholder,
  component: Hero,
});

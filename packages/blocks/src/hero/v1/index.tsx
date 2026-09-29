import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, RichText, Root, Text } from "../../components.tsx";
import { cta, media, optional, richText, text } from "../../fields.ts";

const props = {
  heading: text({ min: 3, max: 80 }),
  body: optional(richText({ marks: ["bold", "italic", "link"] })),
  image: optional(media()),
  cta: optional(cta()),
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
        className="text-title text-balance md:text-display"
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
          className="mt-2 inline-flex items-center rounded-md bg-primary px-6 py-3 text-body text-primary-foreground shadow-card transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      )}
    </div>
  );
  return (
    <Root className="bg-background px-6 py-section text-foreground">
      {variant === "centered" ? (
        <div className="mx-auto flex max-w-5xl flex-col gap-12">
          {copy}
          {hero.image && (
            <Media
              field="image"
              value={hero.image}
              priority
              sizes="(min-width: 64rem) 64rem, 100vw"
              className="aspect-[16/9] w-full rounded-image object-cover"
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
              className="aspect-[4/3] w-full rounded-image object-cover"
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
  interactive: false,
  agent: {
    purpose: "Opening message of a page, with one primary action",
    avoid: ["more than one per page"],
  },
  component: Hero,
});

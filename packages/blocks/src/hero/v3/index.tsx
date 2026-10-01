import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, Root, Text } from "../../components.tsx";
import { cta, list, media, optional, text } from "../../fields.ts";
import { plainText } from "../../rich-text.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 80 }),
  summary: optional(text({ title: "Text", max: 280, multiline: true })),
  image: optional(media({ title: "Image" })),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
};

type Variant = "centered" | "split-image" | "full-bleed";

const button =
  "text-body inline-flex items-center rounded-md px-6 py-3 transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const Hero = ({ props: hero, variant }: BlockComponentProps<typeof props, Variant>) => {
  const copy = (
    <div
      className={
        variant === "split-image"
          ? "flex flex-col items-start gap-6"
          : "mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
      }
    >
      <div className="flex flex-col gap-3">
        {hero.kicker && (
          <Text
            field="kicker"
            as="p"
            value={hero.kicker}
            className="text-small font-semibold tracking-wide text-primary uppercase"
          />
        )}
        <Text
          field="heading"
          as="h1"
          value={hero.heading}
          className="text-title md:text-display text-balance"
        />
      </div>
      {hero.summary && (
        <Text
          field="summary"
          as="p"
          value={hero.summary}
          className="text-lead whitespace-pre-line text-muted-foreground"
        />
      )}
      {hero.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {hero.actions.map((action, index) => (
            <Cta
              key={action.id}
              field={["actions", action.id, "button"]}
              value={action.button}
              className={
                index === 0
                  ? `${button} bg-primary text-primary-foreground shadow-card`
                  : `${button} border border-primary text-primary`
              }
            />
          ))}
        </div>
      )}
    </div>
  );
  switch (variant) {
    case "full-bleed":
      return (
        <Root className="relative isolate bg-background text-foreground">
          {hero.image && (
            <Media
              field="image"
              value={hero.image}
              priority
              sizes="100vw"
              className="absolute inset-0 -z-10 size-full object-cover"
            />
          )}
          <div className="py-section px-6">
            <div className="mx-auto max-w-3xl rounded-lg bg-background/90 p-10 shadow-card">
              {copy}
            </div>
          </div>
        </Root>
      );
    case "centered":
      return (
        <Root className="py-section bg-background px-6 text-foreground">
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
        </Root>
      );
    case "split-image":
      return (
        <Root className="py-section bg-background px-6 text-foreground">
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
        </Root>
      );
  }
};

export default defineBlock({
  type: "hero",
  version: 3,
  title: "Hero",
  placement: "section",
  props,
  variants: ["centered", "split-image", "full-bleed"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "Opening message of a page, with one primary action and at most one other",
    avoid: ["more than one per page", "a second button that competes with the first"],
  },
  changes:
    "Adds a full-bleed layout with the text over the image, and a short line above the heading. The text under the heading becomes plain text, so it reads well on any image.",
  // Rich text under the heading becomes its plain text, a paragraph to a line.
  migrate: ({ body, ...rest }) =>
    body === undefined ? rest : { ...rest, summary: plainText(body) },
  placeholder,
  component: Hero,
});

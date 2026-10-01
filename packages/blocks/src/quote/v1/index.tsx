import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Root, Text } from "../../components.tsx";
import { media, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  quote: text({ title: "Quote", min: 3, max: 400, multiline: true }),
  name: text({ title: "Name", max: 80 }),
  role: optional(text({ title: "Role", max: 80 })),
  photo: optional(media({ title: "Photo" })),
};

const Quote = ({
  props: quote,
  variant,
}: BlockComponentProps<typeof props, "centered" | "with-photo">) => {
  const largePhoto = variant === "with-photo" ? quote.photo : undefined;
  const avatar = variant === "centered" ? quote.photo : undefined;
  return (
    <Root className="py-section bg-background px-6 text-foreground">
      <figure
        className={
          largePhoto
            ? "mx-auto grid max-w-5xl items-center gap-x-12 gap-y-8 md:grid-cols-3"
            : "mx-auto flex max-w-3xl flex-col items-center gap-8 text-center"
        }
      >
        {largePhoto && (
          <Media
            field="photo"
            value={largePhoto}
            sizes="(min-width: 48rem) 20rem, 100vw"
            className="rounded-image aspect-square w-full object-cover md:row-span-2"
          />
        )}
        <blockquote className={largePhoto ? "md:col-span-2 md:self-end" : undefined}>
          <Text
            field="quote"
            as="p"
            value={quote.quote}
            className="text-title text-balance whitespace-pre-line"
          />
        </blockquote>
        <figcaption
          className={
            largePhoto ? "md:col-span-2 md:self-start" : "flex flex-col items-center gap-4"
          }
        >
          {avatar && (
            <Media
              field="photo"
              value={avatar}
              sizes="4rem"
              className="size-16 rounded-full object-cover"
            />
          )}
          <div className="flex flex-col gap-1">
            <Text field="name" as="p" value={quote.name} className="text-body font-semibold" />
            {quote.role && (
              <Text
                field="role"
                as="p"
                value={quote.role}
                className="text-small text-muted-foreground"
              />
            )}
          </div>
        </figcaption>
      </figure>
    </Root>
  );
};

export default defineBlock({
  type: "quote",
  version: 1,
  title: "Quote",
  placement: "section",
  props,
  variants: ["centered", "with-photo"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "One person's own words, such as a student's or a parent's, with who said it",
    avoid: ["quotes or names nobody gave you", "several in a row, so pick the strongest"],
  },
  placeholder,
  component: Quote,
});

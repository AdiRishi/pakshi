import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Root, Text } from "../../components.tsx";
import { list, media, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: optional(text({ title: "Heading", max: 80 })),
  images: list({
    title: "Images",
    item: {
      image: media({ title: "Image" }),
      caption: optional(text({ title: "Caption", max: 140 })),
    },
    max: 24,
  }),
};

const Gallery = ({
  props: gallery,
  variant,
}: BlockComponentProps<typeof props, "grid" | "wide">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      {gallery.heading && (
        <Text field="heading" as="h2" value={gallery.heading} className="text-title text-balance" />
      )}
      <ul
        className={
          variant === "grid"
            ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            : "grid gap-6 md:grid-cols-2"
        }
      >
        {gallery.images.map((item) => (
          <li key={item.id}>
            <figure className="flex flex-col gap-3">
              <Media
                field={["images", item.id, "image"]}
                value={item.image}
                sizes={
                  variant === "grid"
                    ? "(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
                    : "(min-width: 48rem) 50vw, 100vw"
                }
                className="rounded-image aspect-[4/3] w-full object-cover"
              />
              {item.caption && (
                <figcaption>
                  <Text
                    field={["images", item.id, "caption"]}
                    as="span"
                    value={item.caption}
                    className="text-small text-muted-foreground"
                  />
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>
    </div>
  </Root>
);

export default defineBlock({
  type: "gallery",
  version: 1,
  title: "Gallery",
  placement: "section",
  props,
  variants: ["grid", "wide"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "A set of photos that together show a place, an event or work",
    avoid: ["a single image, which belongs in a split or hero"],
  },
  placeholder,
  component: Gallery,
});

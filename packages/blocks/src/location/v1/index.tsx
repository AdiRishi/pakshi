import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, Root, Text } from "../../components.tsx";
import { cta, media, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  address: text({ title: "Address", max: 240, multiline: true }),
  map: optional(media({ title: "Map or photo" })),
  directions: optional(text({ title: "How to get there", max: 400, multiline: true })),
  link: optional(cta({ title: "Button" })),
};

const Location = ({
  props: location,
  variant,
}: BlockComponentProps<typeof props, "image-left" | "image-right">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div
      className={
        location.map
          ? "mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2"
          : "mx-auto grid max-w-3xl gap-12"
      }
    >
      <div
        className={
          variant === "image-left"
            ? "flex flex-col items-start gap-6 md:order-2"
            : "flex flex-col items-start gap-6"
        }
      >
        <Text
          field="heading"
          as="h2"
          value={location.heading}
          className="text-title text-balance"
        />
        <address className="not-italic">
          <Text
            field="address"
            as="p"
            value={location.address}
            className="text-lead whitespace-pre-line"
          />
        </address>
        {location.directions && (
          <Text
            field="directions"
            as="p"
            value={location.directions}
            className="text-body whitespace-pre-line text-muted-foreground"
          />
        )}
        {location.link && (
          <Cta
            field="link"
            value={location.link}
            className="text-body mt-2 inline-flex items-center rounded-md bg-primary px-6 py-3 text-primary-foreground shadow-card transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        )}
      </div>
      {location.map && (
        <Media
          field="map"
          value={location.map}
          sizes="(min-width: 48rem) 50vw, 100vw"
          className="rounded-image aspect-[4/3] w-full object-cover"
        />
      )}
    </div>
  </Root>
);

export default defineBlock({
  type: "location",
  version: 1,
  title: "Location",
  placement: "section",
  props,
  variants: ["image-left", "image-right"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "Where something happens: the address, a map or photo of the place from the media library, how to get there, and a link to directions",
    avoid: [
      "several places in one section; use one for each place",
      "opening hours or contact details, which belong in rich text",
    ],
  },
  placeholder,
  component: Location,
});

import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Text } from "../../components.tsx";
import { choice, cta, list, media, optional, text } from "../../fields.ts";
import type { IconName } from "../../icon-names.ts";
import { Actions } from "../../kit/actions.tsx";
import { Icon } from "../../kit/icon.tsx";
import { Intro } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  address: text({ title: "Address", max: 240, multiline: true }),
  hours: list({
    title: "Opening hours",
    item: {
      days: text({ title: "Days", max: 40 }),
      times: text({ title: "Hours", max: 40 }),
    },
    min: 0,
    max: 8,
  }),
  directions: optional(text({ title: "How to get there", max: 400, multiline: true })),
  map: optional(media({ title: "Map or photo" })),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  mediaSide: choice({ title: "Map side", options: ["end", "start"] }),
};

type Variant = "split" | "stacked";
type Location = BlockComponentProps<typeof props, Variant>["props"];

/** One part of the details, under a small label with its icon. */
const Part = ({
  icon,
  label,
  className,
  children,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) => (
  <div className={cx("flex flex-col gap-3", className)}>
    <h3 className="text-small font-body flex items-center gap-2 font-medium text-muted-foreground">
      <Icon name={icon} className="size-4 text-primary" />
      {label}
    </h3>
    {children}
  </div>
);

/** Where it is, when it's open and how to get there. */
const Parts = ({
  location,
  className,
  part,
}: {
  readonly location: Location;
  readonly className: string;
  readonly part: string;
}) => (
  <div className={className}>
    <Part icon="map-pin" label="Address" className={part}>
      <address className="not-italic">
        <Text
          field="address"
          as="p"
          value={location.address}
          className="text-lead whitespace-pre-line"
        />
      </address>
    </Part>
    {location.hours.length > 0 && (
      <Part icon="clock" label="Opening hours" className={part}>
        <dl className="text-body">
          {location.hours.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap justify-between gap-x-6 gap-y-0.5 border-b border-border py-2.5 first:pt-0 last:border-b-0"
            >
              <dt>
                <Text field={["hours", row.id, "days"]} as="span" value={row.days} />
              </dt>
              <dd className="text-muted-foreground tabular-nums">
                <Text field={["hours", row.id, "times"]} as="span" value={row.times} />
              </dd>
            </div>
          ))}
        </dl>
      </Part>
    )}
    {location.directions && (
      <Part icon="route" label="Getting here" className={part}>
        <Text
          field="directions"
          as="p"
          value={location.directions}
          className="text-body whitespace-pre-line text-muted-foreground"
        />
      </Part>
    )}
  </div>
);

const LocationSection = ({
  props: location,
  variant,
}: BlockComponentProps<typeof props, Variant>) => {
  switch (variant) {
    case "split": {
      const [words, picture] =
        location.mediaSide === "start"
          ? ["lg:col-start-2", "lg:col-start-1"]
          : ["lg:col-start-1", "lg:col-start-2"];
      return (
        <Section>
          <div className="page-width grid gap-12 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-20">
            <Intro content={location} className={cx("lg:row-start-1", words)} />
            {location.map && (
              <div className={cx("lg:row-span-2 lg:row-start-1", picture)}>
                <Media
                  field="map"
                  value={location.map}
                  sizes="(min-width: 64rem) 50vw, 100vw"
                  className="rounded-image aspect-4/3 w-full object-cover lg:sticky lg:top-24 lg:aspect-4/5"
                />
              </div>
            )}
            <div className={cx("flex flex-col gap-10 lg:row-start-2", words)}>
              <Parts
                location={location}
                className="flex flex-col gap-10"
                part="border-t border-border pt-6"
              />
              <Actions actions={location.actions} others="secondary" />
            </div>
          </div>
        </Section>
      );
    }
    case "stacked":
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <Intro content={location} />
              <Actions actions={location.actions} others="secondary" className="md:shrink-0" />
            </div>
            <Parts
              location={location}
              className="grid gap-x-10 gap-y-10 md:grid-cols-3"
              part="border-t border-border pt-6"
            />
            {location.map && (
              <Media
                field="map"
                value={location.map}
                sizes="(min-width: 90rem) 88rem, 100vw"
                className="rounded-image aspect-4/3 w-full object-cover sm:aspect-video lg:aspect-21/9"
              />
            )}
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "location",
  version: 2,
  title: "Location",
  placement: "section",
  props,
  variants: ["split", "stacked"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "Where a place is and how to visit it: its address, opening hours by day, how to get there, a map or photo from the media library, and a button for directions",
    avoid: [
      "several places in one section; use one for each place",
      "phone numbers and email addresses, which belong in contact details",
    ],
  },
  placeholder,
  component: LocationSection,
});

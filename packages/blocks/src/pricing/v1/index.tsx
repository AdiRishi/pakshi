import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock, useBlockFrame } from "../../block.tsx";
import { Slot, Text } from "../../components.tsx";
import { choice, optional, text } from "../../fields.ts";
import { Intro } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  note: optional(text({ title: "Note", max: 240, multiline: true })),
  align: choice({ title: "Heading alignment", options: ["center", "start"] }),
};

type Variant = "cards" | "rows";

/** Plans side by side, as many across as there are, up to four; one plan sits alone in the middle. */
const cardColumns = (count: number) =>
  count <= 1
    ? "mx-auto w-full max-w-md"
    : count === 2
      ? "mx-auto w-full max-w-4xl md:grid-cols-2"
      : count === 3
        ? "md:grid-cols-2 lg:grid-cols-3"
        : "md:grid-cols-2 xl:grid-cols-4";

const Pricing = ({ props: pricing, variant }: BlockComponentProps<typeof props, Variant>) => {
  const { slots } = useBlockFrame();
  const center = pricing.align === "center";
  return (
    <Section>
      <div className="page-width flex flex-col gap-14 md:gap-16">
        <Intro content={pricing} align={pricing.align} />
        <div className="flex flex-col gap-8">
          {variant === "cards" ? (
            <Slot
              name="plans"
              as="ul"
              className={cx("grid gap-4", cardColumns(slots["plans"]?.length ?? 0))}
            />
          ) : (
            <Slot
              name="plans"
              as="ul"
              className={cx("flex w-full flex-col gap-4", center && "mx-auto max-w-5xl")}
            />
          )}
          {pricing.note && (
            <Text
              field="note"
              as="p"
              value={pricing.note}
              className={cx(
                "text-small max-w-2xl whitespace-pre-line text-muted-foreground",
                center && "mx-auto text-center",
              )}
            />
          )}
        </div>
      </div>
    </Section>
  );
};

export default defineBlock({
  type: "pricing",
  version: 1,
  title: "Pricing",
  placement: "section",
  props,
  variants: ["cards", "rows"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: { plans: { title: "Plans", accepts: ["pricing-plan"] } },
  interactive: false,
  agent: {
    purpose:
      "Prices to choose between: ticket types, membership tiers or plans, each with what it includes and a button. Cards suit two to four plans compared side by side, rows suit ticket types with a sentence each",
    avoid: [
      "a single price, which can go in a feature or a call to action",
      "more than four plans side by side",
      "prices nobody gave you",
    ],
  },
  placeholder,
  component: Pricing,
});

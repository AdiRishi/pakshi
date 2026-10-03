import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Slot } from "../../components.tsx";
import { choice, cta, list, optional, text } from "../../fields.ts";
import { Actions } from "../../kit/actions.tsx";
import { Intro } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  columns: choice({ title: "Columns", options: ["3", "2"] }),
};

type Variant = "grid" | "list";
type Events = BlockComponentProps<typeof props, Variant>["props"];

const columns = {
  "3": "sm:grid-cols-2 lg:grid-cols-3 fill-row-3",
  "2": "sm:grid-cols-2",
} as const satisfies Record<Events["columns"], string>;

/*
 * The events are blocks of their own. The section marks its layout with
 * `data-events`, and each event sets itself out for it.
 */
const EventCards = ({ props: events, variant }: BlockComponentProps<typeof props, Variant>) => (
  <Section>
    <div
      data-events={variant}
      className={cx("page-width flex flex-col gap-14 md:gap-16", variant === "list" && "max-w-5xl")}
    >
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <Intro content={events} />
        <Actions actions={events.actions} others="link" className="md:shrink-0" />
      </div>
      <Slot
        name="events"
        as="ul"
        className={
          variant === "grid"
            ? cx("grid gap-x-6 gap-y-14", columns[events.columns])
            : "border-b border-border"
        }
      />
    </div>
  </Section>
);

export default defineBlock({
  type: "event-cards",
  version: 2,
  title: "Event cards",
  placement: "section",
  props,
  variants: ["grid", "list"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: { events: { title: "Events", accepts: ["event-card"] } },
  interactive: false,
  agent: {
    purpose:
      "Upcoming events or exhibitions, each with its date, time and place, what it is and a sentence about it. The list suits many events or ones without pictures",
    avoid: [
      "events that have already happened",
      "a single event, which reads better as a split",
      "the sessions of one day, which belong in a timeline's agenda",
    ],
  },
  placeholder,
  component: EventCards,
});

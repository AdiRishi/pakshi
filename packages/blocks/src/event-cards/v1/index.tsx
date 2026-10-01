import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, Slot, Text } from "../../components.tsx";
import { optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
};

const EventCards = ({
  props: section,
  variant,
}: BlockComponentProps<typeof props, "grid" | "list">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div
      className={
        variant === "grid"
          ? "mx-auto flex max-w-6xl flex-col gap-12"
          : "mx-auto flex max-w-4xl flex-col gap-12"
      }
    >
      <div className="flex max-w-2xl flex-col gap-4">
        <Text field="heading" as="h2" value={section.heading} className="text-title text-balance" />
        {section.intro && (
          <Text
            field="intro"
            as="p"
            value={section.intro}
            className="text-lead whitespace-pre-line text-muted-foreground"
          />
        )}
      </div>
      <Slot
        name="events"
        as="ul"
        className={
          variant === "grid" ? "grid gap-8 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-6"
        }
      />
    </div>
  </Root>
);

export default defineBlock({
  type: "event-cards",
  version: 1,
  title: "Event cards",
  placement: "section",
  props,
  variants: ["grid", "list"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: { events: { title: "Events", accepts: ["event-card"] } },
  interactive: false,
  agent: {
    purpose: "Upcoming events, each with its date and time, what it is and where it happens",
    avoid: ["events that have already happened", "a single event, which reads better as a split"],
  },
  placeholder,
  component: EventCards,
});

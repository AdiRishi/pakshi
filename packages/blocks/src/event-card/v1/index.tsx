import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, Root, Text } from "../../components.tsx";
import { cta, media, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  date: text({ title: "Date and time", max: 40 }),
  title: text({ title: "Title", max: 80 }),
  place: optional(text({ title: "Place", max: 80 })),
  summary: optional(text({ title: "Summary", max: 240, multiline: true })),
  image: optional(media({ title: "Image" })),
  link: optional(cta({ title: "Link" })),
};

const EventCard = ({ props: event }: BlockComponentProps<typeof props, "default">) => (
  <Root
    as="li"
    className="@container overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
  >
    <div className="flex h-full flex-col @xl:flex-row">
      {event.image && (
        <Media
          field="image"
          value={event.image}
          sizes="(min-width: 64rem) 24rem, (min-width: 40rem) 50vw, 100vw"
          className="aspect-[4/3] w-full object-cover @xl:w-2/5"
        />
      )}
      <div className="flex flex-1 flex-col items-start gap-3 p-6">
        {/* The date shows above the title but follows it in reading order, so heading navigation lands on the title. */}
        <Text field="title" as="h3" value={event.title} className="text-heading text-balance" />
        <Text
          field="date"
          as="p"
          value={event.date}
          className="text-lead order-first font-semibold text-primary"
        />
        {event.place && (
          <Text
            field="place"
            as="p"
            value={event.place}
            className="text-small text-muted-foreground"
          />
        )}
        {event.summary && (
          <Text
            field="summary"
            as="p"
            value={event.summary}
            className="text-body whitespace-pre-line text-muted-foreground"
          />
        )}
        {event.link && (
          <Cta
            field="link"
            value={event.link}
            className="text-body mt-auto rounded-sm font-medium text-primary underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        )}
      </div>
    </div>
  </Root>
);

export default defineBlock({
  type: "event-card",
  version: 1,
  title: "Event",
  placement: "item",
  props,
  variants: ["default"],
  agent: {
    purpose: "One event in a list of events: when, what and where, with a sentence about it",
  },
  placeholder,
  component: EventCard,
});

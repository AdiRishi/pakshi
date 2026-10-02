import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Media, Root, Text } from "../../components.tsx";
import { cta, media, optional, text } from "../../fields.ts";
import type { IconName } from "../../icon-names.ts";
import { buttonClass } from "../../kit/button.ts";
import { Icon } from "../../kit/icon.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  date: text({ title: "Date", max: 40 }),
  time: optional(text({ title: "Time", max: 40 })),
  place: optional(text({ title: "Place", max: 80 })),
  title: text({ title: "Title", max: 80 }),
  body: optional(text({ title: "Text", max: 200, multiline: true })),
  image: optional(media({ title: "Image" })),
  link: optional(cta({ title: "Link" })),
};

type Event = BlockComponentProps<typeof props, "default">["props"];

/** A date as a calendar shows it: the day large, the month short, and any word before them. */
interface CalendarDate {
  readonly before: string;
  readonly day: string;
  readonly month: string;
}

const dayFirst = /^(.*?)\b(\d{1,2}(?:\s*[–-]\s*\d{1,2})?)(?:st|nd|rd|th)?\s+(\p{L}{3,})/u;
const monthFirst = /^(.*?)\b(\p{L}{3,})\.?\s+(\d{1,2}(?:\s*[–-]\s*\d{1,2})?)\b/u;

/**
 * The day and month in a date written as words, such as "Sat 5 July" or
 * "Until 3 May 2027", or undefined when it names no day.
 */
const calendarDate = (date: string): CalendarDate | undefined => {
  const parts = dayFirst.exec(date);
  if (parts !== null) return { before: parts[1] ?? "", day: parts[2] ?? "", month: parts[3] ?? "" };
  const reversed = monthFirst.exec(date);
  if (reversed !== null)
    return { before: reversed[1] ?? "", day: reversed[3] ?? "", month: reversed[2] ?? "" };
  return undefined;
};

/*
 * An events section marks its layout with `data-events`. In cards, an event
 * shows its picture, or its date large in a panel when it has none; in a
 * list, its date sits large in a column of its own, with any picture small
 * at the end.
 */
const Calendar = ({ event }: { readonly event: Event }) => {
  const date = calendarDate(event.date);
  return (
    <div
      aria-hidden
      className={cx(
        "flex flex-col items-center justify-center gap-1 text-center",
        event.image ? "hidden" : "mb-1 aspect-3/2 w-full rounded-image bg-primary/8 text-primary",
        "in-data-[events=list]:mb-0 in-data-[events=list]:flex in-data-[events=list]:aspect-auto in-data-[events=list]:w-auto in-data-[events=list]:items-start in-data-[events=list]:justify-start in-data-[events=list]:rounded-none in-data-[events=list]:bg-transparent in-data-[events=list]:text-start in-data-[events=list]:text-foreground",
      )}
    >
      {date === undefined ? (
        <Icon name="calendar-days" className="size-8 text-primary" />
      ) : (
        <>
          {date.before.trim() && (
            <span className="text-small text-muted-foreground">{date.before.trim()}</span>
          )}
          <span className="font-heading text-display in-data-[events=list]:text-title leading-none tabular-nums">
            {date.day}
          </span>
          <span className="text-lead in-data-[events=list]:text-small font-medium">
            {date.month.slice(0, 3)}
          </span>
        </>
      )}
    </div>
  );
};

const Fact = ({
  icon,
  field,
  value,
  className,
}: {
  readonly icon: IconName;
  readonly field: "date" | "time" | "place";
  readonly value: string;
  readonly className?: string | undefined;
}) => (
  <span className={cx("inline-flex items-center gap-1.5", className)}>
    <Icon name={icon} className="size-4 shrink-0" />
    <Text field={field} as="span" value={value} />
  </span>
);

/**
 * When, then where: the date and time on one line and the place under them
 * in cards, all on one line in a list, where the date column already shows
 * the date to sighted readers.
 */
const Facts = ({ event }: { readonly event: Event }) => (
  <div className="text-small order-first flex flex-col gap-1 text-muted-foreground in-data-[events=list]:order-none in-data-[events=list]:flex-row in-data-[events=list]:flex-wrap in-data-[events=list]:gap-x-4">
    <p className="flex flex-wrap gap-x-4 gap-y-1">
      <Fact
        icon="calendar"
        field="date"
        value={event.date}
        className={
          calendarDate(event.date) === undefined ? undefined : "in-data-[events=list]:sr-only"
        }
      />
      {event.time && <Fact icon="clock" field="time" value={event.time} />}
    </p>
    {event.place && (
      <p className="flex">
        <Fact icon="map-pin" field="place" value={event.place} />
      </p>
    )}
  </div>
);

const EventCard = ({ props: event }: BlockComponentProps<typeof props, "default">) => (
  <Root
    as="li"
    className={cx(
      "flex flex-col gap-3",
      "in-data-[events=list]:grid in-data-[events=list]:grid-cols-[4rem_minmax(0,1fr)] in-data-[events=list]:gap-x-6 in-data-[events=list]:border-t in-data-[events=list]:border-border in-data-[events=list]:py-8",
      "md:in-data-[events=list]:grid-cols-[6rem_minmax(0,1fr)_auto] md:in-data-[events=list]:gap-x-10",
    )}
  >
    <Calendar event={event} />
    {event.image && (
      <Media
        field="image"
        value={event.image}
        sizes="(min-width: 64rem) 30vw, (min-width: 40rem) 50vw, 100vw"
        className={cx(
          "mb-1 aspect-3/2 w-full rounded-image object-cover",
          "in-data-[events=list]:col-start-3 in-data-[events=list]:row-start-1 in-data-[events=list]:mb-0 in-data-[events=list]:hidden in-data-[events=list]:aspect-4/3 in-data-[events=list]:w-44 md:in-data-[events=list]:block",
        )}
      />
    )}
    <div className="flex flex-col items-start gap-3">
      <Text field="title" as="h3" value={event.title} className="text-heading text-balance" />
      {/* The facts show above the title in cards but follow it in reading order, so heading navigation lands on the title. */}
      <Facts event={event} />
      {event.body && (
        <Text
          field="body"
          as="p"
          value={event.body}
          className="text-body max-w-prose whitespace-pre-line text-muted-foreground"
        />
      )}
      {event.link && (
        <Cta
          field="link"
          value={event.link}
          className={buttonClass({ variant: "link", size: "sm", className: "mt-1" })}
        />
      )}
    </div>
  </Root>
);

export default defineBlock({
  type: "event-card",
  version: 2,
  title: "Event",
  placement: "item",
  props,
  variants: ["default"],
  agent: {
    purpose:
      "One event in a list of events: its date, and its time and place if it has them, what it is, and a sentence about it",
    avoid: ["a date written as numbers only, such as 12/07; write the month as a word"],
  },
  placeholder,
  component: EventCard,
});

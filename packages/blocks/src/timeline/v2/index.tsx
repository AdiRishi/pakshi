import { cx } from "class-variance-authority";
import type { ComponentType } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Text } from "../../components.tsx";
import { cta, icon, list, optional, text } from "../../fields.ts";
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
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  entries: list({
    title: "Entries",
    item: {
      when: text({ title: "When", max: 40 }),
      title: text({ title: "Title", max: 80 }),
      who: optional(text({ title: "Who", max: 80 })),
      place: optional(text({ title: "Where", max: 80 })),
      detail: optional(text({ title: "Detail", max: 240, multiline: true })),
      icon: optional(icon({ title: "Icon" })),
    },
    min: 2,
    max: 20,
  }),
};

type Variant = "agenda" | "vertical" | "horizontal";
type Timeline = BlockComponentProps<typeof props, Variant>["props"];
type Entry = Timeline["entries"][number];

const field = (entry: Entry, name: "when" | "title" | "who" | "place" | "detail") => [
  "entries",
  entry.id,
  name,
];

/** Who leads it and where it happens, on one line under the title. */
const Byline = ({ entry }: { readonly entry: Entry }) =>
  entry.who || entry.place ? (
    <p className="text-small flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
      {entry.who && (
        <Text
          field={field(entry, "who")}
          as="span"
          value={entry.who}
          className="font-medium text-foreground"
        />
      )}
      {entry.place && (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="map-pin" className="size-4 shrink-0" />
          <Text field={field(entry, "place")} as="span" value={entry.place} />
        </span>
      )}
    </p>
  ) : null;

const Detail = ({ entry, className }: { readonly entry: Entry; readonly className?: string }) =>
  entry.detail ? (
    <Text
      field={field(entry, "detail")}
      as="p"
      value={entry.detail}
      className={cx("text-body whitespace-pre-line text-muted-foreground", className)}
    />
  ) : null;

/** A point on the line: a dot, or the entry's icon in a ring. */
const Marker = ({ entry }: { readonly entry: Entry }) =>
  entry.icon ? (
    <span className="relative flex size-9 items-center justify-center rounded-full border border-border bg-background text-primary">
      <Icon name={entry.icon} className="size-4" />
    </span>
  ) : (
    <span className="relative mt-3 size-3 rounded-full bg-primary ring-6 ring-background" />
  );

/*
 * A schedule: times in a column, each session's title, who leads it and
 * where, with breaks (the entries with an icon) set apart in a band.
 */
const Agenda = ({ timeline }: { readonly timeline: Timeline }) => (
  <ol className="border-b border-border">
    {timeline.entries.map((entry) => (
      <li
        key={entry.id}
        className={cx(
          "grid gap-x-8 gap-y-2 px-4 py-6 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-baseline md:px-6 md:py-7 lg:grid-cols-[10rem_minmax(0,1fr)]",
          "border-t border-border",
          entry.icon && "rounded-md border-transparent bg-foreground/5 [&+li]:border-transparent",
        )}
      >
        <Text
          field={field(entry, "when")}
          as="p"
          value={entry.when}
          className="text-lead font-heading text-muted-foreground tabular-nums"
        />
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-3">
            {entry.icon && <Icon name={entry.icon} className="size-5 shrink-0 text-primary" />}
            <Text
              field={field(entry, "title")}
              as="h3"
              value={entry.title}
              className="text-heading"
            />
          </div>
          <Byline entry={entry} />
          <Detail entry={entry} className="max-w-2xl" />
        </div>
      </li>
    ))}
  </ol>
);

/*
 * Milestones down a line: on a phone the line runs down the start with each
 * date above its title; from a tablet up, the dates sit in a column before
 * the line.
 */
const Vertical = ({ timeline }: { readonly timeline: Timeline }) => (
  <ol className="max-w-4xl">
    {timeline.entries.map((entry) => (
      <li
        key={entry.id}
        className="group/entry grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-5 md:grid-cols-[8rem_2.25rem_minmax(0,1fr)] md:gap-x-8 lg:grid-cols-[10rem_2.25rem_minmax(0,1fr)]"
      >
        <div
          aria-hidden
          className="relative col-start-1 row-span-2 row-start-1 flex justify-center md:col-start-2"
        >
          <span className="absolute top-3 -bottom-3 w-px bg-foreground/15 group-last/entry:hidden" />
          <Marker entry={entry} />
        </div>
        <Text
          field={field(entry, "when")}
          as="p"
          value={entry.when}
          className="text-small md:font-heading md:text-lead col-start-2 row-start-1 pt-2 font-medium text-primary md:col-start-1 md:pt-1 md:text-end md:font-normal md:text-muted-foreground"
        />
        <div className="col-start-2 row-start-2 flex flex-col items-start gap-2 pt-1 pb-12 group-last/entry:pb-0 md:col-start-3 md:row-span-2 md:row-start-1">
          <Text
            field={field(entry, "title")}
            as="h3"
            value={entry.title}
            className="text-heading"
          />
          <Byline entry={entry} />
          <Detail entry={entry} />
        </div>
      </li>
    ))}
  </ol>
);

/*
 * Milestones across the page, joined by a line, scrolling sideways when
 * there are more than fit.
 */
const Horizontal = ({ timeline }: { readonly timeline: Timeline }) => (
  <ol className="flex snap-x snap-mandatory [scrollbar-width:thin] overflow-x-auto pb-4">
    {timeline.entries.map((entry) => (
      <li
        key={entry.id}
        className="group/entry flex w-4/5 shrink-0 snap-start flex-col items-start gap-5 sm:w-2/5 md:w-auto md:min-w-56 md:flex-1 md:basis-0"
      >
        <div aria-hidden className="relative flex h-9 w-full items-center">
          <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/15 group-last/entry:hidden" />
          <Marker entry={entry} />
        </div>
        <div className="flex flex-col items-start gap-2 pe-8">
          <Text
            field={field(entry, "when")}
            as="p"
            value={entry.when}
            className="text-small font-medium text-primary"
          />
          <Text
            field={field(entry, "title")}
            as="h3"
            value={entry.title}
            className="text-heading"
          />
          <Byline entry={entry} />
          <Detail entry={entry} />
        </div>
      </li>
    ))}
  </ol>
);

const layouts = {
  agenda: Agenda,
  vertical: Vertical,
  horizontal: Horizontal,
} as const satisfies Record<Variant, ComponentType<{ readonly timeline: Timeline }>>;

const TimelineSection = ({
  props: timeline,
  variant,
}: BlockComponentProps<typeof props, Variant>) => {
  const Layout = layouts[variant];
  return (
    <Section>
      <div
        className={cx(
          "page-width flex flex-col gap-14 md:gap-16",
          variant === "agenda" && "max-w-5xl",
        )}
      >
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <Intro content={timeline} />
          <Actions actions={timeline.actions} others="link" className="md:shrink-0" />
        </div>
        <Layout timeline={timeline} />
      </div>
    </Section>
  );
};

export default defineBlock({
  type: "timeline",
  version: 2,
  title: "Timeline",
  placement: "section",
  props,
  variants: ["agenda", "vertical", "horizontal"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "Things in order: a day's schedule with times, speakers and rooms (agenda), or the days of a week, the stages of a process or a history (vertical or horizontal). An icon on an entry sets it apart as a break",
    avoid: [
      "points with no order, which belong in a feature grid",
      "separate events on different dates, which belong in event cards",
      "more than six entries across the page; use the vertical line instead",
    ],
  },
  placeholder,
  component: TimelineSection,
});

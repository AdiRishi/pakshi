import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Text, useEditing } from "../../components.tsx";
import { choice, list, optional, text } from "../../fields.ts";
import { Intro } from "../../kit/intro.tsx";
import { NumberTicker } from "../../kit/magic/number-ticker.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: optional(text({ title: "Heading", min: 3, max: 90 })),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  stats: list({
    title: "Figures",
    item: {
      value: text({ title: "Figure", max: 12 }),
      label: text({ title: "Label", max: 80 }),
      detail: optional(text({ title: "Detail", max: 120 })),
    },
    min: 2,
    max: 6,
  }),
  align: choice({ title: "Heading alignment", options: ["start", "center"] }),
  background: choice({ title: "Background", options: ["full", "inset"] }),
};

type Variant = "row" | "cards" | "split";
type Stats = BlockComponentProps<typeof props, Variant>["props"];
type Stat = Stats["stats"][number];

/**
 * Columns on a large screen, indexed by how many figures there are, so a row
 * never leaves one alone.
 */
const columns = [
  undefined,
  undefined,
  "lg:grid-cols-2",
  "lg:grid-cols-3",
  "lg:grid-cols-4",
  "lg:grid-cols-5",
  "lg:grid-cols-3",
] as const;

/**
 * One figure: the number set large in the heading font, what it counts under
 * it, and a line of detail. The number comes first on screen; in the markup
 * the label is the term it defines. On a site the number counts up to itself
 * as it scrolls into view; in the editor it's text to edit.
 */
const Figure = ({
  stat,
  size,
  className,
}: {
  readonly stat: Stat;
  readonly size: "display" | "title";
  readonly className: string;
}) => {
  const editing = useEditing();
  const figure = cx(
    "block font-heading heading-weight leading-none tabular-nums",
    size === "display" ? "text-display" : "text-title",
  );
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <dt className="text-body font-medium text-foreground">
        <Text field={["stats", stat.id, "label"]} as="span" value={stat.label} />
      </dt>
      <dd className="order-first mb-3">
        {editing ? (
          <Text
            field={["stats", stat.id, "value"]}
            as="span"
            value={stat.value}
            className={figure}
          />
        ) : (
          <NumberTicker text={stat.value} className={figure} />
        )}
      </dd>
      {stat.detail && (
        <dd className="text-small max-w-xs text-muted-foreground">
          <Text field={["stats", stat.id, "detail"]} as="span" value={stat.detail} />
        </dd>
      )}
    </div>
  );
};

const StatsBlock = ({ props: stats, variant }: BlockComponentProps<typeof props, Variant>) => {
  const center = stats.align === "center";
  const intro =
    stats.heading === undefined ? null : (
      <Intro
        content={{ ...stats, heading: stats.heading }}
        align={variant === "split" ? "start" : stats.align}
      />
    );
  switch (variant) {
    case "row":
      return (
        <Section background={stats.background}>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {intro}
            <dl
              className={cx(
                "grid grid-cols-2 gap-y-12",
                columns[stats.stats.length],
                center ? "lg:divide-x lg:divide-foreground/15" : "gap-x-6",
              )}
            >
              {stats.stats.map((stat) => (
                <Figure
                  key={stat.id}
                  stat={stat}
                  size="display"
                  className={
                    center
                      ? "items-center px-4 text-center"
                      : "border-s border-foreground/15 ps-5 md:ps-7"
                  }
                />
              ))}
            </dl>
          </div>
        </Section>
      );
    case "cards":
      return (
        <Section background={stats.background}>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {intro}
            <dl className={cx("grid gap-4 sm:grid-cols-2", columns[stats.stats.length])}>
              {stats.stats.map((stat) => (
                <Figure
                  key={stat.id}
                  stat={stat}
                  size="display"
                  className="card justify-end p-6 md:min-h-56 md:p-8"
                />
              ))}
            </dl>
          </div>
        </Section>
      );
    case "split":
      return (
        <Section background={stats.background}>
          <div className="page-width grid gap-14 lg:grid-cols-2 lg:gap-20">
            {intro}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-12 sm:gap-x-10 [&>:last-child:nth-child(odd)]:col-span-2">
              {stats.stats.map((stat) => (
                <Figure
                  key={stat.id}
                  stat={stat}
                  size="title"
                  className="border-t border-foreground/15 pt-6"
                />
              ))}
            </dl>
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "stats",
  version: 2,
  title: "Stats",
  placement: "section",
  props,
  variants: ["row", "cards", "split"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "Two to six headline figures, such as how many took part or how many would come back, each with a short label and an optional line of detail",
    avoid: [
      "figures the site's owner hasn't given",
      "a figure that needs a sentence to explain, which belongs in text",
      "figures longer than a few characters, such as dates or phrases",
    ],
  },
  placeholder,
  component: StatsBlock,
});

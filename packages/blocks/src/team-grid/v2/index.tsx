import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Slot } from "../../components.tsx";
import { choice, cta, list, optional, text } from "../../fields.ts";
import { Actions } from "../../kit/actions.tsx";
import { Intro } from "../../kit/intro.tsx";
import { scrollerClass } from "../../kit/scroller.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  columns: choice({ title: "Columns", options: ["4", "3"] }),
  align: choice({ title: "Heading alignment", options: ["start", "center"] }),
};

type Variant = "grid" | "list" | "overlay";
type Team = BlockComponentProps<typeof props, Variant>["props"];

const gridColumns = {
  "4": "lg:grid-cols-4",
  "3": "lg:grid-cols-3",
} as const satisfies Record<Team["columns"], string>;

/*
 * The people are blocks of their own. The section marks its layout with
 * `data-team`, and each person sets itself out for it.
 */
const people = {
  grid: (team: Team) =>
    cx(
      "page-width fill-row grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-14",
      gridColumns[team.columns],
    ),
  list: () => "page-width max-w-5xl border-b border-border",
  overlay: (team: Team) =>
    cx(
      scrollerClass,
      "[&>li]:w-4/5 [&>li]:shrink-0 [&>li]:snap-start sm:[&>li]:w-2/5",
      "md:page-width md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 md:[&>li]:w-auto",
      gridColumns[team.columns],
    ),
} as const satisfies Record<Variant, (team: Team) => string>;

const TeamGrid = ({ props: team, variant }: BlockComponentProps<typeof props, Variant>) => {
  const center = variant !== "list" && team.align === "center";
  return (
    <Section>
      <div data-team={variant} className="flex flex-col gap-14 md:gap-16">
        <div
          className={cx(
            "page-width flex flex-col gap-8",
            !center && "md:flex-row md:items-end md:justify-between",
            variant === "list" && "max-w-5xl",
          )}
        >
          <Intro content={team} align={center ? "center" : "start"}>
            {center && <Actions actions={team.actions} align="center" others="link" />}
          </Intro>
          {!center && <Actions actions={team.actions} others="link" className="md:shrink-0" />}
        </div>
        <Slot name="people" as="ul" className={people[variant](team)} />
      </div>
    </Section>
  );
};

export default defineBlock({
  type: "team-grid",
  version: 2,
  title: "Team grid",
  placement: "section",
  props,
  variants: ["grid", "list", "overlay"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: { people: { title: "People", accepts: ["team-member"] } },
  interactive: false,
  agent: {
    purpose:
      "The people behind something, such as staff, mentors, speakers or a board, each with a photo, their role and perhaps a sentence about them",
    avoid: [
      "a single person, who belongs in a split",
      "biographies longer than two sentences",
      "photos of anyone other than the person named",
    ],
  },
  placeholder,
  component: TeamGrid,
});

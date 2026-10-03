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
  columns: choice({ title: "Columns", options: ["3", "2", "4"] }),
  align: choice({ title: "Heading alignment", options: ["start", "center"] }),
  style: choice({ title: "Feature style", options: ["plain", "cards", "lines"] }),
  background: choice({ title: "Background", options: ["full", "inset"] }),
};

type Variant = "grid" | "split" | "list";
type Features = BlockComponentProps<typeof props, Variant>["props"];

const columns = {
  "2": "sm:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3 fill-row-3",
  "4": "sm:grid-cols-2 lg:grid-cols-4 fill-row-4",
} as const satisfies Record<Features["columns"], string>;

/*
 * The features are blocks of their own, so the grid sets how each one sits
 * in it: on the page, on a card, or under a line.
 */
const styles = {
  plain: "gap-x-10 gap-y-14",
  cards: "gap-4 [&>li]:card [&>li]:p-7",
  lines: "gap-x-10 gap-y-12 [&>li]:border-t [&>li]:border-border [&>li]:pt-7",
} as const satisfies Record<Features["style"], string>;

const FeatureGrid = ({ props: grid, variant }: BlockComponentProps<typeof props, Variant>) => {
  const intro = (
    <Intro content={grid} align={variant === "split" ? "start" : grid.align}>
      <Actions
        actions={grid.actions}
        align={variant !== "split" && grid.align === "center" ? "center" : "start"}
        others="link"
        className="mt-2"
      />
    </Intro>
  );
  switch (variant) {
    case "grid":
      return (
        <Section background={grid.background}>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {intro}
            <Slot
              name="items"
              as="ul"
              className={cx("grid", columns[grid.columns], styles[grid.style])}
            />
          </div>
        </Section>
      );
    case "split":
      return (
        <Section background={grid.background}>
          <div className="page-width grid gap-14 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-20">
            <div className="lg:sticky lg:top-24 lg:self-start">{intro}</div>
            <Slot name="items" as="ul" className={cx("grid sm:grid-cols-2", styles[grid.style])} />
          </div>
        </Section>
      );
    case "list":
      return (
        <Section background={grid.background}>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {intro}
            <Slot
              name="items"
              as="ul"
              className={cx(
                "grid [&>li]:flex-row [&>li]:items-start [&>li]:gap-5",
                columns[grid.columns],
                styles[grid.style],
              )}
            />
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "feature-grid",
  version: 2,
  title: "Feature grid",
  placement: "section",
  props,
  variants: ["grid", "split", "list"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: { items: { title: "Features", accepts: ["feature-item"] } },
  agent: {
    purpose:
      "Several parallel points, such as what's included or why to come, each with a short title, a sentence or two and an optional icon",
    avoid: [
      "a single item",
      "items that need more than two sentences",
      "numbering items that aren't steps",
    ],
  },
  placeholder,
  component: FeatureGrid,
});

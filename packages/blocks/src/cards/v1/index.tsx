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
  crop: choice({ title: "Image proportions", options: ["landscape", "square", "portrait"] }),
  rows: choice({ title: "Row style", options: ["lines", "tiles"] }),
};

type Variant = "grid" | "overlay" | "list" | "tiles";
type Cards = BlockComponentProps<typeof props, Variant>["props"];

const columns = {
  "2": "sm:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "sm:grid-cols-2 lg:grid-cols-4",
} as const satisfies Record<Cards["columns"], string>;

const gaps = {
  grid: "gap-x-6 gap-y-12",
  overlay: "gap-4",
  list: "",
  tiles: "gap-4",
} as const satisfies Record<Variant, string>;

/*
 * The cards are blocks of their own, which read the layout and its choices
 * from the data attributes around them. Rows set apart by lines run edge to
 * edge, with a line under the last row; tiles stand apart.
 */
const CardsBlock = ({ props: section, variant }: BlockComponentProps<typeof props, Variant>) => {
  const rows = variant === "list" ? section.rows : undefined;
  return (
    <Section>
      <div className="page-width flex flex-col gap-14 md:gap-16">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10">
          <Intro content={section} />
          <Actions actions={section.actions} others="link" className="shrink-0" />
        </div>
        <div
          data-cards={variant}
          data-crop={variant === "list" ? undefined : section.crop}
          data-rows={rows}
        >
          <Slot
            name="cards"
            as="ul"
            className={cx(
              "grid",
              columns[section.columns],
              rows === "lines" && "gap-x-10 border-b border-border",
              rows === "tiles" && "gap-4",
              // Four narrow pictures with a title on each still read two to a row on a phone,
              // and so do portraits, which one to a row would fill the screen.
              variant === "overlay" && section.columns === "4" && "grid-cols-2",
              variant === "grid" && section.crop === "portrait" && "grid-cols-2 max-sm:gap-x-4",
              gaps[variant],
            )}
          />
        </div>
      </div>
    </Section>
  );
};

export default defineBlock({
  type: "cards",
  version: 1,
  title: "Cards",
  placement: "section",
  props,
  variants: ["grid", "overlay", "list", "tiles"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: { cards: { title: "Cards", accepts: ["card"] } },
  interactive: false,
  agent: {
    purpose:
      "Ways into other pages of the site, such as plan your visit, what's on or how to apply: each card a short title, a line of text and a picture or icon, and the whole card links on",
    avoid: [
      "points that don't lead anywhere, which belong in a feature grid",
      "blog posts, which belong in a blog list",
      "a single card",
    ],
  },
  placeholder,
  component: CardsBlock,
});

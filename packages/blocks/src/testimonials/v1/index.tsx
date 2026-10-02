import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock, useBlockFrame } from "../../block.tsx";
import { FieldEditingProvider, Slot } from "../../components.tsx";
import { choice, cta, list, optional, text } from "../../fields.ts";
import { Actions } from "../../kit/actions.tsx";
import { Intro } from "../../kit/intro.tsx";
import { Marquee } from "../../kit/marquee.tsx";
import { scrollerClass } from "../../kit/scroller.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  columns: choice({ title: "Columns", options: ["3", "2", "4"] }),
  style: choice({ title: "Testimonial style", options: ["cards", "plain"] }),
  align: choice({ title: "Heading alignment", options: ["start", "center"] }),
};

type Variant = "grid" | "masonry" | "scroller" | "marquee";
type Testimonials = BlockComponentProps<typeof props, Variant>["props"];

const gridColumns = {
  "2": "sm:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "sm:grid-cols-2 lg:grid-cols-4",
} as const satisfies Record<Testimonials["columns"], string>;

const masonryColumns = {
  "2": "sm:columns-2",
  "3": "sm:columns-2 lg:columns-3",
  "4": "sm:columns-2 lg:columns-4",
} as const satisfies Record<Testimonials["columns"], string>;

/** How wide each card in the scrolling row is, by how many show at once on a large screen. */
const scrollerWidths = {
  "2": "[&>li]:w-5/6 sm:[&>li]:w-3/5 md:[&>li]:w-5/11",
  "3": "[&>li]:w-5/6 sm:[&>li]:w-5/11 lg:[&>li]:w-3/10",
  "4": "[&>li]:w-5/6 sm:[&>li]:w-2/5 lg:[&>li]:w-2/9",
} as const satisfies Record<Testimonials["columns"], string>;

/*
 * The testimonials are blocks of their own, so the section sets how each one
 * sits: on a card, or plainly under a line.
 */
const styles = {
  cards: "[&>li]:card [&>li]:p-7",
  plain: "[&>li]:border-t [&>li]:border-border [&>li]:pt-7",
} as const satisfies Record<Testimonials["style"], string>;

/*
 * Testimonials in the looping row have a fixed width, so the row's length
 * doesn't depend on the words, and room above and below for a raised card's
 * shadow, which the row would otherwise cut off.
 */
const marqueeRow = "flex gap-4 py-4 pe-4 [&>li]:w-80 [&>li]:shrink-0 sm:[&>li]:w-96";

/** The testimonials drawn again for the marquee's loop, as plain markup nobody edits. */
const Copies = ({ className }: { readonly className: string }) => {
  const { slots } = useBlockFrame();
  return (
    <FieldEditingProvider value={null}>
      <ul className={className}>{slots["items"]}</ul>
    </FieldEditingProvider>
  );
};

const TestimonialsBlock = ({
  props: section,
  variant,
}: BlockComponentProps<typeof props, Variant>) => {
  const intro = (
    <Intro content={section} align={section.align}>
      <Actions actions={section.actions} align={section.align} others="link" className="mt-2" />
    </Intro>
  );
  switch (variant) {
    case "grid":
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {intro}
            <Slot
              name="items"
              as="ul"
              className={cx(
                "grid",
                gridColumns[section.columns],
                section.style === "cards" ? "gap-4" : "gap-x-10 gap-y-12",
                styles[section.style],
              )}
            />
          </div>
        </Section>
      );
    case "masonry":
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {intro}
            <Slot
              name="items"
              as="ul"
              className={cx(
                "[&>li]:break-inside-avoid",
                masonryColumns[section.columns],
                section.style === "cards" ? "gap-4 [&>li]:mb-4" : "gap-10 [&>li]:mb-10",
                styles[section.style],
              )}
            />
          </div>
        </Section>
      );
    case "scroller":
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {intro}
            <Slot
              name="items"
              as="ul"
              className={cx(
                scrollerClass,
                "-mx-gutter [&>li]:shrink-0 [&>li]:snap-start",
                scrollerWidths[section.columns],
                styles[section.style],
              )}
            />
          </div>
        </Section>
      );
    case "marquee": {
      const row = cx(marqueeRow, styles[section.style]);
      return (
        <Section>
          <div className="flex flex-col gap-10 md:gap-12">
            <div className="page-width">{intro}</div>
            <Marquee
              items={<Slot name="items" as="ul" className={row} />}
              copies={<Copies className={row} />}
            />
          </div>
        </Section>
      );
    }
  }
};

export default defineBlock({
  type: "testimonials",
  version: 1,
  title: "Testimonials",
  placement: "section",
  props,
  variants: ["grid", "masonry", "scroller", "marquee"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: { items: { title: "Testimonials", accepts: ["testimonial"] } },
  interactive: false,
  agent: {
    purpose:
      "What several people say about you, each in their own words with their name: three or more students, parents or partners. The masonry layout suits a wall of quotes of different lengths, the marquee a long run of short ones",
    avoid: [
      "a single quote, which belongs in a quote block",
      "words or names nobody gave you",
      "the marquee for fewer than five testimonials",
    ],
  },
  placeholder,
  component: TestimonialsBlock,
});

import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock, useBlockFrame } from "../../block.tsx";
import { FieldEditingProvider, Slot } from "../../components.tsx";
import { choice, cta, list, optional, text } from "../../fields.ts";
import { Actions } from "../../kit/actions.tsx";
import { Intro } from "../../kit/intro.tsx";
import { Marquee } from "../../kit/magic/marquee.tsx";
import { Section } from "../../kit/section.tsx";
import {
  Carousel,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "../../kit/ui/carousel.tsx";
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
  "3": "sm:grid-cols-2 lg:grid-cols-3 fill-row-3",
  "4": "sm:grid-cols-2 lg:grid-cols-4 fill-row-4",
} as const satisfies Record<Testimonials["columns"], string>;

const masonryColumns = {
  "2": "sm:columns-2",
  "3": "sm:columns-2 lg:columns-3",
  "4": "sm:columns-2 lg:columns-4",
} as const satisfies Record<Testimonials["columns"], string>;

/**
 * How many testimonials the carousel shows at once, by screen size; a
 * fraction lets the next one peek in. Each takes its share of the row, less
 * the gaps.
 */
const perView = {
  "2": "[--per-view:1.15] md:[--per-view:2]",
  "3": "[--per-view:1.15] sm:[--per-view:2] lg:[--per-view:3]",
  "4": "[--per-view:1.15] sm:[--per-view:2] lg:[--per-view:4]",
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
const marqueeRow = "flex gap-4 py-4 [&>li]:w-80 [&>li]:shrink-0 sm:[&>li]:w-96";

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
    case "scroller": {
      const center = section.align === "center";
      const buttons = (
        <div className="flex shrink-0 gap-3 empty:hidden">
          <CarouselPrevious label="Previous testimonials" />
          <CarouselNext label="Next testimonials" />
        </div>
      );
      return (
        <Section>
          <Carousel label={section.heading} className="page-width flex flex-col gap-14 md:gap-16">
            <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              {intro}
              {!center && buttons}
            </div>
            <div className="flex flex-col items-center gap-8">
              <CarouselViewport className="-my-4 w-full">
                <Slot
                  name="items"
                  as="ul"
                  className={cx(
                    "flex gap-(--gap) py-4 [--gap:--spacing(4)] md:[--gap:--spacing(6)] [&>li]:min-w-0 [&>li]:shrink-0 [&>li]:grow-0",
                    "[&>li]:basis-[calc((100%_-_(var(--per-view)_-_1)_*_var(--gap))_/_var(--per-view))]",
                    perView[section.columns],
                    styles[section.style],
                  )}
                />
              </CarouselViewport>
              {center && buttons}
            </div>
          </Carousel>
        </Section>
      );
    }
    case "marquee": {
      const row = cx(marqueeRow, styles[section.style]);
      return (
        <Section>
          <div className="flex flex-col gap-10 md:gap-12">
            <div className="page-width">{intro}</div>
            <Marquee
              className="mask-x-from-90% [--gap:--spacing(4)]"
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
  interactive: true,
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

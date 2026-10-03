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
  align: choice({ title: "Heading alignment", options: ["start", "center"] }),
  background: choice({ title: "Background", options: ["full", "inset"] }),
};

type Variant = "grid" | "showcase";

/*
 * The tiles are blocks of their own and each says how much of the grid it
 * takes. Rows share one height, so a tall tile lines up with the two beside
 * it, and dense packing lets a small tile fill a gap a big one leaves.
 */
const grids = {
  grid: "md:grid-cols-2 lg:grid-cols-3",
  showcase: "md:grid-cols-2 lg:[&>li]:min-h-96",
} as const satisfies Record<Variant, string>;

const Bento = ({ props: bento, variant }: BlockComponentProps<typeof props, Variant>) => (
  <Section background={bento.background}>
    <div className="page-width flex flex-col gap-14 md:gap-16">
      <Intro content={bento} align={bento.align}>
        <Actions actions={bento.actions} align={bento.align} others="link" className="mt-2" />
      </Intro>
      <Slot
        name="tiles"
        as="ul"
        className={cx("grid grid-flow-row-dense gap-4 md:auto-rows-fr", grids[variant])}
      />
    </div>
  </Section>
);

export default defineBlock({
  type: "bento",
  version: 1,
  title: "Bento grid",
  placement: "section",
  props,
  variants: ["grid", "showcase"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: { tiles: { title: "Tiles", accepts: ["bento-tile"] } },
  agent: {
    purpose:
      "A showcase of four to seven things worth seeing, such as what a week holds, as tiles of different sizes and colors, each a short title with a picture or icon",
    avoid: [
      "fewer than four tiles",
      "tiles that need more than a sentence or two",
      "plain lists of parallel points, which belong in features",
    ],
  },
  placeholder,
  component: Bento,
});

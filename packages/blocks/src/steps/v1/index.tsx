import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Text } from "../../components.tsx";
import { choice, cta, icon, list, optional, text } from "../../fields.ts";
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
  steps: list({
    title: "Steps",
    item: {
      title: text({ title: "Title", max: 60 }),
      text: text({ title: "Text", max: 240, multiline: true }),
      icon: optional(icon({ title: "Icon" })),
    },
    min: 2,
    max: 6,
  }),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  align: choice({ title: "Heading alignment", options: ["start", "center"] }),
};

type Variant = "row" | "list" | "cards";
type Steps = BlockComponentProps<typeof props, Variant>["props"];
type Step = Steps["steps"][number];

const counts = [2, 3, 4, 5, 6] as const;

/*
 * Steps sit in one row once there's room for all of them, and only then does
 * a line run from each number to the next.
 */
const rowLayouts = {
  2: { grid: "md:grid-cols-2", line: "md:block" },
  3: { grid: "md:grid-cols-3", line: "md:block" },
  4: { grid: "sm:grid-cols-2 lg:grid-cols-4", line: "lg:block" },
  5: { grid: "sm:grid-cols-2 lg:grid-cols-5", line: "lg:block" },
  6: { grid: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6", line: "xl:block" },
} as const;

const cardLayouts = {
  2: "sm:grid-cols-2",
  3: "md:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-3",
  6: "sm:grid-cols-2 lg:grid-cols-3",
} as const;

/** The layout for this many steps; a draft with fewer than two lays out as two. */
const layoutFor = <Layouts extends Record<(typeof counts)[number], unknown>>(
  layouts: Layouts,
  count: number,
): Layouts[(typeof counts)[number]] => layouts[counts.findLast((size) => size <= count) ?? 2];

/** A step's number in a ring, which the ordered list already announces. */
const Marker = ({ number, className }: { readonly number: number; readonly className: string }) => (
  <span
    aria-hidden
    className={cx(
      "flex shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-background font-heading text-primary tabular-nums",
      className,
    )}
  >
    {number}
  </span>
);

const StepWords = ({ step, className }: { readonly step: Step; readonly className?: string }) => (
  <div className={cx("flex flex-col gap-2", className)}>
    <div className="flex items-center gap-2.5">
      {step.icon && <Icon name={step.icon} className="size-5 shrink-0 text-primary" />}
      <Text
        field={["steps", step.id, "title"]}
        as="h3"
        value={step.title}
        className="text-heading"
      />
    </div>
    <Text
      field={["steps", step.id, "text"]}
      as="p"
      value={step.text}
      className="text-body max-w-md whitespace-pre-line text-muted-foreground"
    />
  </div>
);

const StepsBlock = ({ props: steps, variant }: BlockComponentProps<typeof props, Variant>) => {
  const count = steps.steps.length;
  const intro = (align: Steps["align"]) => (
    <Intro content={steps} align={align}>
      <Actions actions={steps.actions} align={align} others="link" className="mt-2" />
    </Intro>
  );
  switch (variant) {
    case "row": {
      const layout = layoutFor(rowLayouts, count);
      const center = steps.align === "center";
      const rail = (shown: boolean, className: string) => (
        <span
          className={cx(
            "hidden h-px flex-1 bg-border",
            layout.line,
            !shown && "invisible",
            className,
          )}
        />
      );
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {intro(steps.align)}
            <ol className={cx("grid gap-y-12", layout.grid)}>
              {steps.steps.map((step, index) => (
                <li
                  key={step.id}
                  className={cx("flex flex-col gap-6", center && "items-center text-center")}
                >
                  <div
                    aria-hidden
                    className={cx("flex w-full items-center", center && "justify-center")}
                  >
                    {center && rail(index > 0, "me-4")}
                    <Marker number={index + 1} className="text-lead size-10" />
                    {rail(index < count - 1, center ? "ms-4" : "mx-4")}
                  </div>
                  <StepWords step={step} className={center ? "items-center px-5" : "pe-10"} />
                </li>
              ))}
            </ol>
          </div>
        </Section>
      );
    }
    case "list":
      return (
        <Section>
          <div className="page-width grid gap-14 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-20">
            <div className="lg:sticky lg:top-24 lg:self-start">{intro("start")}</div>
            <ol>
              {steps.steps.map((step, index) => (
                <li
                  key={step.id}
                  className="relative flex gap-6 pb-12 after:absolute after:top-16 after:bottom-2 after:left-7 after:w-px after:bg-border last:pb-0 last:after:hidden md:gap-10"
                >
                  <Marker number={index + 1} className="text-heading size-14" />
                  <StepWords step={step} className="pt-3" />
                </li>
              ))}
            </ol>
          </div>
        </Section>
      );
    case "cards":
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {intro(steps.align)}
            <ol className={cx("grid gap-4", layoutFor(cardLayouts, count))}>
              {steps.steps.map((step, index) => (
                <li key={step.id} className="card flex flex-col gap-12 p-7 md:p-8">
                  <span aria-hidden className="font-heading text-title text-primary tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <StepWords step={step} className="mt-auto" />
                </li>
              ))}
            </ol>
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "steps",
  version: 1,
  title: "Steps",
  placement: "section",
  props,
  variants: ["row", "list", "cards"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "How something works or how to take part, as two to six numbered steps in order, such as applying, booking or what happens on the day, each a short title and a sentence or two",
    avoid: [
      "points with no order, which belong in a feature grid",
      "a schedule with times or dates, which belongs in a timeline",
      "more than six steps",
    ],
  },
  placeholder,
  component: StepsBlock,
});

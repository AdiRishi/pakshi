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

/** A step's number on a disc, which the ordered list already announces. */
const Marker = ({ number, className }: { readonly number: number; readonly className: string }) => (
  <span
    aria-hidden
    className={cx(
      "relative flex shrink-0 items-center justify-center rounded-full bg-primary font-heading text-primary-foreground tabular-nums shadow-card ring-6 ring-background",
      className,
    )}
  >
    {number}
  </span>
);

const StepWords = ({
  step,
  icon,
  className,
}: {
  readonly step: Step;
  readonly icon: boolean;
  readonly className?: string;
}) => (
  <div className={cx("flex flex-col gap-2.5", className)}>
    <div className="flex items-center gap-2.5">
      {icon && step.icon && <Icon name={step.icon} className="size-5 shrink-0 text-primary" />}
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
      /* The line brightens toward each number, so it reads as leading on to the next. */
      const rail = (shown: boolean, toward: "start" | "end", className: string) => (
        <span
          className={cx(
            "hidden h-px flex-1 from-primary/50 to-foreground/10",
            toward === "start" ? "bg-linear-to-r" : "bg-linear-to-l",
            layout.line,
            !shown && "invisible",
            className,
          )}
        />
      );
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-20">
            {intro(steps.align)}
            <ol className={cx("grid gap-y-12", layout.grid)}>
              {steps.steps.map((step, index) => (
                <li
                  key={step.id}
                  className={cx("flex flex-col gap-7", center && "items-center text-center")}
                >
                  <div
                    aria-hidden
                    className={cx("flex w-full items-center", center && "justify-center")}
                  >
                    {center && rail(index > 0, "end", "me-3")}
                    <Marker number={index + 1} className="text-lead size-11" />
                    {rail(index < count - 1, "start", center ? "ms-3" : "mx-3")}
                  </div>
                  <StepWords step={step} icon className={center ? "items-center px-5" : "pe-10"} />
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
          <div className="page-width grid gap-14 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-24">
            <div className="lg:sticky lg:top-24 lg:self-start">{intro("start")}</div>
            <ol>
              {steps.steps.map((step, index) => (
                <li
                  key={step.id}
                  className="relative flex gap-6 pb-14 after:absolute after:top-15 after:bottom-3 after:left-6 after:w-px after:bg-linear-to-b after:from-primary/50 after:to-foreground/10 last:pb-0 last:after:hidden md:gap-10"
                >
                  <Marker number={index + 1} className="text-lead size-12" />
                  <StepWords step={step} icon className="pt-2.5" />
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
            <ol className={cx("grid gap-4 md:gap-5", layoutFor(cardLayouts, count))}>
              {steps.steps.map((step, index) => (
                <li
                  key={step.id}
                  className="card relative isolate flex flex-col gap-14 overflow-hidden p-7 md:p-8"
                >
                  <div aria-hidden className="flex items-start justify-between gap-4">
                    <span className="font-heading text-display bg-linear-to-b from-primary to-primary/35 bg-clip-text leading-none text-transparent tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {step.icon && (
                      <span className="flex size-11 items-center justify-center rounded-md border border-foreground/10 bg-foreground/5 text-primary">
                        <Icon name={step.icon} className="size-5" />
                      </span>
                    )}
                  </div>
                  <StepWords step={step} icon={false} className="mt-auto" />
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

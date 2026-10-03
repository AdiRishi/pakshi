import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { FormView, Text } from "../../components.tsx";
import { choice, form, list, optional, text } from "../../fields.ts";
import { Icon } from "../../kit/icon.tsx";
import { Intro } from "../../kit/intro.tsx";
import { ShineBorder } from "../../kit/magic/shine-border.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  points: list({
    title: "Points",
    item: { point: text({ title: "Point", max: 80 }) },
    min: 0,
    max: 4,
  }),
  note: optional(text({ title: "Note", max: 160 })),
  form: form({ title: "Form" }),
  background: choice({ title: "Background", options: ["full", "inset"] }),
};

type Variant = "split" | "card" | "inline";
type FormSection = BlockComponentProps<typeof props, Variant>["props"];

const Points = ({ section }: { readonly section: FormSection }) =>
  section.points.length === 0 ? null : (
    <ul className="flex flex-col gap-4">
      {section.points.map((item) => (
        <li key={item.id} className="text-body flex items-start gap-3.5">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <Icon name="check" className="size-3.5" />
          </span>
          <Text field={["points", item.id, "point"]} as="span" value={item.point} />
        </li>
      ))}
    </ul>
  );

/** A line under the form or beside it, such as who to ask or how often emails come. */
const Note = ({
  section,
  className,
}: {
  readonly section: FormSection;
  readonly className?: string;
}) =>
  section.note ? (
    <Text
      field="note"
      as="p"
      value={section.note}
      className={cx("text-small text-pretty text-muted-foreground", className)}
    />
  ) : null;

/**
 * The form on a card, lit along its top edge by a fine line of the brand's
 * color, and with a soft glow of it behind when the card stands alone.
 */
const FormCard = ({
  glow,
  className,
  children,
}: {
  readonly glow: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) => (
  <div className={cx("relative", className)}>
    {glow && (
      <div
        aria-hidden
        className="absolute inset-x-4 inset-y-16 -z-10 rounded-full bg-primary/25 blur-3xl"
      />
    )}
    <div className="card relative overflow-hidden p-6 sm:p-8 md:p-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0">
        <div className="mx-auto h-px w-3/4 bg-linear-to-r from-transparent via-primary to-transparent" />
        <div className="mx-auto -mt-6 h-12 w-1/2 rounded-full bg-primary/15 blur-2xl" />
      </div>
      {children}
    </div>
  </div>
);

/**
 * A form from the site's forms, with a heading and what to expect beside
 * it, above it on a card, or in one row as a sign-up band.
 */
const FormSectionBlock = ({
  props: section,
  variant,
}: BlockComponentProps<typeof props, Variant>) => {
  switch (variant) {
    case "split":
      return (
        <Section background={section.background}>
          <div className="page-width grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
            <div className="flex flex-col gap-10 lg:sticky lg:top-24">
              <Intro content={section} />
              <Points section={section} />
              <Note section={section} className="border-t border-border pt-6" />
            </div>
            <FormCard glow={false}>
              <FormView field="form" value={section.form} />
            </FormCard>
          </div>
        </Section>
      );
    case "card":
      return (
        <Section background={section.background}>
          <div className="page-width flex flex-col items-center gap-12 md:gap-14">
            <Intro content={section} align="center" />
            <FormCard glow className="w-full max-w-2xl">
              <FormView field="form" value={section.form} />
            </FormCard>
            <Note section={section} className="max-w-xl text-center" />
          </div>
        </Section>
      );
    case "inline":
      return (
        <Section background={section.background}>
          {section.background === "inset" && <ShineBorder />}
          <div className="page-width grid items-end gap-10 lg:grid-cols-2 lg:gap-20">
            <Intro content={section} />
            <div className="flex flex-col gap-4">
              <FormView field="form" value={section.form} layout="inline" />
              <Note section={section} />
            </div>
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "form-section",
  version: 2,
  title: "Form",
  placement: "section",
  props,
  variants: ["split", "card", "inline"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "Collect a registration, an enquiry or a sign-up with one of the site's forms. The inline layout suits a newsletter sign-up with an email field or two",
    avoid: [
      "more than one form on a page",
      "the inline layout for a form with long answers or choices, which it can't show",
    ],
  },
  interactive: true,
  placeholder,
  component: FormSectionBlock,
});

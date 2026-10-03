import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { FormView, Text } from "../../components.tsx";
import { choice, form, list, optional, text } from "../../fields.ts";
import { Icon } from "../../kit/icon.tsx";
import { Intro } from "../../kit/intro.tsx";
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
    <ul className="flex flex-col gap-3">
      {section.points.map((item) => (
        <li key={item.id} className="text-body flex items-start gap-3">
          <Icon name="circle-check" className="mt-0.5 size-5 shrink-0 text-primary" />
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
      className={cx("text-small text-muted-foreground", className)}
    />
  ) : null;

const FormSectionBlock = ({
  props: section,
  variant,
}: BlockComponentProps<typeof props, Variant>) => {
  switch (variant) {
    case "split":
      return (
        <Section background={section.background}>
          <div className="page-width grid items-start gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-20">
            <div className="flex flex-col gap-10 lg:sticky lg:top-24">
              <Intro content={section} />
              <Points section={section} />
              <Note section={section} className="border-t border-border pt-6" />
            </div>
            <div className="card p-6 sm:p-8 md:p-10">
              <FormView field="form" value={section.form} className="flex flex-col gap-6" />
            </div>
          </div>
        </Section>
      );
    case "card":
      return (
        <Section background={section.background}>
          <div className="page-width flex flex-col items-center gap-12">
            <Intro content={section} align="center" />
            <div className="card w-full max-w-2xl p-6 sm:p-8 md:p-10">
              <FormView field="form" value={section.form} className="flex flex-col gap-6" />
            </div>
            <Note section={section} className="max-w-xl text-center" />
          </div>
        </Section>
      );
    case "inline":
      return (
        <Section background={section.background}>
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
  placeholder,
  component: FormSectionBlock,
});

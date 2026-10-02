import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { RichText, Text } from "../../components.tsx";
import { choice, cta, list, optional, richText, text } from "../../fields.ts";
import { Disclosure } from "../../kit/accordion.tsx";
import { Actions } from "../../kit/actions.tsx";
import { Intro } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 80 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
  questions: list({
    title: "Questions",
    item: {
      question: text({ title: "Question", min: 3, max: 160 }),
      answer: richText({ title: "Answer", marks: ["bold", "italic", "link"] }),
    },
    min: 1,
    max: 20,
  }),
  contact: optional(text({ title: "Contact line", max: 120 })),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  align: choice({ title: "Heading alignment", options: ["center", "start"] }),
};

type Variant = "accordion" | "split" | "columns";
type Faq = BlockComponentProps<typeof props, Variant>["props"];

const answerClass =
  "text-body max-w-2xl text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_p+*]:mt-4";

/** The questions, each opening to show its answer, with the first open. */
const Questions = ({ faq }: { readonly faq: Faq }) => (
  <ul className="border-y border-border [&>li+li]:border-t [&>li+li]:border-border">
    {faq.questions.map((item, index) => (
      <li key={item.id}>
        <Disclosure
          open={index === 0}
          summary={
            <Text
              field={["questions", item.id, "question"]}
              as="h3"
              value={item.question}
              className="text-lead text-balance"
            />
          }
        >
          <RichText
            field={["questions", item.id, "answer"]}
            value={item.answer}
            className={answerClass}
          />
        </Disclosure>
      </li>
    ))}
  </ul>
);

/** Where to go when the answer isn't here: a line and a button or two, on a quiet panel. */
const Contact = ({ faq, center }: { readonly faq: Faq; readonly center: boolean }) =>
  faq.contact === undefined && faq.actions.length === 0 ? null : (
    <div
      className={cx(
        "flex flex-col gap-5 rounded-lg bg-foreground/4 p-6 sm:flex-row sm:items-center sm:justify-between md:px-8",
        center && "items-center text-center sm:text-start",
      )}
    >
      {faq.contact && (
        <Text field="contact" as="p" value={faq.contact} className="text-body font-medium" />
      )}
      <Actions actions={faq.actions} others="link" className="shrink-0" />
    </div>
  );

const FaqBlock = ({ props: faq, variant }: BlockComponentProps<typeof props, Variant>) => {
  switch (variant) {
    case "accordion":
      return (
        <Section>
          <div className="page-width flex max-w-3xl flex-col gap-12 md:gap-14">
            <Intro content={faq} align={faq.align} />
            <div className="flex flex-col gap-10">
              <Questions faq={faq} />
              <Contact faq={faq} center={faq.align === "center"} />
            </div>
          </div>
        </Section>
      );
    case "split":
      // A section clips what overflows it so its backdrop stays inside; clipping
      // without making it a scroll container lets the intro stick to the window.
      return (
        <Section>
          <div className="page-width grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-20">
            <div className="flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start">
              <Intro content={faq} />
              {faq.contact && (
                <Text
                  field="contact"
                  as="p"
                  value={faq.contact}
                  className="text-body -mt-2 max-w-sm text-muted-foreground"
                />
              )}
              <Actions actions={faq.actions} others="link" />
            </div>
            <Questions faq={faq} />
          </div>
        </Section>
      );
    case "columns":
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            <Intro content={faq} align={faq.align} />
            <ul className="grid gap-x-16 gap-y-12 md:grid-cols-2">
              {faq.questions.map((item) => (
                <li key={item.id} className="flex flex-col gap-3 border-t border-border pt-6">
                  <Text
                    field={["questions", item.id, "question"]}
                    as="h3"
                    value={item.question}
                    className="text-lead text-balance"
                  />
                  <RichText
                    field={["questions", item.id, "answer"]}
                    value={item.answer}
                    className={answerClass}
                  />
                </li>
              ))}
            </ul>
            <Contact faq={faq} center={faq.align === "center"} />
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "faq",
  version: 2,
  title: "FAQ",
  placement: "section",
  props,
  variants: ["accordion", "split", "columns"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "Questions visitors ask, each with a short, direct answer, and where to ask anything else. The accordion suits many questions; columns suit a few that everyone should read",
    avoid: [
      "answers longer than a short paragraph, which belong in rich text",
      "questions nobody would ask",
      "columns for more than eight questions",
    ],
  },
  placeholder,
  component: FaqBlock,
});

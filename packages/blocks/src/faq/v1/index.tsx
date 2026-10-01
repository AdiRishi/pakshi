import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { RichText, Root, Text } from "../../components.tsx";
import { list, optional, richText, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
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
};

const Faq = ({
  props: faq,
  variant,
}: BlockComponentProps<typeof props, "list" | "two-columns">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div
      className={
        variant === "list"
          ? "mx-auto flex max-w-3xl flex-col gap-10"
          : "mx-auto flex max-w-6xl flex-col gap-12"
      }
    >
      <div className="flex max-w-2xl flex-col gap-4">
        <Text field="heading" as="h2" value={faq.heading} className="text-title text-balance" />
        {faq.intro && (
          <Text
            field="intro"
            as="p"
            value={faq.intro}
            className="text-lead whitespace-pre-line text-muted-foreground"
          />
        )}
      </div>
      <ul
        className={
          variant === "list"
            ? "flex flex-col divide-y divide-border border-y border-border"
            : "grid gap-x-12 gap-y-10 md:grid-cols-2"
        }
      >
        {faq.questions.map((item) => (
          <li
            key={item.id}
            className={variant === "list" ? "flex flex-col gap-3 py-6" : "flex flex-col gap-3"}
          >
            <Text
              field={["questions", item.id, "question"]}
              as="h3"
              value={item.question}
              className="text-heading text-balance"
            />
            <RichText
              field={["questions", item.id, "answer"]}
              value={item.answer}
              className="text-body text-muted-foreground [&_a]:text-primary [&_a]:underline [&_p+*]:mt-4"
            />
          </li>
        ))}
      </ul>
    </div>
  </Root>
);

export default defineBlock({
  type: "faq",
  version: 1,
  title: "FAQ",
  placement: "section",
  props,
  variants: ["list", "two-columns"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "Questions visitors ask, each with a short, direct answer",
    avoid: [
      "answers longer than a short paragraph, which belong in rich text",
      "questions nobody would ask",
    ],
  },
  placeholder,
  component: Faq,
});

import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Text } from "../../components.tsx";
import { choice, cta, optional, text } from "../../fields.ts";
import { buttonClass } from "../../kit/button.ts";
import { Heading } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the statement", max: 40 })),
  heading: text({ title: "First sentence", min: 3, max: 160 }),
  headingRest: optional(text({ title: "The rest", max: 400 })),
  name: optional(text({ title: "Name", max: 60 })),
  role: optional(text({ title: "Role", max: 80 })),
  link: optional(cta({ title: "Link" })),
  size: choice({ title: "Size", options: ["large", "huge"] }),
};

type Variant = "start" | "center";

/**
 * A position or mission stated in a paragraph set as large as a heading: the
 * first sentence at full strength and the rest softer, so it reads as one
 * thought that lands, then explains.
 */
const Statement = ({ props: statement, variant }: BlockComponentProps<typeof props, Variant>) => {
  const center = variant === "center";
  const huge = statement.size === "huge";
  return (
    <Section>
      <div
        className={cx(
          "page-width flex flex-col gap-10 md:gap-12",
          center ? "items-center text-center" : "items-start",
        )}
      >
        <div className={cx("flex flex-col gap-6", center && "items-center")}>
          {statement.kicker && (
            <Text field="kicker" as="p" value={statement.kicker} className="kicker text-primary" />
          )}
          <Heading
            as="h2"
            heading={statement.heading}
            headingRest={statement.headingRest}
            size={huge ? "display" : "title"}
            className={cx("text-pretty", huge ? "max-w-6xl" : "max-w-5xl")}
          />
        </div>
        {(statement.name || statement.role || statement.link) && (
          <div
            className={cx(
              "flex flex-col gap-8",
              center ? "items-center" : "items-start sm:flex-row sm:items-center sm:gap-12",
            )}
          >
            {(statement.name || statement.role) && (
              <p
                className={cx("flex gap-4", center ? "flex-col items-center gap-3" : "items-start")}
              >
                <span aria-hidden className={cx("h-px w-8 bg-foreground/30", !center && "mt-3")} />
                <span className="text-body flex flex-col">
                  {statement.name && (
                    <Text field="name" as="span" value={statement.name} className="font-medium" />
                  )}
                  {statement.role && (
                    <Text
                      field="role"
                      as="span"
                      value={statement.role}
                      className="text-muted-foreground"
                    />
                  )}
                </span>
              </p>
            )}
            {statement.link && (
              <Cta
                field="link"
                value={statement.link}
                className={buttonClass({ variant: "link", size: "md" })}
              />
            )}
          </div>
        )}
      </div>
    </Section>
  );
};

export default defineBlock({
  type: "statement",
  version: 1,
  title: "Statement",
  placement: "section",
  props,
  variants: ["start", "center"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "A position, mission or belief stated in two to four sentences set very large: a first sentence that lands, and the rest that explains it, optionally signed by the person who holds it",
    avoid: [
      "more than about sixty words, which belong in text",
      "lists, figures or instructions",
      "more than one on a page",
      "a quote from a visitor or customer, which belongs in a quote",
    ],
  },
  placeholder,
  component: Statement,
});

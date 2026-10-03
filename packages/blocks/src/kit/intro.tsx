import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

import { Text } from "../components.tsx";

/** The fields a section's opening reads, as blocks name them. */
export interface IntroContent {
  readonly kicker?: string | undefined;
  readonly heading: string;
  readonly headingRest?: string | undefined;
  readonly intro?: string | undefined;
}

const headingSizes = {
  jumbo: "text-jumbo",
  display: "text-display",
  "display-half": "text-display-half",
  title: "text-title",
  heading: "text-heading",
} as const;

/**
 * A heading with the rest of its sentence in a softer color, so both wrap as
 * one line of thought: "Ship faster. Everything you need in one place."
 */
export const Heading = (props: {
  readonly as: "h1" | "h2" | "h3";
  readonly heading: string;
  readonly headingRest?: string | undefined;
  readonly size: keyof typeof headingSizes;
  readonly className?: string;
}) => {
  const Element = props.as;
  return (
    <Element className={cx(headingSizes[props.size], props.className)}>
      <Text field="heading" as="span" value={props.heading} />
      {props.headingRest && (
        <>
          {" "}
          <Text
            field="headingRest"
            as="span"
            value={props.headingRest}
            className="text-muted-foreground"
          />
        </>
      )}
    </Element>
  );
};

/**
 * How a section opens: a short label, its heading, and a sentence or two
 * under it, aligned to the section's start or centred. Anything else, such as
 * buttons, follows as children.
 */
export const Intro = (props: {
  readonly content: IntroContent;
  readonly align?: "start" | "center";
  readonly size?: keyof typeof headingSizes;
  readonly as?: "h1" | "h2";
  readonly className?: string;
  readonly children?: ReactNode;
}) => {
  const { content } = props;
  const center = props.align === "center";
  return (
    <div
      className={cx(
        "flex flex-col gap-5",
        center ? "mx-auto max-w-3xl items-center text-center" : "max-w-3xl items-start",
        props.className,
      )}
    >
      {content.kicker && (
        <Text field="kicker" as="p" value={content.kicker} className="kicker text-primary" />
      )}
      <Heading
        as={props.as ?? "h2"}
        heading={content.heading}
        headingRest={content.headingRest}
        size={props.size ?? "title"}
      />
      {content.intro && (
        <Text
          field="intro"
          as="p"
          value={content.intro}
          className={cx(
            "text-lead max-w-2xl whitespace-pre-line text-muted-foreground",
            center && "mx-auto",
          )}
        />
      )}
      {props.children}
    </div>
  );
};

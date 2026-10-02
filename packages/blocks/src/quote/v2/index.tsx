import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Text } from "../../components.tsx";
import { choice, media, optional, text } from "../../fields.ts";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  quote: text({ title: "Quote", min: 3, max: 400, multiline: true }),
  name: text({ title: "Name", max: 80 }),
  role: optional(text({ title: "Role", max: 80 })),
  image: optional(media({ title: "Photo" })),
  logo: optional(media({ title: "Logo" })),
  mediaSide: choice({ title: "Photo side", options: ["start", "end"] }),
};

type Variant = "centered" | "split" | "panel";
type Quote = BlockComponentProps<typeof props, Variant>["props"];

/** A long quote steps down a size, so a paragraph doesn't read as a poster. */
const quoteSize = (quote: Quote) => (quote.quote.length > 240 ? "text-heading" : "text-title");

/*
 * Logos are drawn in one ink, the way a row of them reads as a set: dark on
 * a light surface and light on a dark one, which the surface's
 * --theme-on-dark says. A browser without style queries leaves them dark.
 */
const logoInk =
  "w-auto object-contain brightness-0 opacity-80 [@container_style(--theme-on-dark:inline-block)]:invert";

const Logo = ({ quote, className }: { readonly quote: Quote; readonly className?: string }) =>
  quote.logo === undefined ? null : (
    <Media field="logo" value={quote.logo} sizes="10rem" className={cx(logoInk, className)} />
  );

/** The quote's words, with its marks hung outside the text when it's set to the start. */
const Words = ({ quote, hang }: { readonly quote: Quote; readonly hang: boolean }) => (
  <blockquote>
    <Text
      field="quote"
      as="p"
      value={quote.quote}
      className={cx(
        "font-heading whitespace-pre-line before:content-['“'] after:content-['”']",
        quoteSize(quote),
        hang ? "relative text-pretty before:absolute before:right-full" : "text-balance",
      )}
    />
  </blockquote>
);

/**
 * Who said it: their photo as a small round portrait when there is one, their
 * name and role, and anything else that belongs beside them.
 */
const Attribution = ({
  quote,
  avatar,
  center,
  className,
  children,
}: {
  readonly quote: Quote;
  readonly avatar: boolean;
  readonly center?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}) => (
  <figcaption className={cx("flex items-center gap-4", center && "justify-center", className)}>
    {avatar && quote.image && (
      <Media
        field="image"
        value={quote.image}
        sizes="3.5rem"
        className="size-12 shrink-0 rounded-full object-cover md:size-14"
      />
    )}
    <div className={cx("flex flex-col", center && !(avatar && quote.image) && "items-center")}>
      <Text field="name" as="p" value={quote.name} className="text-body font-semibold" />
      {quote.role && (
        <Text field="role" as="p" value={quote.role} className="text-small text-muted-foreground" />
      )}
    </div>
    {children}
  </figcaption>
);

const QuoteBlock = ({ props: quote, variant }: BlockComponentProps<typeof props, Variant>) => {
  switch (variant) {
    case "centered":
      return (
        <Section>
          <figure className="page-width flex max-w-4xl flex-col items-center gap-10 text-center">
            <Logo quote={quote} className="h-10 md:h-12" />
            <Words quote={quote} hang={false} />
            <Attribution quote={quote} avatar center className="text-start" />
          </figure>
        </Section>
      );
    case "split":
      return (
        <Section>
          <div className="page-width">
            <figure className="card grid overflow-hidden md:grid-cols-12">
              {quote.image && (
                <div
                  className={cx(
                    "relative md:col-span-5",
                    quote.mediaSide === "end" && "md:order-last",
                  )}
                >
                  <Media
                    field="image"
                    value={quote.image}
                    sizes="(min-width: 48rem) 40vw, 100vw"
                    className="aspect-square w-full object-cover sm:aspect-4/5 md:absolute md:inset-0 md:aspect-auto md:h-full"
                  />
                </div>
              )}
              <div
                className={cx(
                  "flex flex-col justify-between gap-12 p-7 sm:p-12 lg:p-16",
                  quote.image ? "md:col-span-7" : "md:col-span-12",
                )}
              >
                <Logo quote={quote} className="h-10 self-start" />
                <Words quote={quote} hang />
                <Attribution quote={quote} avatar={false} />
              </div>
            </figure>
          </div>
        </Section>
      );
    case "panel":
      return (
        <Section background="inset">
          <figure className="page-width flex flex-col gap-10 md:gap-14">
            <div className="max-w-5xl">
              <Words quote={quote} hang />
            </div>
            <Attribution
              quote={quote}
              avatar
              className="flex-wrap gap-y-6 border-t border-foreground/15 pt-8 md:pt-10"
            >
              <Logo quote={quote} className="h-10 sm:ms-auto md:h-12" />
            </Attribution>
          </figure>
        </Section>
      );
  }
};

export default defineBlock({
  type: "quote",
  version: 2,
  title: "Quote",
  placement: "section",
  props,
  variants: ["centered", "split", "panel"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "One person's own words, such as a student's or a parent's, given room on their own, with who said it and, if it helps, their photo or their organisation's logo",
    avoid: [
      "quotes or names nobody gave you",
      "several quotes, which belong in a testimonials section",
      "a photo of anyone other than the person quoted",
    ],
  },
  placeholder,
  component: QuoteBlock,
});

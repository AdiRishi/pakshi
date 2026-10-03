import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { RichText, Text } from "../../components.tsx";
import { optional, richText, text } from "../../fields.ts";
import { Heading } from "../../kit/intro.tsx";
import { ScrollProgress } from "../../kit/magic/scroll-progress.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: optional(text({ title: "Heading", max: 120 })),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 320, multiline: true })),
  body: richText({
    title: "Text",
    marks: ["bold", "italic", "link"],
    nodes: ["heading", "bulletList", "orderedList"],
  }),
};

type Variant = "article" | "sidebar";
type Writing = BlockComponentProps<typeof props, Variant>["props"];

/** The writing itself, set a step larger than body text on wider screens, as long reads are. */
const Body = ({ writing }: { readonly writing: Writing }) => (
  <RichText field="body" value={writing.body} className="prose md:text-lead md:leading-relaxed" />
);

/**
 * The kicker, heading and introduction, each only when it's filled in. Over
 * an article the introduction is a standfirst, a step larger than the text.
 */
const Opening = ({
  writing,
  standfirst,
}: {
  readonly writing: Writing;
  readonly standfirst: boolean;
}) => {
  if (!writing.kicker && !writing.heading && !writing.intro) return null;
  return (
    <div className="flex flex-col gap-5">
      {(writing.kicker || writing.heading) && (
        <div className="flex flex-col gap-4">
          {writing.kicker && (
            <Text field="kicker" as="p" value={writing.kicker} className="kicker text-primary" />
          )}
          {writing.heading && (
            <Heading
              as="h2"
              heading={writing.heading}
              headingRest={writing.headingRest}
              size="title"
            />
          )}
        </div>
      )}
      {writing.intro && (
        <Text
          field="intro"
          as="p"
          value={writing.intro}
          className={cx(
            "whitespace-pre-line text-muted-foreground",
            standfirst ? "text-lead md:text-heading md:leading-snug" : "text-lead",
          )}
        />
      )}
    </div>
  );
};

/**
 * Long-form writing set for reading: one column in the middle of the page
 * with a rail beside it that fills as it's read, or the writing beside its
 * heading, which stays in view.
 */
const RichTextBlock = ({ props: writing, variant }: BlockComponentProps<typeof props, Variant>) => {
  switch (variant) {
    case "article":
      return (
        <Section>
          <div className="page-width">
            <div className="mx-auto flex max-w-2xl flex-col gap-10 md:gap-12">
              <Opening writing={writing} standfirst />
              <div className="relative">
                <ScrollProgress className="absolute inset-y-0 -left-12 hidden lg:block xl:-left-16" />
                <Body writing={writing} />
              </div>
            </div>
          </div>
        </Section>
      );
    case "sidebar":
      // Clipped rather than hidden, so the heading's column can stay in view as the page scrolls.
      return (
        <Section>
          <div className="page-width relative grid gap-10 border-t border-border pt-10 lg:grid-cols-12 lg:gap-x-10 lg:pt-14">
            <div aria-hidden className="absolute -top-px left-0 h-0.5 w-16 bg-primary" />
            <div className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
              <Opening writing={writing} standfirst={false} />
            </div>
            <div className="max-w-2xl lg:col-span-7 lg:col-start-6">
              <Body writing={writing} />
            </div>
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "rich-text",
  version: 2,
  title: "Rich text",
  placement: "section",
  props,
  variants: ["article", "sidebar"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "Long-form writing set for reading: paragraphs with subheadings and lists, such as an article, a policy or the story behind something",
    avoid: [
      "a sentence or two, which belongs in another block's text",
      "points that read better side by side as features",
      "the sidebar layout without a heading to put beside the text",
    ],
  },
  interactive: true,
  placeholder,
  component: RichTextBlock,
});

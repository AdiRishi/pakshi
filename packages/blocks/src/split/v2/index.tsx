import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, RichText, Text } from "../../components.tsx";
import { choice, cta, icon, list, media, optional, richText, text } from "../../fields.ts";
import { Actions } from "../../kit/actions.tsx";
import { Frame, frameImageClass } from "../../kit/frame.tsx";
import { Icon } from "../../kit/icon.tsx";
import { Intro } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  body: optional(
    richText({
      title: "Text",
      marks: ["bold", "italic", "link"],
      nodes: ["bulletList", "orderedList"],
    }),
  ),
  points: list({
    title: "Points",
    item: {
      icon: optional(icon({ title: "Icon" })),
      title: text({ title: "Title", max: 60 }),
      body: text({ title: "Text", max: 160, multiline: true }),
    },
    min: 0,
    max: 4,
  }),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  image: media({ title: "Image" }),
  mediaSide: choice({ title: "Image side", options: ["alternate", "end", "start"] }),
  verticalAlign: choice({ title: "Vertical alignment", options: ["center", "top"] }),
  frame: choice({ title: "Image style", options: ["plain", "framed", "browser", "phone"] }),
  background: choice({ title: "Background", options: ["full", "inset"] }),
};

type Variant = "standard" | "bleed";
type Split = BlockComponentProps<typeof props, Variant>["props"];

/*
 * A split set to take turns marks itself with `split-alternate`. Every second
 * section on the page that holds such a split puts its image on the other
 * side, so a run of them zigzags down the page without anyone choosing sides.
 */
const turnMarker = "split-alternate";

/** Where the standard layout's image sits beside the words. */
const pictureOrder = {
  end: "",
  start: "md:order-first",
  alternate: "[main>:nth-child(even_of_:has(.split-alternate))_&]:md:order-first",
} as const satisfies Record<Split["mediaSide"], string>;

/** Which half of the screen the bleeding image fills. */
const bleedEdge = {
  end: "md:right-0",
  start: "md:left-0",
  alternate:
    "md:right-0 [main>:nth-child(even_of_:has(.split-alternate))_&]:md:right-auto [main>:nth-child(even_of_:has(.split-alternate))_&]:md:left-0",
} as const satisfies Record<Split["mediaSide"], string>;

/** Which column the words take beside a bleeding image. */
const bleedColumn = {
  end: "",
  start: "md:col-start-2",
  alternate: "[main>:nth-child(even_of_:has(.split-alternate))_&]:md:col-start-2",
} as const satisfies Record<Split["mediaSide"], string>;

const Points = ({ split }: { readonly split: Split }) =>
  split.points.length === 0 ? null : (
    <ul className="grid w-full gap-x-8 gap-y-7 border-t border-border pt-8 sm:grid-cols-2">
      {split.points.map((point) => (
        <li key={point.id} className="flex flex-col gap-3">
          {point.icon && (
            <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15 ring-inset">
              <Icon name={point.icon} className="size-4.5" />
            </span>
          )}
          <div className="flex flex-col gap-1">
            <Text
              field={["points", point.id, "title"]}
              as="h3"
              value={point.title}
              className="text-body font-semibold"
            />
            <Text
              field={["points", point.id, "body"]}
              as="p"
              value={point.body}
              className="text-small whitespace-pre-line text-muted-foreground"
            />
          </div>
        </li>
      ))}
    </ul>
  );

const Copy = ({ split, className }: { readonly split: Split; readonly className?: string }) => (
  <div className={cx("flex flex-col items-start gap-8", className)}>
    <Intro content={split}>
      {split.body && (
        <RichText
          field="body"
          value={split.body}
          className="text-lead max-w-xl text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_li]:ps-1 [&_li+li]:mt-2 [&_li::marker]:text-primary [&_ol]:list-decimal [&_ol]:ps-6 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:ps-6 [&>*+*]:mt-4"
        />
      )}
    </Intro>
    <Points split={split} />
    <Actions actions={split.actions} others="link" />
  </div>
);

const SplitBlock = ({ props: split, variant }: BlockComponentProps<typeof props, Variant>) => {
  const top = split.verticalAlign === "top";
  const marker = split.mediaSide === "alternate" ? turnMarker : undefined;
  switch (variant) {
    case "standard":
      return (
        <Section background={split.background}>
          <div
            className={cx(
              "page-width grid gap-12 md:grid-cols-2 lg:gap-20",
              top ? "items-start" : "items-center",
              marker,
            )}
          >
            <Copy split={split} />
            <div className={pictureOrder[split.mediaSide]}>
              <Frame kind={split.frame}>
                <Media
                  field="image"
                  value={split.image}
                  sizes={
                    split.frame === "phone"
                      ? "19rem"
                      : "(min-width: 76rem) 36rem, (min-width: 48rem) 50vw, 100vw"
                  }
                  className={cx(
                    frameImageClass(split.frame),
                    split.frame === "plain" &&
                      "aspect-4/5 outline-1 -outline-offset-1 outline-foreground/10",
                  )}
                />
              </Frame>
            </div>
          </div>
        </Section>
      );
    case "bleed":
      return (
        <Section background={split.background} spacing="flush">
          <div className={cx("relative", marker)}>
            <div
              className={cx(
                "relative aspect-4/3 md:absolute md:inset-y-0 md:aspect-auto md:w-1/2",
                bleedEdge[split.mediaSide],
              )}
            >
              <Media
                field="image"
                value={split.image}
                sizes="(min-width: 48rem) 50vw, 100vw"
                className="absolute inset-0 size-full object-cover"
              />
            </div>
            <div
              className={cx(
                "page-width grid py-section md:min-h-160 md:grid-cols-2 md:gap-20 lg:gap-32",
                top ? "items-start" : "items-center",
              )}
            >
              <Copy split={split} className={bleedColumn[split.mediaSide]} />
            </div>
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "split",
  version: 2,
  title: "Split",
  placement: "section",
  props,
  variants: ["standard", "bleed"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "One idea told beside a picture that shows it: a heading, a few sentences or a short list, and up to four short points. Several in a row tell a story, their pictures taking turns on each side",
    avoid: [
      "several in a row with the image on the same side; leave the image side on taking turns",
      "more than a few short paragraphs, which belong in text",
      "a picture that only decorates",
    ],
  },
  placeholder,
  component: SplitBlock,
});

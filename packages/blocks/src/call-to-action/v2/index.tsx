import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, FormView, Media } from "../../components.tsx";
import { choice, cta, form, list, media, optional, text } from "../../fields.ts";
import { Actions } from "../../kit/actions.tsx";
import { buttonClass } from "../../kit/button.ts";
import { Intro } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  form: optional(form({ title: "Sign-up form" })),
  image: optional(media({ title: "Image" })),
  mediaSide: choice({ title: "Image side", options: ["end", "start"] }),
  backdrop: choice({
    title: "Backdrop",
    options: ["none", "glow", "arc", "grid", "dots", "stripes", "noise"],
  }),
};

type Variant = "centered" | "split" | "panel" | "image";
type CallToAction = BlockComponentProps<typeof props, Variant>["props"];

/**
 * What the visitor can do: the buttons, or a sign-up form in one row. Beside
 * a form, the buttons become quiet links, so the form leads.
 */
const Response = ({
  cta: action,
  align,
}: {
  readonly cta: CallToAction;
  readonly align: "start" | "center";
}) => {
  const center = align === "center";
  if (action.form === undefined)
    return <Actions actions={action.actions} size="lg" align={align} />;
  return (
    <div className={cx("flex w-full max-w-md flex-col gap-4", center && "items-center")}>
      <FormView field="form" value={action.form} layout="inline" className="w-full" />
      {action.actions.length > 0 && (
        <div className={cx("flex flex-wrap gap-x-6 gap-y-2", center && "justify-center")}>
          {action.actions.map((item) => (
            <Cta
              key={item.id}
              field={["actions", item.id, "button"]}
              value={item.button}
              className={buttonClass({ variant: "link", size: "sm" })}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** The words on one side and the response on the other, stacked on narrow screens. */
const Row = ({ cta: action }: { readonly cta: CallToAction }) => (
  <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
    <Intro content={action} className="lg:flex-1" />
    <div className={cx("shrink-0", action.form && "w-full max-w-md lg:w-md")}>
      <Response cta={action} align="start" />
    </div>
  </div>
);

const CallToActionBlock = ({
  props: action,
  variant,
}: BlockComponentProps<typeof props, Variant>) => {
  switch (variant) {
    case "centered":
      return (
        <Section backdrop={action.backdrop}>
          <div className="page-width flex flex-col items-center gap-10">
            <Intro content={action} align="center" />
            <Response cta={action} align="center" />
          </div>
        </Section>
      );
    case "split":
      return (
        <Section backdrop={action.backdrop}>
          <div className="page-width">
            <Row cta={action} />
          </div>
        </Section>
      );
    case "panel":
      return (
        <Section
          background="inset"
          spacing="flush"
          backdrop={action.backdrop}
          className="page-width my-section border border-foreground/10"
        >
          {action.image === undefined ? (
            <div className="px-6 py-14 sm:px-12 md:py-20 lg:px-16">
              <Row cta={action} />
            </div>
          ) : (
            <div className="grid md:grid-cols-2">
              <div className="flex flex-col justify-center gap-10 px-6 py-12 sm:px-12 md:py-20 lg:px-16">
                <Intro content={action} />
                <Response cta={action} align="start" />
              </div>
              <div
                className={cx(
                  "relative min-h-72 md:min-h-full",
                  action.mediaSide === "start" && "md:order-first",
                )}
              >
                <Media
                  field="image"
                  value={action.image}
                  sizes="(min-width: 76rem) 38rem, (min-width: 48rem) 50vw, 100vw"
                  className="absolute inset-0 size-full object-cover"
                />
              </div>
            </div>
          )}
        </Section>
      );
    case "image":
      return (
        <Section spacing="flush" className="flex min-h-130 items-center">
          {action.image && (
            <Media
              field="image"
              value={action.image}
              sizes="100vw"
              className="absolute inset-0 -z-20 size-full object-cover"
            />
          )}
          <div aria-hidden className="absolute inset-0 -z-10 bg-background/65" />
          <div className="page-width py-section flex flex-col items-center gap-10">
            <Intro content={action} align="center" />
            <Response cta={action} align="center" />
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "call-to-action",
  version: 2,
  title: "Call to action",
  placement: "section",
  props,
  variants: ["centered", "split", "panel", "image"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "The closing ask of a page or part of one: one next step, such as registering or signing up, as a button or two or an email sign-up form",
    avoid: [
      "long explanations, which belong in text",
      "a second button that competes with the first",
      "two in a row",
      "a sign-up form with more than one or two fields, which belongs in a form section",
    ],
  },
  placeholder,
  component: CallToActionBlock,
});

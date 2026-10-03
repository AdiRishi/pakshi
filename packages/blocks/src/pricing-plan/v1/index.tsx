import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Root, Text } from "../../components.tsx";
import { choice, cta, list, optional, text } from "../../fields.ts";
import { buttonClass } from "../../kit/button.ts";
import { Icon } from "../../kit/icon.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  name: text({ title: "Name", max: 40 }),
  badge: optional(text({ title: "Badge", max: 24 })),
  price: text({ title: "Price", max: 16 }),
  period: optional(text({ title: "Per", max: 32 })),
  description: optional(text({ title: "Description", max: 200, multiline: true })),
  features: list({
    title: "What's included",
    item: { feature: text({ title: "Feature", max: 80 }) },
    min: 0,
    max: 10,
  }),
  button: optional(cta({ title: "Button" })),
  featured: choice({ title: "Stand out", options: ["no", "brand", "inverse"] }),
};

type Plan = BlockComponentProps<typeof props, "default">["props"];

const Badge = ({ plan }: { readonly plan: Plan }) =>
  plan.badge ? (
    <Text
      field="badge"
      as="span"
      value={plan.badge}
      className="text-small rounded-full bg-primary/12 px-2.5 py-0.5 font-medium whitespace-nowrap text-primary"
    />
  ) : null;

const Price = ({ plan }: { readonly plan: Plan }) => (
  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 @3xl:col-start-2 @3xl:row-start-1 @3xl:flex-col @3xl:items-end @3xl:self-end">
    <Text
      field="price"
      as="span"
      value={plan.price}
      className="text-title font-heading tabular-nums"
    />
    {plan.period && (
      <Text
        field="period"
        as="span"
        value={plan.period}
        className="text-small text-muted-foreground"
      />
    )}
  </p>
);

/*
 * A plan lays itself out by the room its section gives it: a card's narrow
 * column stacks it, and a row as wide as the page puts its price and button
 * at the end, so the same plan works in either of its section's layouts.
 * In a card the button sits at the bottom, so buttons line up across a row
 * of cards.
 */
const PricingPlan = ({ props: plan }: BlockComponentProps<typeof props, "default">) => {
  const featured = plan.featured !== "no";
  return (
    <Root
      as="li"
      className={cx("@container flex rounded-lg", featured && "ring-4 ring-primary/20")}
    >
      <div
        data-surface={featured ? plan.featured : undefined}
        className={cx(
          "flex flex-1 flex-col gap-6 p-7 md:p-8",
          "@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:gap-x-16 @3xl:gap-y-5",
          featured ? "rounded-lg bg-background text-foreground shadow-card" : "card",
        )}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 @3xl:justify-start">
            <Text field="name" as="h3" value={plan.name} className="text-heading" />
            <Badge plan={plan} />
          </div>
          {plan.description && (
            <Text
              field="description"
              as="p"
              value={plan.description}
              className="text-body max-w-xl whitespace-pre-line text-muted-foreground"
            />
          )}
        </div>
        <Price plan={plan} />
        {plan.features.length > 0 && (
          <ul className="flex flex-col gap-3 border-t border-foreground/10 pt-6 @3xl:row-start-2 @3xl:flex-row @3xl:flex-wrap @3xl:gap-x-6 @3xl:gap-y-2 @3xl:border-0 @3xl:pt-0">
            {plan.features.map((item) => (
              <li key={item.id} className="text-small flex items-start gap-3 @3xl:gap-2">
                <Icon name="check" className="mt-0.5 size-4 shrink-0 text-primary" />
                <Text field={["features", item.id, "feature"]} as="span" value={item.feature} />
              </li>
            ))}
          </ul>
        )}
        {plan.button && (
          <Cta
            field="button"
            value={plan.button}
            className={buttonClass({
              variant: featured ? "primary" : "secondary",
              className:
                "mt-auto w-full @3xl:col-start-2 @3xl:row-start-2 @3xl:mt-0 @3xl:w-auto @3xl:self-start @3xl:justify-self-end",
            })}
          />
        )}
      </div>
    </Root>
  );
};

export default defineBlock({
  type: "pricing-plan",
  version: 1,
  title: "Pricing plan",
  placement: "item",
  props,
  variants: ["default"],
  agent: {
    purpose:
      "One ticket type, membership tier or plan in a pricing section: its name, price, who it's for, what's included and a button to choose it",
    avoid: [
      "prices nobody gave you",
      "more than one plan that stands out",
      "features that are the same in every plan; say those once in the section's note",
    ],
  },
  placeholder,
  component: PricingPlan,
});

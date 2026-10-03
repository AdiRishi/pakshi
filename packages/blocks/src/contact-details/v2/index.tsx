import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Text } from "../../components.tsx";
import { cta, list, optional, text } from "../../fields.ts";
import type { IconName } from "../../icon-names.ts";
import { Actions } from "../../kit/actions.tsx";
import { Icon } from "../../kit/icon.tsx";
import { Intro } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 90 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 280, multiline: true })),
  actions: list({ title: "Buttons", item: { button: cta({ title: "Button" }) }, min: 0, max: 2 }),
  email: optional(text({ title: "Email", max: 120 })),
  phone: optional(text({ title: "Phone", max: 40 })),
  address: optional(text({ title: "Address", max: 240, multiline: true })),
  hours: optional(text({ title: "Opening hours", max: 400, multiline: true })),
};

type Variant = "columns" | "split" | "cards";
type Contact = BlockComponentProps<typeof props, Variant>["props"];

interface Detail {
  readonly key: string;
  readonly icon: IconName;
  readonly label: string;
  readonly value: ReactNode;
}

const link =
  "rounded-sm underline decoration-foreground/25 decoration-1 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The details the section was given, in the order people reach for them. */
const details = (contact: Contact) => {
  const shown: Array<Detail> = [];
  if (contact.email)
    shown.push({
      key: "email",
      icon: "mail",
      label: "Email",
      value: (
        <a href={`mailto:${contact.email.trim()}`} className={cx(link, "wrap-anywhere")}>
          <Text field="email" as="span" value={contact.email} />
        </a>
      ),
    });
  if (contact.phone)
    shown.push({
      key: "phone",
      icon: "phone",
      label: "Phone",
      value: (
        <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className={link}>
          <Text field="phone" as="span" value={contact.phone} />
        </a>
      ),
    });
  if (contact.address)
    shown.push({
      key: "address",
      icon: "map-pin",
      label: "Address",
      value: (
        <Text field="address" as="span" value={contact.address} className="whitespace-pre-line" />
      ),
    });
  if (contact.hours)
    shown.push({
      key: "hours",
      icon: "clock",
      label: "Opening hours",
      value: <Text field="hours" as="span" value={contact.hours} className="whitespace-pre-line" />,
    });
  return shown;
};

/** Columns for as many details as there are, so a row is never left half empty. */
const columns = [
  "",
  "",
  "sm:grid-cols-2",
  "sm:grid-cols-3",
  "sm:grid-cols-2 lg:grid-cols-4",
] as const;

const Badge = ({ icon }: { readonly icon: IconName }) => (
  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
    <Icon name={icon} className="size-5" />
  </span>
);

const ContactDetails = ({
  props: contact,
  variant,
}: BlockComponentProps<typeof props, Variant>) => {
  const shown = details(contact);
  const intro = (
    <Intro content={contact}>
      {variant === "split" && <Actions actions={contact.actions} others="link" className="mt-2" />}
    </Intro>
  );
  const header = (
    <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
      {intro}
      <Actions actions={contact.actions} others="link" className="md:shrink-0" />
    </div>
  );
  switch (variant) {
    case "columns":
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {header}
            <address className="not-italic">
              <dl className={cx("grid gap-x-10 gap-y-10", columns[shown.length])}>
                {shown.map((detail) => (
                  <div key={detail.key} className="flex flex-col gap-3 border-t border-border pt-6">
                    <dt className="text-small flex items-center gap-2 font-medium text-muted-foreground">
                      <Icon name={detail.icon} className="size-4 text-primary" />
                      {detail.label}
                    </dt>
                    <dd className="text-lead">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </address>
          </div>
        </Section>
      );
    case "split":
      return (
        <Section>
          <div className="page-width grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-20">
            {intro}
            <address className="not-italic">
              <dl className="border-b border-border">
                {shown.map((detail) => (
                  <div
                    key={detail.key}
                    className="grid gap-x-8 gap-y-2 border-t border-border py-6 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-baseline"
                  >
                    <dt className="text-small flex items-center gap-2.5 font-medium text-muted-foreground">
                      <Icon name={detail.icon} className="size-4 self-center text-primary" />
                      {detail.label}
                    </dt>
                    <dd className="text-lead">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </address>
          </div>
        </Section>
      );
    case "cards":
      return (
        <Section>
          <div className="page-width flex flex-col gap-14 md:gap-16">
            {header}
            <address className="not-italic">
              <dl className={cx("grid gap-4", columns[shown.length])}>
                {shown.map((detail) => (
                  <div key={detail.key} className="card flex flex-col gap-2 p-6 md:p-7">
                    <dt className="text-small flex flex-col gap-6 font-medium text-muted-foreground">
                      <Badge icon={detail.icon} />
                      {detail.label}
                    </dt>
                    <dd className="text-lead">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </address>
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "contact-details",
  version: 2,
  title: "Contact details",
  placement: "section",
  props,
  variants: ["columns", "split", "cards"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "How to reach the organisation: its email, phone number, postal address and opening hours, with a button such as one to a contact form",
    avoid: [
      "details nobody gave you",
      "a way to send a message, which belongs in a form section",
      "directions and a map, which belong in a location section",
    ],
  },
  placeholder,
  component: ContactDetails,
});

import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Text } from "../../components.tsx";
import { cta, list, optional, text } from "../../fields.ts";
import type { IconName } from "../../icon-names.ts";
import { Actions } from "../../kit/actions.tsx";
import { cn } from "../../kit/cn.ts";
import { CopyButton } from "../../kit/copy-button.tsx";
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
  /** What the copy button beside it copies, and what it's called, for an email or phone number. */
  readonly copy?: { readonly value: string; readonly label: string };
}

const link =
  "min-w-0 rounded-sm underline decoration-foreground/25 decoration-1 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The details the section was given, in the order people reach for them. */
const details = (contact: Contact) => {
  const shown: Array<Detail> = [];
  if (contact.email) {
    const email = contact.email.trim();
    shown.push({
      key: "email",
      icon: "mail",
      label: "Email",
      value: (
        <a href={`mailto:${email}`} className={cx(link, "wrap-anywhere")}>
          <Text field="email" as="span" value={contact.email} />
        </a>
      ),
      copy: { value: email, label: "Copy email address" },
    });
  }
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
      copy: { value: contact.phone.trim(), label: "Copy phone number" },
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

const Badge = ({ icon, className }: { readonly icon: IconName; readonly className?: string }) => (
  <span
    className={cn(
      "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 ring-inset",
      className,
    )}
  >
    <Icon name={icon} className="size-5" />
  </span>
);

/** A detail's value, with a button beside it to copy an email address or phone number. */
const Value = ({ detail, className }: { readonly detail: Detail; readonly className?: string }) => (
  <dd className={cx("text-lead flex items-start gap-1", className)}>
    <span className="min-w-0">{detail.value}</span>
    {detail.copy && (
      <CopyButton value={detail.copy.value} label={detail.copy.label} className="-my-0.5" />
    )}
  </dd>
);

/**
 * How to reach the organisation: its email, phone, address and opening
 * hours, each under its icon, in columns, in rows beside the heading, or on
 * cards. Email addresses and phone numbers can be copied as well as opened.
 */
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
              <dl className={cx("grid gap-x-10 gap-y-12", columns[shown.length])}>
                {shown.map((detail) => (
                  <div
                    key={detail.key}
                    className="relative flex flex-col gap-4 border-t border-border pt-8"
                  >
                    <div aria-hidden className="absolute -top-px left-0 h-px w-10 bg-primary" />
                    <dt className="text-small flex items-center gap-3 font-medium text-muted-foreground">
                      <Badge icon={detail.icon} />
                      {detail.label}
                    </dt>
                    <Value detail={detail} />
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
            <div className="lg:sticky lg:top-24 lg:self-start">{intro}</div>
            <address className="not-italic">
              <dl className="border-b border-border">
                {shown.map((detail) => (
                  <div
                    key={detail.key}
                    className="grid gap-x-8 gap-y-3 border-t border-border py-7 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center"
                  >
                    <dt className="text-small flex items-center gap-3 font-medium text-muted-foreground">
                      <Badge icon={detail.icon} className="size-9" />
                      {detail.label}
                    </dt>
                    <Value detail={detail} />
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
              <dl className={cx("grid gap-4 md:gap-5", columns[shown.length])}>
                {shown.map((detail) => (
                  <div key={detail.key} className="card flex flex-col gap-3 p-6 md:p-8">
                    <dt className="text-small flex flex-col items-start gap-8 font-medium text-muted-foreground">
                      <Badge icon={detail.icon} className="size-12" />
                      {detail.label}
                    </dt>
                    <Value detail={detail} />
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

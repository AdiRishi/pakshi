import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, Text } from "../../components.tsx";
import { optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
  address: optional(text({ title: "Address", max: 240, multiline: true })),
  phone: optional(text({ title: "Phone", max: 40 })),
  email: optional(text({ title: "Email", max: 120 })),
  hours: optional(text({ title: "Opening hours", max: 400, multiline: true })),
};

const label = "text-small font-semibold text-muted-foreground";

const link =
  "text-body rounded-sm text-primary underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const ContactDetails = ({
  props: contact,
  variant,
}: BlockComponentProps<typeof props, "columns" | "stacked">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div
      className={
        variant === "columns"
          ? "mx-auto flex max-w-6xl flex-col gap-12"
          : "mx-auto flex max-w-2xl flex-col gap-10"
      }
    >
      <div className="flex max-w-2xl flex-col gap-4">
        <Text field="heading" as="h2" value={contact.heading} className="text-title text-balance" />
        {contact.intro && (
          <Text
            field="intro"
            as="p"
            value={contact.intro}
            className="text-lead whitespace-pre-line text-muted-foreground"
          />
        )}
      </div>
      <address className="not-italic">
        <dl
          className={
            variant === "columns"
              ? "grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-4"
              : "flex flex-col gap-8"
          }
        >
          {contact.address && (
            <div className="flex flex-col gap-2">
              <dt className={label}>Address</dt>
              <dd>
                <Text
                  field="address"
                  as="p"
                  value={contact.address}
                  className="text-body whitespace-pre-line"
                />
              </dd>
            </div>
          )}
          {contact.phone && (
            <div className="flex flex-col gap-2">
              <dt className={label}>Phone</dt>
              <dd>
                <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className={link}>
                  <Text field="phone" as="span" value={contact.phone} />
                </a>
              </dd>
            </div>
          )}
          {contact.email && (
            <div className="flex flex-col gap-2">
              <dt className={label}>Email</dt>
              <dd>
                <a href={`mailto:${contact.email.trim()}`} className={`${link} wrap-break-word`}>
                  <Text field="email" as="span" value={contact.email} />
                </a>
              </dd>
            </div>
          )}
          {contact.hours && (
            <div className="flex flex-col gap-2">
              <dt className={label}>Opening hours</dt>
              <dd>
                <Text
                  field="hours"
                  as="p"
                  value={contact.hours}
                  className="text-body whitespace-pre-line"
                />
              </dd>
            </div>
          )}
        </dl>
      </address>
    </div>
  </Root>
);

export default defineBlock({
  type: "contact-details",
  version: 1,
  title: "Contact details",
  placement: "section",
  props,
  variants: ["columns", "stacked"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "How to reach or find the organisation: its address, phone number, email and opening hours",
    avoid: ["details nobody gave you", "a way to send a message, which belongs in a form section"],
  },
  placeholder,
  component: ContactDetails,
});

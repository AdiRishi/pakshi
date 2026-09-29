import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { FormView, Root, Text } from "../../components.tsx";
import { form, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
  form: form({ title: "Form" }),
};

const FormSection = ({
  props: section,
  variant,
}: BlockComponentProps<typeof props, "card" | "plain">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div
      className={
        variant === "card"
          ? "mx-auto flex max-w-2xl flex-col gap-8 rounded-lg border border-border bg-card p-8 text-card-foreground shadow-card"
          : "mx-auto flex max-w-2xl flex-col gap-8"
      }
    >
      <div className="flex flex-col gap-3">
        <Text field="heading" as="h2" value={section.heading} className="text-title text-balance" />
        {section.intro && (
          <Text
            field="intro"
            as="p"
            value={section.intro}
            className="text-lead whitespace-pre-line text-muted-foreground"
          />
        )}
      </div>
      <FormView field="form" value={section.form} className="flex flex-col gap-6" />
    </div>
  </Root>
);

export default defineBlock({
  type: "form-section",
  version: 1,
  title: "Form",
  placement: "section",
  props,
  variants: ["card", "plain"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "Collect a registration, an enquiry or a sign-up with one of the site's forms",
    avoid: ["more than one form on a page"],
  },
  placeholder,
  component: FormSection,
});

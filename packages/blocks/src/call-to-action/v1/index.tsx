import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Root, Text } from "../../components.tsx";
import { cta, optional, text } from "../../fields.ts";

const props = {
  heading: text({ min: 3, max: 80 }),
  body: optional(text({ max: 200, multiline: true })),
  primary: cta(),
  secondary: optional(cta()),
};

const button =
  "inline-flex items-center justify-center rounded-md px-6 py-3 text-body transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const CallToAction = ({
  props: action,
  variant,
}: BlockComponentProps<typeof props, "banner" | "centered">) => (
  <Root className="bg-background px-6 py-section text-foreground">
    <div
      className={
        variant === "banner"
          ? "mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-center md:justify-between"
          : "mx-auto flex max-w-2xl flex-col items-center gap-8 text-center"
      }
    >
      <div className="flex flex-col gap-3">
        <Text field="heading" as="h2" value={action.heading} className="text-title text-balance" />
        {action.body && (
          <Text
            field="body"
            as="p"
            value={action.body}
            className="text-lead whitespace-pre-line text-muted-foreground"
          />
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Cta
          field="primary"
          value={action.primary}
          className={`${button} bg-primary text-primary-foreground shadow-card`}
        />
        {action.secondary && (
          <Cta
            field="secondary"
            value={action.secondary}
            className={`${button} border border-border text-foreground`}
          />
        )}
      </div>
    </div>
  </Root>
);

export default defineBlock({
  type: "call-to-action",
  version: 1,
  title: "Call to action",
  placement: "section",
  props,
  variants: ["banner", "centered"],
  surfaces: ["default", "muted", "brand", "inverse"],
  interactive: false,
  agent: {
    purpose: "Ask the visitor to take one or two next steps",
    avoid: ["long explanations, which belong in rich text"],
  },
  component: CallToAction,
});

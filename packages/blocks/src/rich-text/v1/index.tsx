import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { RichText, Root, Text } from "../../components.tsx";
import { optional, richText, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: optional(text({ title: "Heading", max: 120 })),
  body: richText({
    title: "Text",
    marks: ["bold", "italic", "link"],
    nodes: ["heading", "bulletList", "orderedList"],
  }),
};

const prose = [
  "text-body",
  "[&_p+*]:mt-4 [&_ul+*]:mt-4 [&_ol+*]:mt-4",
  "[&_h2]:mt-10 [&_h2]:text-heading [&_h3]:mt-8 [&_h3]:text-lead",
  "[&_h2+*]:mt-3 [&_h3+*]:mt-2",
  "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_li+li]:mt-1",
  "[&_a]:text-primary [&_a]:underline",
].join(" ");

const RichTextBlock = ({
  props: section,
  variant,
}: BlockComponentProps<typeof props, "narrow" | "wide">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div className={variant === "narrow" ? "mx-auto max-w-2xl" : "mx-auto max-w-4xl"}>
      {section.heading && (
        <Text
          field="heading"
          as="h2"
          value={section.heading}
          className="text-title mb-6 text-balance"
        />
      )}
      <RichText field="body" value={section.body} className={prose} />
    </div>
  </Root>
);

export default defineBlock({
  type: "rich-text",
  version: 1,
  title: "Rich text",
  placement: "section",
  props,
  variants: ["narrow", "wide"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "Long-form writing: paragraphs, subheadings and lists",
    avoid: ["a single short sentence, which belongs in another block"],
  },
  placeholder,
  component: RichTextBlock,
});

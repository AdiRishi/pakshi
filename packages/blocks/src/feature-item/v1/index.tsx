import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, Text } from "../../components.tsx";
import { text } from "../../fields.ts";

const props = {
  title: text({ title: "Title", max: 60 }),
  body: text({ title: "Text", max: 240, multiline: true }),
};

const FeatureItem = ({ props: item }: BlockComponentProps<typeof props, "default">) => (
  <Root
    as="li"
    className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6 text-card-foreground"
  >
    <Text field="title" as="h3" value={item.title} className="text-heading" />
    <Text
      field="body"
      as="p"
      value={item.body}
      className="text-body whitespace-pre-line text-muted-foreground"
    />
  </Root>
);

export default defineBlock({
  type: "feature-item",
  version: 1,
  title: "Feature",
  placement: "item",
  props,
  variants: ["default"],
  agent: { purpose: "One point in a feature grid: a short title and a sentence or two" },
  component: FeatureItem,
});

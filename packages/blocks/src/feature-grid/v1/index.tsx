import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, Slot, Text } from "../../components.tsx";
import { optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
};

const FeatureGrid = ({
  props: grid,
  variant,
}: BlockComponentProps<typeof props, "three-columns" | "two-columns">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div className="mx-auto flex max-w-6xl flex-col gap-12">
      <div className="flex max-w-2xl flex-col gap-4">
        <Text field="heading" as="h2" value={grid.heading} className="text-title text-balance" />
        {grid.intro && (
          <Text
            field="intro"
            as="p"
            value={grid.intro}
            className="text-lead whitespace-pre-line text-muted-foreground"
          />
        )}
      </div>
      <Slot
        name="items"
        as="ul"
        className={
          variant === "three-columns"
            ? "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
            : "grid gap-8 sm:grid-cols-2"
        }
      />
    </div>
  </Root>
);

export default defineBlock({
  type: "feature-grid",
  version: 1,
  title: "Feature grid",
  placement: "section",
  props,
  variants: ["three-columns", "two-columns"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: { items: { title: "Features", accepts: ["feature-item"] } },
  interactive: false,
  agent: {
    purpose: "Several parallel points, such as what's included or why to come, each short",
    avoid: ["a single item", "items that need more than two sentences"],
  },
  placeholder,
  component: FeatureGrid,
});

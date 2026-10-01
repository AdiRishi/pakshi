import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, Text } from "../../components.tsx";
import { list, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: optional(text({ title: "Heading", max: 80 })),
  stats: list({
    title: "Figures",
    item: {
      value: text({ title: "Figure", max: 12 }),
      label: text({ title: "Label", max: 80 }),
    },
    min: 2,
    max: 6,
  }),
};

const Stats = ({ props: stats, variant }: BlockComponentProps<typeof props, "row" | "cards">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      {stats.heading && (
        <Text field="heading" as="h2" value={stats.heading} className="text-title text-balance" />
      )}
      <dl
        className={
          variant === "row"
            ? "flex flex-wrap gap-x-12 gap-y-10"
            : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {stats.stats.map((stat) => (
          <div
            key={stat.id}
            className={
              variant === "row"
                ? "flex min-w-48 flex-1 flex-col-reverse gap-2 border-t border-border pt-6"
                : "flex flex-col-reverse gap-2 rounded-lg border border-border bg-card p-6 text-card-foreground"
            }
          >
            <dt>
              <Text
                field={["stats", stat.id, "label"]}
                as="span"
                value={stat.label}
                className="text-body text-muted-foreground"
              />
            </dt>
            <dd>
              <Text
                field={["stats", stat.id, "value"]}
                as="span"
                value={stat.value}
                className={
                  variant === "row"
                    ? "text-title md:text-display font-heading"
                    : "text-title font-heading"
                }
              />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  </Root>
);

export default defineBlock({
  type: "stats",
  version: 1,
  title: "Stats",
  placement: "section",
  props,
  variants: ["row", "cards"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "Two to six headline figures, such as how many took part or how many would come back, each with a short label",
    avoid: [
      "figures the site's owner hasn't given",
      "a figure that needs a sentence to explain, which belongs in text",
    ],
  },
  placeholder,
  component: Stats,
});

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, Text } from "../../components.tsx";
import { list, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
  entries: list({
    title: "Entries",
    item: {
      when: text({ title: "When", max: 40 }),
      title: text({ title: "Title", max: 80 }),
      detail: optional(text({ title: "Detail", max: 240, multiline: true })),
    },
    min: 2,
    max: 20,
  }),
};

const Timeline = ({
  props: timeline,
  variant,
}: BlockComponentProps<typeof props, "vertical" | "agenda">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div className="mx-auto flex max-w-3xl flex-col gap-12">
      <div className="flex flex-col gap-4">
        <Text
          field="heading"
          as="h2"
          value={timeline.heading}
          className="text-title text-balance"
        />
        {timeline.intro && (
          <Text
            field="intro"
            as="p"
            value={timeline.intro}
            className="text-lead whitespace-pre-line text-muted-foreground"
          />
        )}
      </div>
      {variant === "vertical" ? (
        <ol className="flex flex-col gap-10 border-l border-border pl-8">
          {timeline.entries.map((entry) => (
            <li key={entry.id} className="relative flex flex-col gap-2">
              <span
                aria-hidden="true"
                className="absolute top-1.5 -left-9.5 size-3 rounded-full bg-primary"
              />
              <Text
                field={["entries", entry.id, "when"]}
                as="p"
                value={entry.when}
                className="text-small font-semibold text-primary"
              />
              <Text
                field={["entries", entry.id, "title"]}
                as="h3"
                value={entry.title}
                className="text-heading"
              />
              {entry.detail && (
                <Text
                  field={["entries", entry.id, "detail"]}
                  as="p"
                  value={entry.detail}
                  className="text-body whitespace-pre-line text-muted-foreground"
                />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {timeline.entries.map((entry) => (
            <li key={entry.id} className="grid gap-1 py-5 sm:grid-cols-4 sm:gap-8">
              <Text
                field={["entries", entry.id, "when"]}
                as="p"
                value={entry.when}
                className="text-body font-semibold text-primary"
              />
              <div className="flex flex-col gap-1 sm:col-span-3">
                <Text
                  field={["entries", entry.id, "title"]}
                  as="h3"
                  value={entry.title}
                  className="text-body font-semibold"
                />
                {entry.detail && (
                  <Text
                    field={["entries", entry.id, "detail"]}
                    as="p"
                    value={entry.detail}
                    className="text-body whitespace-pre-line text-muted-foreground"
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  </Root>
);

export default defineBlock({
  type: "timeline",
  version: 1,
  title: "Timeline",
  placement: "section",
  props,
  variants: ["vertical", "agenda"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "Steps or times in order, such as a day's schedule, the days of a week or the stages of a process. The agenda variant suits a schedule with times",
    avoid: [
      "points with no order, which belong in a feature grid",
      "dates of separate events, which belong on their own pages",
    ],
  },
  placeholder,
  component: Timeline,
});

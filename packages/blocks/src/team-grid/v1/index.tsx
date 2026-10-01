import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, Slot, Text } from "../../components.tsx";
import { optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
};

const TeamGrid = ({
  props: team,
  variant,
}: BlockComponentProps<typeof props, "three-columns" | "four-columns">) => (
  <Root className="py-section bg-background px-6 text-foreground">
    <div className="mx-auto flex max-w-6xl flex-col gap-12">
      <div className="flex max-w-2xl flex-col gap-4">
        <Text field="heading" as="h2" value={team.heading} className="text-title text-balance" />
        {team.intro && (
          <Text
            field="intro"
            as="p"
            value={team.intro}
            className="text-lead whitespace-pre-line text-muted-foreground"
          />
        )}
      </div>
      <Slot
        name="people"
        as="ul"
        className={
          variant === "three-columns"
            ? "grid gap-10 sm:grid-cols-2 lg:grid-cols-3"
            : "grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
        }
      />
    </div>
  </Root>
);

export default defineBlock({
  type: "team-grid",
  version: 1,
  title: "Team grid",
  placement: "section",
  props,
  variants: ["three-columns", "four-columns"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: { people: { title: "People", accepts: ["team-member"] } },
  interactive: false,
  agent: {
    purpose: "The people behind something, such as staff, mentors or speakers, each with a role",
    avoid: ["a single person, who belongs in a split", "biographies longer than two sentences"],
  },
  placeholder,
  component: TeamGrid,
});

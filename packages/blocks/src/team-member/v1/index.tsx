import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Media, Root, Text } from "../../components.tsx";
import { media, optional, text } from "../../fields.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  photo: optional(media({ title: "Photo" })),
  name: text({ title: "Name", max: 80 }),
  role: text({ title: "Role", max: 80 }),
  bio: optional(text({ title: "About them", max: 240, multiline: true })),
};

const TeamMember = ({ props: member }: BlockComponentProps<typeof props, "default">) => (
  <Root as="li" className="flex flex-col gap-4">
    {member.photo && (
      <Media
        field="photo"
        value={member.photo}
        sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
        className="rounded-image aspect-square w-full object-cover"
      />
    )}
    <div className="flex flex-col gap-1">
      <Text field="name" as="h3" value={member.name} className="text-heading" />
      <Text field="role" as="p" value={member.role} className="text-body text-primary" />
    </div>
    {member.bio && (
      <Text
        field="bio"
        as="p"
        value={member.bio}
        className="text-body whitespace-pre-line text-muted-foreground"
      />
    )}
  </Root>
);

export default defineBlock({
  type: "team-member",
  version: 1,
  title: "Team member",
  placement: "item",
  props,
  variants: ["default"],
  agent: {
    purpose: "One person in a team grid: their name, their role, and a sentence or two about them",
    avoid: ["photos of anyone other than the person named"],
  },
  placeholder,
  component: TeamMember,
});

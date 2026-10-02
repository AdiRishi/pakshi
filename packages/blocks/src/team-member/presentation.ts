import type { Presentation } from "../presentation.ts";
import type teamMember from "./v2/index.tsx";

export default {
  name: "Team member",
  summary: "One person, with their role.",
  hint: "Use a photo of the person named. Without one, their initials show instead.",
  item: { singular: "team member", plural: "team members", titleField: "name" },
  variants: {
    default: {
      label: "Standard",
      description: "A photo, with their name, role and a sentence about them.",
    },
  },
  fields: {
    image: { hint: "A photo of this person" },
    name: { hint: "Their name" },
    role: { hint: "What they do" },
    bio: { hint: "A sentence or two" },
    link: { hint: "Their profile page, if they have one" },
  },
} satisfies Presentation<typeof teamMember>;

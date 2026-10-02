import type { Presentation } from "../presentation.ts";
import type teamMember from "./v1/index.tsx";

export default {
  name: "Team member",
  summary: "One person, with their role.",
  hint: "Use a photo of the person named, and a sentence or two about them.",
  item: { singular: "team member", plural: "team members", titleField: "name" },
  variants: {
    default: {
      label: "Standard",
      description: "A photo, with their name, role and a sentence about them.",
    },
  },
  fields: {
    name: { hint: "Their name" },
    role: { hint: "What they do" },
    bio: { hint: "A sentence or two" },
  },
} satisfies Presentation<typeof teamMember>;

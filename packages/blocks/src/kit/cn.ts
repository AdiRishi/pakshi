import type { CnFunction } from "cn";
import { createCn } from "cn/config";

/**
 * Joins class names and drops the earlier of two that conflict, as shadcn/ui's
 * `cn` does, knowing the theme's own type sizes, corners and shadow, so
 * `text-lead` overrides `text-sm` rather than a text color.
 */
export const cn: CnFunction = createCn({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["small", "body", "lead", "heading", "title", "display", "display-half", "jumbo"] },
      ],
      rounded: [{ rounded: ["button", "image"] }],
      shadow: [{ shadow: ["card"] }],
    },
  },
});

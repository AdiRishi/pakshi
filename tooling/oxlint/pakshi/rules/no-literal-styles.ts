import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { literalStyle } from "../../../../packages/tokens/src/theme-classes.ts";

const classNames = (value: string) => value.split(/\s+/).filter((name) => name !== "");

/** Ban colors, fonts and spacing that bypass the site's theme in block code. */
export const noLiteralStylesRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow literal colors, fonts and spacing in blocks; blocks style themselves only through theme tokens.",
    },
    messages: {
      literalClass: "{{reason}}.",
      styleAttribute: "Blocks don't set inline styles; use Tailwind's theme utilities.",
    },
  },
  createOnce(context) {
    const checkText = (node: ESTree.Node, text: string) => {
      for (const name of classNames(text)) {
        const reason = literalStyle(name);
        if (reason !== undefined)
          context.report({ node, messageId: "literalClass", data: { reason } });
      }
    };
    return {
      Literal(node) {
        // A string literal's source starts with its quote; numbers, booleans and patterns don't.
        const raw = node.raw ?? "";
        if (raw.startsWith('"') || raw.startsWith("'")) checkText(node, raw.slice(1, -1));
      },
      TemplateElement(node) {
        checkText(node, node.value.cooked ?? node.value.raw);
      },
      JSXAttribute(node) {
        if (node.name.type === "JSXIdentifier" && node.name.name === "style")
          context.report({ node, messageId: "styleAttribute" });
      },
    };
  },
});

import { eslintCompatPlugin } from "@oxlint/plugins";

import { noLiteralStylesRule } from "./rules/no-literal-styles.ts";

/** Pakshi's own lint rules. */
const pakshiPlugin = eslintCompatPlugin({
  meta: { name: "pakshi" },
  rules: {
    "no-literal-styles": noLiteralStylesRule,
  },
});

export default pakshiPlugin;

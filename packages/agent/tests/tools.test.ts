import { expect, test } from "vitest";

import { createPage, getPage } from "../src/tools.ts";

/** A tool's parameters as the model reads them. */
const forModel = (tool: typeof getPage | typeof createPage) =>
  JSON.stringify(tool.inputSchema["~standard"].jsonSchema.input({ target: "draft-07" }));

test("the model is told the format of the IDs and paths a tool takes", () => {
  expect(forModel(getPage)).toContain(String.raw`"pattern":"^pg_[A-Za-z0-9]{1,64}$"`);
  expect(forModel(createPage)).toContain(
    String.raw`"pattern":"^\\/([a-z0-9]+(-[a-z0-9]+)*(\\/[a-z0-9]+(-[a-z0-9]+)*)*)?$"`,
  );
});

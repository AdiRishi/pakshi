import { Tool } from "effect/ai";
import { expect, test } from "vitest";

import { CreatePage, GetPage } from "../src/tools.ts";

test("the model is told the format of the IDs and paths a tool takes", () => {
  expect(JSON.stringify(Tool.getJsonSchema(GetPage))).toContain(
    String.raw`"pattern":"^pg_[A-Za-z0-9]{1,64}$"`,
  );
  expect(JSON.stringify(Tool.getJsonSchema(CreatePage))).toContain(
    String.raw`"pattern":"^\\/([a-z0-9]+(-[a-z0-9]+)*(\\/[a-z0-9]+(-[a-z0-9]+)*)*)?$"`,
  );
});

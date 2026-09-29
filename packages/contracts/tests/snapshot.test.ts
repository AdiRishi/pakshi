import { expect, test } from "vitest";

import { contentHash } from "../src/snapshot.ts";

test("equal pages hash the same whatever their key order", async () => {
  const a = await contentHash({ id: "pg_home", meta: { title: "Home", description: "" } });
  const b = await contentHash({ meta: { description: "", title: "Home" }, id: "pg_home" });
  expect(a).toBe(b);
  expect(a).toMatch(/^[a-f0-9]{64}$/);
});

test("different pages hash differently", async () => {
  expect(await contentHash({ title: "Home" })).not.toBe(await contentHash({ title: "About" }));
});

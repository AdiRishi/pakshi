import { expect, test } from "vitest";

import { recipes } from "../src/recipes.ts";
import { loadBlocks } from "../src/render.tsx";

test("every recipe builds its pages from sections in the library", async () => {
  const types = Array.from(
    new Set(recipes.flatMap((recipe) => recipe.sections.map((s) => s.type))),
  );
  const contracts = await loadBlocks(Object.fromEntries(types.map((type) => [type, 1])));
  for (const recipe of recipes)
    for (const { type } of recipe.sections)
      expect(contracts.get(type)?.placement, `${recipe.id} uses ${type}`).toBe("section");
});

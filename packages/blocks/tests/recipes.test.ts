import { expect, test } from "vitest";

import { recipes } from "../src/recipes.ts";
import { latestLockfile, loadBlocks } from "../src/render.tsx";

test("every recipe builds its pages from sections in the library", async () => {
  const contracts = await loadBlocks(latestLockfile);
  for (const recipe of recipes)
    for (const { type } of recipe.sections)
      expect(contracts.get(type)?.placement, `${recipe.id} uses ${type}`).toBe("section");
});

import { expect, test } from "vitest";

import { blockFixtures, fixtureTree } from "../../src/fixtures.ts";
import { latestLockfile } from "../../src/render.tsx";
import { accessibilityViolations, show } from "./support.tsx";

const newest = blockFixtures.filter((entry) => latestLockfile[entry.type] === entry.version);

test.each(newest.map((entry) => [`${entry.type} ${entry.name}`, entry] as const))(
  "axe finds no WCAG 2.2 AA violations in %s",
  async (_name, entry) => {
    const screen = await show(fixtureTree(entry));
    expect(await accessibilityViolations(screen.container)).toEqual([]);
  },
);

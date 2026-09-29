import type { PageDocument } from "@repo/contracts/page";
import { Fragment } from "react";

import type { BlockDefinition } from "./block.tsx";
import { registry } from "./registry.gen.ts";

export const blockKey = (type: string, version: number) => `${type}@${version}`;

/** Loads the version of a block type that a lockfile pins. */
export const loadBlock = async (type: string, lockfile: Readonly<Record<string, number>>) => {
  const version = lockfile[type];
  if (version === undefined) throw new Error(`The lockfile pins no version of ${type}.`);
  const load = registry[blockKey(type, version)];
  if (load === undefined) throw new Error(`${blockKey(type, version)} is not in the registry.`);
  return (await load()).default;
};

/**
 * Renders a page's sections at the lockfile's block versions. A snapshot is
 * checked when it's frozen, so a block that doesn't render here is a bug.
 */
export const renderPage = async (
  page: PageDocument,
  lockfile: Readonly<Record<string, number>>,
) => {
  const types = new Set(Object.values(page.blocks).map((block) => block.type));
  const definitions = new Map<string, BlockDefinition>(
    await Promise.all(
      Array.from(types, async (type) => [type, await loadBlock(type, lockfile)] as const),
    ),
  );
  return page.root.map((id) => {
    const instance = page.blocks[id];
    const definition = definitions.get(instance?.type ?? "");
    if (instance === undefined || definition === undefined)
      throw new Error(`Section ${id} has no block to render.`);
    if (definition.placement !== "section")
      throw new Error(`Section ${id} is a ${definition.type}, which only goes inside a section.`);
    const result = definition.render(instance.props, instance.variant, instance.surface);
    if (!result.ok) throw new Error(`Section ${id} can't render: ${result.problem}`);
    return <Fragment key={id}>{result.element}</Fragment>;
  });
};

import type { BlockId, BlockType } from "@repo/contracts/ids";
import type { BlockInstance, PageDocument } from "@repo/contracts/page";
import type { SiteParts } from "@repo/contracts/site";
import type { Lockfile } from "@repo/contracts/snapshot";
import { Fragment } from "react";

import type { BlockDefinition } from "./block.tsx";
import { blockKey } from "./contract.ts";
import { registry } from "./registry.gen.ts";

/** Loads the version of a block type that a lockfile pins. */
export const loadBlock = async (type: BlockType, lockfile: Lockfile) => {
  const version = lockfile[type];
  if (version === undefined) throw new Error(`The lockfile pins no version of ${type}.`);
  const load = registry[blockKey(type, version)];
  if (load === undefined) throw new Error(`${blockKey(type, version)} is not in the registry.`);
  return (await load()).default;
};

/** Loads every block version a lockfile pins, keyed by block type. */
export const loadBlocks = async (lockfile: Lockfile) =>
  new Map<BlockType, BlockDefinition>(
    await Promise.all(
      Object.keys(lockfile).map(async (type) => [type, await loadBlock(type, lockfile)] as const),
    ),
  );

/**
 * Loads every version of each block type, from the oldest to the newest that
 * any of these lockfiles pins, keyed as the registry names them. Content can
 * migrate through them from any of the lockfiles to any other.
 */
export const loadBlockVersions = async (lockfiles: ReadonlyArray<Lockfile>) => {
  const ranges = new Map<BlockType, { readonly from: number; readonly to: number }>();
  for (const lockfile of lockfiles)
    for (const [type, version] of Object.entries(lockfile)) {
      const range = ranges.get(type);
      ranges.set(type, {
        from: Math.min(range?.from ?? version, version),
        to: Math.max(range?.to ?? version, version),
      });
    }
  const versions = Array.from(ranges).flatMap(([type, { from, to }]) =>
    Array.from({ length: to - from + 1 }, (_, index) => ({ type, version: from + index })),
  );
  return new Map<string, BlockDefinition>(
    await Promise.all(
      versions.map(
        async ({ type, version }) =>
          [blockKey(type, version), await loadBlock(type, { [type]: version })] as const,
      ),
    ),
  );
};

/**
 * Renders one placed block, with the items in its slots. Snapshots are checked
 * when they're frozen and drafts on every batch, so a block that doesn't
 * render here is a bug.
 */
export const renderBlock = (
  definitions: ReadonlyMap<BlockType, BlockDefinition>,
  blocks: Readonly<Record<BlockId, BlockInstance>>,
  id: BlockId,
) => {
  const instance = blocks[id];
  const definition = definitions.get(instance?.type ?? "");
  if (instance === undefined || definition === undefined)
    throw new Error(`Block ${id} has no block version to render.`);
  const slots = Object.fromEntries(
    Object.entries(instance.slots ?? {}).map(([slot, items]) => [
      slot,
      items.map((item) => renderBlock(definitions, blocks, item)),
    ]),
  );
  const result = definition.render({
    id,
    props: instance.props,
    variant: instance.variant,
    surface: instance.surface,
    slots,
  });
  if (!result.ok) throw new Error(`Block ${id} can't render: ${result.problem}`);
  return <Fragment key={id}>{result.element}</Fragment>;
};

/** Renders a page with the site's header and footer, at the lockfile's block versions. */
export const renderPage = async (page: PageDocument, parts: SiteParts, lockfile: Lockfile) => {
  const definitions = await loadBlocks(lockfile);
  return {
    header: renderBlock(definitions, parts.blocks, parts.header),
    sections: page.root.map((id) => renderBlock(definitions, page.blocks, id)),
    footer: renderBlock(definitions, parts.blocks, parts.footer),
  };
};

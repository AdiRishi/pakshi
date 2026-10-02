import { type BlockContract, presentations } from "@repo/blocks";
import { type ExampleSource, exampleValue } from "@repo/blocks/fixtures";
import type { BlockId } from "@repo/contracts/ids";
import type { Op, Target } from "@repo/contracts/ops";
import type { BlockInstance } from "@repo/contracts/page";

/*
 * A layout can need a part the block may leave out, as text over a photo
 * needs the photo. Choosing that layout turns the part on, and while it's
 * chosen the part can't be removed.
 */

/**
 * The optional parts a block's layout needs, by field name. Presentations
 * describe a type's newest version, so only the fields this version has count.
 */
export const neededParts = (contract: BlockContract, variant: string): ReadonlySet<string> =>
  new Set(
    (presentations.get(contract.type)?.needs[variant] ?? []).filter(
      (name) => name in contract.fields,
    ),
  );

/** Switches a block to a layout, turning on any part it needs with an example from `source`. */
export const chooseLayout = (input: {
  readonly contract: BlockContract;
  readonly target: Target;
  readonly block: BlockId;
  readonly instance: BlockInstance;
  readonly variant: string;
  readonly source: ExampleSource;
}): ReadonlyArray<Op> => {
  const { contract, target, block, instance, variant, source } = input;
  const missing = Array.from(neededParts(contract, variant)).filter(
    (name) => instance.props[name] === undefined,
  );
  return [
    { op: "setVariant", target, block, variant },
    ...missing.map((name): Op => ({
      op: "setProp",
      target,
      block,
      path: [name],
      value: exampleValue(contract, [name], source),
    })),
  ];
};

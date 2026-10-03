import type { BlockId, BlockType } from "@repo/contracts/ids";
import type { CollectionKind } from "@repo/contracts/page";
import type { Surface } from "@repo/tokens";
import { Schema } from "effect";
import type { Json } from "effect/Schema";
import { type ComponentType, createContext, type ReactElement, useContext } from "react";

import { type BlockContract, BlockFixture, type Placement } from "./contract.ts";
import { type Fields, propsSchema, type PropsOf } from "./fields.ts";
import { labelledFields, presentationOf } from "./presentation.ts";

export interface BlockComponentProps<F extends Fields, Variant extends string> {
  readonly props: PropsOf<F>;
  readonly variant: Variant;
}

/**
 * A placement as a block definition gives it. Its placeholder is the JSON of
 * its `fixtures/placeholder.json`, which `defineBlock` decodes. A section
 * names `entryOf` only when it belongs on entries of one kind.
 */
type PlacementSpec<P extends Placement = Placement> = P extends {
  readonly placement: "section";
}
  ? Omit<P, "placeholder" | "entryOf"> & {
      readonly placeholder: unknown;
      readonly entryOf?: CollectionKind;
    }
  : P extends { readonly placeholder: BlockFixture }
    ? Omit<P, "placeholder"> & { readonly placeholder: unknown }
    : P;

type BlockSpec<
  F extends Fields,
  Variant extends string,
  P extends Placement["placement"],
> = PlacementSpec & {
  readonly placement: P;
  readonly type: BlockType;
  readonly version: number;
  /**
   * The name the version was released with. Studio and the agent call a block
   * by its type's presentation name instead, so it can change after release.
   */
  readonly title: string;
  readonly props: F;
  readonly variants: readonly [Variant, ...Array<Variant>];
  readonly agent: BlockContract["agent"];
  readonly migrate?: NonNullable<BlockContract["migrate"]>;
  /** The previous version's variants this version renames, and what it calls each now. */
  readonly renamedVariants?: Readonly<Record<string, Variant>>;
  readonly changes?: NonNullable<BlockContract["changes"]>;
  /** Whether the block runs in the visitor's browser; false when left out. */
  readonly interactive?: boolean;
  readonly component: ComponentType<BlockComponentProps<F, Variant>>;
};

/** A placed block, with its slots' items already rendered. */
export interface RenderInput {
  readonly id: BlockId;
  readonly props: Readonly<Record<string, Json>>;
  readonly variant: string;
  readonly surface: Surface | undefined;
  readonly slots: Readonly<Record<string, ReadonlyArray<ReactElement>>>;
}

export type RenderResult =
  | { readonly ok: true; readonly element: ReactElement }
  | { readonly ok: false; readonly problem: string };

/** One released block version, with the generics erased so a registry can hold any of them. */
export type BlockDefinition = BlockContract & {
  /**
   * Checks stored props against this version's draft schemas and renders
   * them. Drafts may be incomplete, and the canvas still shows them.
   */
  readonly render: (block: RenderInput) => RenderResult;
};

declare const declared: unique symbol;

/**
 * A block version as `defineBlock` returns it. The registry erases it to a
 * `BlockDefinition`, but a version folder's default export keeps the types of
 * its fields, variants and placement, which `Declared` reads, so its type's
 * presentation and sample are checked against them.
 */
export type DefinedBlock<
  F extends Fields,
  Variant extends string,
  P extends Placement["placement"],
> = BlockDefinition & {
  readonly [declared]?: { readonly fields: F; readonly variant: Variant; readonly placement: P };
};

/** The fields, variants and placement a block version declared to `defineBlock`. */
export type Declared<D extends DefinedBlock<Fields, string, Placement["placement"]>> = NonNullable<
  D[typeof declared]
>;

interface BlockFrame {
  readonly id: BlockId;
  readonly fields: Fields;
  readonly surface: Surface | undefined;
  readonly slots: RenderInput["slots"];
}

const BlockFrameContext = createContext<BlockFrame | null>(null);

export const useBlockFrame = () => {
  const frame = useContext(BlockFrameContext);
  if (frame === null) throw new Error("Field components render only inside a block.");
  return frame;
};

const decodeFixture = Schema.decodeUnknownSync(BlockFixture);

const contractOf = <F extends Fields, Variant extends string, P extends Placement["placement"]>(
  spec: BlockSpec<F, Variant, P>,
): BlockContract => {
  const presentation = presentationOf(spec.type);
  const common = {
    type: spec.type,
    version: spec.version,
    title: presentation.name,
    fields: labelledFields(spec.props, presentation),
    variants: spec.variants,
    agent: spec.agent,
    migrate: spec.migrate ?? null,
    renamedVariants: spec.renamedVariants ?? {},
    changes: spec.changes ?? null,
    interactive: spec.interactive ?? false,
  };
  const placed: PlacementSpec = spec;
  switch (placed.placement) {
    case "section":
      return {
        ...common,
        placement: "section",
        surfaces: placed.surfaces,
        slots: placed.slots,
        entryOf: placed.entryOf ?? null,
        placeholder: decodeFixture(placed.placeholder),
      };
    case "item":
      return { ...common, placement: "item", placeholder: decodeFixture(placed.placeholder) };
    case "header":
    case "footer":
      return { ...common, placement: placed.placement, surfaces: placed.surfaces };
  }
};

export const defineBlock = <
  const F extends Fields,
  const Variant extends string,
  const P extends Placement["placement"],
>(
  spec: BlockSpec<F, Variant, P>,
): DefinedBlock<F, Variant, P> => {
  const decode = Schema.decodeUnknownExit(propsSchema(spec.props, "draft"));
  const Component = spec.component;
  const contract = contractOf(spec);
  return {
    ...contract,
    render: (block) => {
      const decoded = decode(block.props, { errors: "all" });
      if (decoded._tag === "Failure") return { ok: false, problem: String(decoded.cause) };
      const variant = spec.variants.find((candidate) => candidate === block.variant);
      if (variant === undefined) return { ok: false, problem: `No variant named ${block.variant}` };
      if (
        block.surface !== undefined &&
        (contract.placement === "item" ||
          !contract.surfaces.some((allowed) => allowed === block.surface))
      )
        return { ok: false, problem: `No surface named ${block.surface}` };
      return {
        ok: true,
        element: (
          <BlockFrameContext.Provider
            value={{
              id: block.id,
              fields: contract.fields,
              surface: block.surface,
              slots: block.slots,
            }}
          >
            <Component props={decoded.value} variant={variant} />
          </BlockFrameContext.Provider>
        ),
      };
    },
  };
};

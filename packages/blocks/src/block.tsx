import type { BlockId, BlockType } from "@repo/contracts/ids";
import type { Surface } from "@repo/tokens";
import { Schema } from "effect";
import type { Json } from "effect/Schema";
import { type ComponentType, createContext, type ReactElement, useContext } from "react";

import type { BlockContract, Placement } from "./contract.ts";
import { type Fields, propsSchema, type PropsOf } from "./fields.ts";

export interface BlockComponentProps<F extends Fields, Variant extends string> {
  readonly props: PropsOf<F>;
  readonly variant: Variant;
}

type BlockSpec<F extends Fields, Variant extends string> = Placement & {
  readonly type: BlockType;
  readonly version: number;
  readonly title: string;
  readonly props: F;
  readonly variants: readonly [Variant, ...Array<Variant>];
  readonly agent: BlockContract["agent"];
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

const contractOf = <F extends Fields, Variant extends string>(
  spec: BlockSpec<F, Variant>,
): BlockContract => {
  const common = {
    type: spec.type,
    version: spec.version,
    title: spec.title,
    fields: spec.props,
    variants: spec.variants,
    agent: spec.agent,
  };
  switch (spec.placement) {
    case "section":
      return {
        ...common,
        placement: "section",
        surfaces: spec.surfaces,
        slots: spec.slots,
        interactive: spec.interactive,
      };
    case "item":
      return { ...common, placement: "item" };
    case "header":
    case "footer":
      return { ...common, placement: spec.placement, surfaces: spec.surfaces };
  }
};

export const defineBlock = <const F extends Fields, const Variant extends string>(
  spec: BlockSpec<F, Variant>,
): BlockDefinition => {
  const decode = Schema.decodeUnknownExit(propsSchema(spec.props, "draft"));
  const Component = spec.component;
  return {
    ...contractOf(spec),
    render: (block) => {
      const decoded = decode(block.props, { errors: "all" });
      if (decoded._tag === "Failure") return { ok: false, problem: String(decoded.cause) };
      const variant = spec.variants.find((candidate) => candidate === block.variant);
      if (variant === undefined) return { ok: false, problem: `No variant named ${block.variant}` };
      if (
        block.surface !== undefined &&
        (spec.placement === "item" || !spec.surfaces.some((allowed) => allowed === block.surface))
      )
        return { ok: false, problem: `No surface named ${block.surface}` };
      return {
        ok: true,
        element: (
          <BlockFrameContext.Provider
            value={{ id: block.id, fields: spec.props, surface: block.surface, slots: block.slots }}
          >
            <Component props={decoded.value} variant={variant} />
          </BlockFrameContext.Provider>
        ),
      };
    },
  };
};

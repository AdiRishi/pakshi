import type { Surface } from "@repo/tokens";
import { Schema } from "effect";
import type { Json } from "effect/Schema";
import { type ComponentType, createContext, type ReactElement, useContext } from "react";

import type { Fields, PropsOf } from "./fields.ts";

export interface BlockComponentProps<F extends Fields, Variant extends string> {
  readonly props: PropsOf<F>;
  readonly variant: Variant;
}

interface BlockSpec<F extends Fields, Variant extends string, S extends Surface> {
  readonly type: string;
  readonly version: number;
  readonly title: string;
  /** Sections sit at the top of a page; items sit in a section's slot. */
  readonly placement: "section" | "item";
  readonly props: F;
  readonly variants: readonly [Variant, ...Array<Variant>];
  readonly surfaces: readonly [S, ...Array<S>];
  readonly interactive: boolean;
  readonly agent: { readonly purpose: string; readonly avoid?: ReadonlyArray<string> };
  readonly component: ComponentType<BlockComponentProps<F, Variant>>;
}

export type RenderResult =
  | { readonly ok: true; readonly element: ReactElement }
  | { readonly ok: false; readonly problem: string };

/** One released block version, with the generics erased so a registry can hold any of them. */
export interface BlockDefinition {
  readonly type: string;
  readonly version: number;
  readonly title: string;
  readonly placement: "section" | "item";
  readonly fields: Fields;
  readonly variants: ReadonlyArray<string>;
  readonly surfaces: ReadonlyArray<Surface>;
  readonly interactive: boolean;
  readonly agent: BlockSpec<Fields, string, Surface>["agent"];
  /** Checks stored props and a variant against this version, and renders them. */
  readonly render: (
    props: Readonly<Record<string, Json>>,
    variant: string,
    surface: Surface | undefined,
  ) => RenderResult;
}

interface BlockFrame {
  readonly fields: Fields;
  readonly surface: Surface | undefined;
}

const BlockFrameContext = createContext<BlockFrame | null>(null);

export const useBlockFrame = () => {
  const frame = useContext(BlockFrameContext);
  if (frame === null) throw new Error("Field components render only inside a block.");
  return frame;
};

export const defineBlock = <
  const F extends Fields,
  const Variant extends string,
  const S extends Surface,
>(
  spec: BlockSpec<F, Variant, S>,
): BlockDefinition => {
  const schema = Schema.Struct(
    Object.fromEntries(
      Object.entries(spec.props).map(([name, field]) => [
        name,
        field.optional ? Schema.optionalKey(field.schema) : field.schema,
      ]),
    ),
  );
  const decode = Schema.decodeUnknownExit(schema);
  const Component = spec.component;
  return {
    type: spec.type,
    version: spec.version,
    title: spec.title,
    placement: spec.placement,
    fields: spec.props,
    variants: spec.variants,
    surfaces: spec.surfaces,
    interactive: spec.interactive,
    agent: spec.agent,
    render: (props, variant, surface) => {
      const decoded = decode(props, { errors: "all" });
      if (decoded._tag === "Failure") return { ok: false, problem: String(decoded.cause) };
      const chosen = spec.variants.find((candidate) => candidate === variant);
      if (chosen === undefined) return { ok: false, problem: `No variant named ${variant}` };
      if (surface !== undefined && !spec.surfaces.some((allowed) => allowed === surface))
        return { ok: false, problem: `No surface named ${surface}` };
      return {
        ok: true,
        element: (
          <BlockFrameContext.Provider value={{ fields: spec.props, surface }}>
            <Component
              // SAFETY: the schema is built field by field from `spec.props`, so
              // a successful decode has exactly the type PropsOf<F> describes.
              props={decoded.value as PropsOf<F>}
              variant={chosen}
            />
          </BlockFrameContext.Provider>
        ),
      };
    },
  };
};
